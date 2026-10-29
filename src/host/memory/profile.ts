/**
 * L2 长期记忆：条目 CRUD、去重、取代、墓碑、容量淘汰。
 *
 * 存储：`profile.json`（单文件快照 + 墓碑表）。所有写操作走跨进程锁 + 原子替换；
 * 读失败时放弃写（绝不把空快照盖回盘上）。墓碑只用于“用户明确删除”，容量淘汰不写墓碑。
 */
import { createHash, randomBytes } from 'node:crypto';
import { statSync } from 'node:fs';
import type { MemoryLayer, ProfileEntry } from './types';
import { readJsonFile, writeJsonAtomic, withFileLock } from './store.ts';
import { extractKeywords, recallEntries, renderIndex, tokenize } from './recall.ts';

const MAX_ENTRIES = 200;
const MAX_TOTAL_CHARS = 8000;
const MAX_ENTRY_CHARS = 500;
const TOMBSTONE_DAYS = 90;
const LAYERS: readonly MemoryLayer[] = ['user', 'fact', 'lesson', 'topic'];

interface Tombstone {
  hash: string;
  until: number;
  reason: 'forget' | 'clear';
}

interface ProfileState {
  version: 1;
  entries: ProfileEntry[];
  tombstones: Tombstone[];
  updatedAt: number;
}

export interface ProfileOp {
  op: 'ADD' | 'UPDATE' | 'FORGET';
  text: string;
  layer?: MemoryLayer;
  keywords?: string[];
  importance?: number;
  supersedes?: string;
}

export interface ProfileInput {
  text: string;
  layer?: MemoryLayer;
  keywords?: string[];
  importance?: number;
  source?: ProfileEntry['source'];
}

function empty(): ProfileState {
  return { version: 1, entries: [], tombstones: [], updatedAt: Date.now() };
}

function normalize(text: string): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function hashOf(text: string): string {
  return createHash('sha256').update(normalize(text)).digest('hex').slice(0, 24);
}

function layerOf(value: unknown): MemoryLayer {
  return LAYERS.includes(value as MemoryLayer) ? (value as MemoryLayer) : 'fact';
}

export class ProfileStore {
  private readonly file: string;
  private readonly backupsDir: string;
  private readonly clock: () => Date;
  private cache: ProfileState | null = null;
  private cacheMtime = 0;

  constructor(file: string, backupsDir: string, clock: () => Date = () => new Date()) {
    this.file = file;
    this.backupsDir = backupsDir;
    this.clock = clock;
  }

  private load(): ProfileState {
    try {
      const mtime = statSync(this.file).mtimeMs;
      if (this.cache !== null && mtime === this.cacheMtime) return this.cache;
      this.cacheMtime = mtime;
    } catch {
      this.cache = empty();
      this.cacheMtime = 0;
      return this.cache;
    }
    const read = readJsonFile<ProfileState>(this.file, empty());
    if (!read.ok || !read.value) throw new Error(read.error ?? 'profile 读取失败');
    const state = read.value;
    this.cache = {
      version: 1,
      entries: Array.isArray(state.entries) ? state.entries : [],
      tombstones: Array.isArray(state.tombstones) ? state.tombstones : [],
      updatedAt: Number(state.updatedAt) || 0,
    };
    return this.cache;
  }

  private tombstoned(state: ProfileState, text: string): boolean {
    const hash = hashOf(text);
    const now = this.clock().getTime();
    return state.tombstones.some((t) => t.hash === hash && t.until > now);
  }

  private addTombstone(state: ProfileState, text: string, reason: Tombstone['reason']): void {
    const hash = hashOf(text);
    const now = this.clock().getTime();
    state.tombstones = state.tombstones.filter((t) => t.hash !== hash);
    state.tombstones.push({ hash, until: now + TOMBSTONE_DAYS * 86_400_000, reason });
    // 墓碑表本身也有上限，避免无限增长
    if (state.tombstones.length > 500) state.tombstones = state.tombstones.slice(-500);
  }

  private enforceLimits(state: ProfileState): void {
    const total = () => state.entries.reduce((sum, e) => sum + Array.from(e.text).length, 0);
    while (state.entries.length > MAX_ENTRIES || total() > MAX_TOTAL_CHARS) {
      const candidates = state.entries.filter((e) => !(e.layer === 'user' && e.source === 'manual'));
      const pool = candidates.length > 0 ? candidates : state.entries;
      if (pool.length === 0) break;
      pool.sort((a, b) => a.hits - b.hits || a.createdAt - b.createdAt);
      const victim = pool[0];
      state.entries = state.entries.filter((e) => e.id !== victim.id);
    }
  }

  private upsert(
    state: ProfileState,
    input: ProfileInput,
    now: number,
  ): { entry: ProfileEntry; created: boolean } | undefined {
    const text = String(input.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_CHARS);
    if (text === '') return undefined;
    if (this.tombstoned(state, text)) return undefined;
    const manual = input.source === 'manual';
    const found = state.entries.find((e) => normalize(e.text) === normalize(text));
    if (found) {
      found.hits += 1;
      if (manual) {
        found.updatedAt = now;
        found.layer = layerOf(input.layer ?? found.layer);
        const importance = Number(input.importance);
        found.importance = Number.isFinite(importance)
          ? Math.max(0, Math.min(5, importance))
          : found.importance;
        found.archived = false;
        found.rev += 1;
      }
      return { entry: found, created: false };
    }
    const entry: ProfileEntry = {
      id: 'm_' + randomBytes(6).toString('hex'),
      text,
      layer: layerOf(input.layer),
      keywords: (input.keywords?.length ? input.keywords : extractKeywords(text)).slice(0, 48),
      importance: Number.isFinite(Number(input.importance))
        ? Math.max(0, Math.min(5, Number(input.importance)))
        : manual
          ? 4
          : 3,
      source: input.source ?? 'manual',
      hits: 1,
      lastHitAt: now,
      createdAt: now,
      updatedAt: now,
      archived: false,
      supersededBy: null,
      rev: 1,
    };
    state.entries.unshift(entry);
    this.enforceLimits(state);
    return { entry, created: true };
  }

