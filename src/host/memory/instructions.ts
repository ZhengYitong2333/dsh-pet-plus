/**
 * L3 指令层：用户手写的长期约定。
 *
 * 文件格式（frontmatter 可选）：
 *   ---
 *   version: 3
 *   updatedAt: 2026-10-29T...
 *   ---
 *   正文……
 *
 * 语义：**只由用户写**；自动提炼永不修改。每次保存 version+1，PUT 可带 expectedVersion
 * 做乐观锁（多端同时编辑不静默覆盖）。
 */
import { existsSync, statSync } from 'node:fs';
import type { InstructionSnapshot } from './types';
import { backupFile, readTextFile, writeTextAtomic } from './store.ts';

const MAX_BODY_CHARS = 8000;
const EMPTY: InstructionSnapshot = { text: '', version: 0, updatedAt: '' };

interface Parsed {
  version: number;
  updatedAt: string;
  text: string;
}

function parse(raw: string): Parsed {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    const text = raw.trim();
    return { version: text ? 1 : 0, updatedAt: '', text };
  }
  const meta = match[1];
  const body = match[2].replace(/^\s*\n/, '').trimEnd();
  const version = Number(/^version:\s*(\d+)/m.exec(meta)?.[1] ?? 1);
  const updatedAt = /^updatedAt:\s*(.+)$/m.exec(meta)?.[1]?.trim() ?? '';
  return {
    version: Number.isFinite(version) && version >= 0 ? version : 1,
    updatedAt,
    text: body,
  };
}

function serialize(snapshot: InstructionSnapshot): string {
  return [
    '---',
    `version: ${snapshot.version}`,
    `updatedAt: ${snapshot.updatedAt}`,
    '---',
    '',
    snapshot.text,
    '',
  ].join('\n');
}

export class InstructionsStore {
  private cache: InstructionSnapshot | null = null;
  private mtimeMs = 0;

  private readonly file: string;
  private readonly backupsDir: string;
  private readonly clock: () => Date;

  constructor(file: string, backupsDir: string, clock: () => Date = () => new Date()) {
    this.file = file;
    this.backupsDir = backupsDir;
    this.clock = clock;
  }

  /** 读取（带 mtime 缓存；外部手改文件也能在下次读取时发现）。 */
  read(): InstructionSnapshot {
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(this.file).mtimeMs;
    } catch {
      this.cache = { ...EMPTY };
      this.mtimeMs = 0;
      return this.cache;
    }
    if (this.cache !== null && mtimeMs === this.mtimeMs) return this.cache;
    let raw: string;
    try {
      raw = readTextFile(this.file);
    } catch (error) {
      console.warn('[dsh-pet-plus] 读取 instructions.md 失败：' + String(error));
      return this.cache ?? { ...EMPTY };
    }
    const parsed = parse(raw);
    this.cache = { text: parsed.text, version: parsed.version, updatedAt: parsed.updatedAt };
    this.mtimeMs = mtimeMs;
    return this.cache;
  }

  /** 保存；expectedVersion 不匹配返回 conflict（不写盘）。 */
  save(
    text: string,
    expectedVersion?: number,
  ):
    | { ok: true; snapshot: InstructionSnapshot }
    | { ok: false; reason: 'conflict' | 'invalid'; current?: InstructionSnapshot } {
    const body = String(text ?? '')
      .replace(/\r\n/g, '\n')
      .slice(0, MAX_BODY_CHARS)
      .trim();
    const current = this.read();
    if (
      expectedVersion !== undefined &&
      Number.isFinite(expectedVersion) &&
      Number(expectedVersion) !== current.version
    ) {
      return { ok: false, reason: 'conflict', current };
    }
    if (body === '') {
      return { ok: false, reason: 'invalid', current };
    }
    // 覆盖前留一份快照，误删可恢复
    backupFile(this.file, this.backupsDir);
    const snapshot: InstructionSnapshot = {
      text: body,
      version: current.version + 1,
      updatedAt: this.clock().toISOString(),
    };
    writeTextAtomic(this.file, serialize(snapshot));
    this.cache = snapshot;
    try {
      this.mtimeMs = statSync(this.file).mtimeMs;
    } catch {
      this.mtimeMs = 0;
    }
    return { ok: true, snapshot };
  }

  /** 清空正文（保留版本递增，便于审计）。 */
  clear(expectedVersion?: number):
    | { ok: true; snapshot: InstructionSnapshot }
    | { ok: false; reason: 'conflict'; current?: InstructionSnapshot } {
    const current = this.read();
    if (
      expectedVersion !== undefined &&
      Number.isFinite(expectedVersion) &&
      Number(expectedVersion) !== current.version
    ) {
      return { ok: false, reason: 'conflict', current };
    }
    backupFile(this.file, this.backupsDir);
    const snapshot: InstructionSnapshot = {
      text: '',
      version: current.version + 1,
      updatedAt: this.clock().toISOString(),
    };
    // 空正文也要落盘（否则 read 会把缺失当成 version 0，乐观锁会漂）
    writeTextAtomic(this.file, serialize(snapshot));
    this.cache = snapshot;
    try {
      this.mtimeMs = statSync(this.file).mtimeMs;
    } catch {
      this.mtimeMs = 0;
    }
    return { ok: true, snapshot };
  }

  /** 是否已存在文件（设置页展示用）。 */
  exists(): boolean {
    return existsSync(this.file);
  }
}