  async add(input: ProfileInput): Promise<{ entry: ProfileEntry; created: boolean } | undefined> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const result = this.upsert(state, input, this.clock().getTime());
      if (!result) return undefined;
      state.updatedAt = this.clock().getTime();
      writeJsonAtomic(this.file, state);
      return result;
    });
  }

  async applyOps(
    ops: readonly ProfileOp[],
    source: ProfileEntry['source'] = 'auto',
  ): Promise<{ applied: number; entries: ProfileEntry[] }> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const now = this.clock().getTime();
      let applied = 0;
      const touched: ProfileEntry[] = [];
      for (const op of ops) {
        const text = String(op.text ?? '').trim();
        if (text === '') continue;
        if (op.op === 'FORGET') {
          const target = state.entries.find((e) => normalize(e.text) === normalize(text));
          if (target) {
            target.archived = true;
            this.addTombstone(state, target.text, 'forget');
            touched.push(target);
            applied += 1;
          }
          continue;
        }
        const oldEntry =
          op.op === 'UPDATE' && op.supersedes
            ? state.entries.find(
                (e) => e.id === op.supersedes || normalize(e.text) === normalize(op.supersedes!),
              )
            : undefined;
        if (oldEntry) oldEntry.archived = true;
        const result = this.upsert(
          state,
          {
            text,
            layer: op.layer,
            keywords: op.keywords,
            importance: op.importance,
            source,
          },
          now,
        );
        if (!result) continue;
        if (oldEntry && result.created) oldEntry.supersededBy = result.entry.id;
        touched.push(result.entry);
        applied += 1;
      }
      state.updatedAt = now;
      if (applied > 0) writeJsonAtomic(this.file, state);
      return { applied, entries: touched };
    });
  }

  list(options: { includeArchived?: boolean; query?: string } = {}): ProfileEntry[] {
    const state = this.load();
    return state.entries
      .filter((e) => options.includeArchived === true || !e.archived)
      .filter((e) => {
        if (!options.query?.trim()) return true;
        const q = options.query.toLowerCase();
        return e.text.toLowerCase().includes(q) || e.keywords.some((k) => k.includes(q));
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async update(
    id: string,
    patch: { text?: string; layer?: MemoryLayer; importance?: number; archived?: boolean },
    expectedRev?: number,
  ): Promise<{ ok: true; entry: ProfileEntry } | { ok: false; reason: 'not-found' | 'conflict' }> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return { ok: false, reason: 'not-found' as const };
      if (expectedRev !== undefined && expectedRev !== entry.rev) {
        return { ok: false, reason: 'conflict' as const };
      }
      if (typeof patch.text === 'string' && patch.text.trim() !== '') {
        entry.text = patch.text.replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_CHARS);
        entry.keywords = extractKeywords(entry.text);
      }
      if (patch.layer) entry.layer = layerOf(patch.layer);
      if (patch.importance !== undefined && Number.isFinite(Number(patch.importance))) {
        entry.importance = Math.max(0, Math.min(5, Number(patch.importance)));
      }
      if (patch.archived !== undefined) entry.archived = Boolean(patch.archived);
      entry.updatedAt = this.clock().getTime();
      entry.rev += 1;
      state.updatedAt = entry.updatedAt;
      writeJsonAtomic(this.file, state);
      return { ok: true as const, entry };
    });
  }

  async forget(id: string): Promise<boolean> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return false;
      entry.archived = true;
      entry.updatedAt = this.clock().getTime();
      entry.rev += 1;
      this.addTombstone(state, entry.text, 'forget');
      writeJsonAtomic(this.file, state);
      return true;
    });
  }

  async restore(id: string): Promise<boolean> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const entry = state.entries.find((e) => e.id === id);
      if (!entry) return false;
      entry.archived = false;
      entry.updatedAt = this.clock().getTime();
      entry.rev += 1;
      writeJsonAtomic(this.file, state);
      return true;
    });
  }

  async clear(): Promise<void> {
    await withFileLock(this.file, () => {
      const state = this.load();
      for (const entry of state.entries) this.addTombstone(state, entry.text, 'clear');
      state.entries = [];
      state.updatedAt = this.clock().getTime();
      writeJsonAtomic(this.file, state);
    });
  }

  renderIndex(charLimit: number): string {
    return renderIndex(this.load().entries, charLimit);
  }

  search(query: string, limit = 3): ProfileEntry[] {
    const state = this.load();
    return recallEntries(state.entries, query, { limit, now: this.clock().getTime() });
  }

  count(): { active: number; archived: number; tombstoned: number } {
    const state = this.load();
    const now = this.clock().getTime();
    return {
      active: state.entries.filter((e) => !e.archived).length,
      archived: state.entries.filter((e) => e.archived).length,
      tombstoned: state.tombstones.filter((t) => t.until > now).length,
    };
  }

  /** 测试/调试用：返回分词结果。 */
  tokens(text: string): string[] {
    return tokenize(text);
  }
}
