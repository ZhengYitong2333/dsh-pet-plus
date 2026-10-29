/**
 * L0：DSH 会话轨迹的只读适配器。
 *
 * 不复制 DSH 的 JSONL，只通过 `ctx.sessionQuery`（会话搜索，默认关闭，可能不存在）检索：
 *  - searchSessions：跨会话全文检索，返回最强命中片段；
 *  - readSession：读某个会话的原始事件，抽取 user/assistant 文本。
 *
 * 授权：service 层不校验工作区，本模块按 `header.cwd` 只放行**当前工作目录**的会话；
 * 结果统一限条数/字数；400ms 超时，超时降级为不可用，绝不让召回拖住回复。
 */
import { resolve } from 'node:path';

/** 只依赖实际用到的两个方法，避免把 DSH 内部类型硬编码进插件。 */
export interface SessionQueryLike {
  searchSessions(
    request: { query: string; limit?: number },
    exec?: { signal?: AbortSignal },
  ): Promise<{ items: readonly unknown[] }>;
  readSession(sessionId: string): Promise<{ session?: { header?: { cwd?: string } }; events?: readonly unknown[] }>;
}

export interface SessionHit {
  sessionId: string;
  time: number;
  snippet: string;
}

export type SessionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'unavailable' | 'timeout' | 'error'; message?: string };

const DEFAULT_TIMEOUT_MS = 400;

function headerOf(item: unknown): { id?: string; cwd?: string } {
  const record = item as { header?: { id?: unknown; cwd?: unknown } } | null;
  return {
    id: typeof record?.header?.id === 'string' ? record.header.id : undefined,
    cwd: typeof record?.header?.cwd === 'string' ? record.header.cwd : undefined,
  };
}

function bestMatchOf(item: unknown): { snippet?: string; time?: number } {
  const hit = (item as { bestMatch?: { snippet?: unknown; time?: unknown } } | null)?.bestMatch;
  return {
    snippet: typeof hit?.snippet === 'string' ? hit.snippet : undefined,
    time: typeof hit?.time === 'number' ? hit.time : undefined,
  };
}

function textOfData(data: unknown): string {
  const d = data as { content?: unknown; text?: unknown } | null;
  if (!d) return '';
  if (typeof d.text === 'string') return d.text;
  if (typeof d.content === 'string') return d.content;
  if (Array.isArray(d.content)) {
    return d.content
      .map((block) => {
        const b = block as { type?: unknown; text?: unknown };
        return b.type === 'text' && typeof b.text === 'string' ? b.text : '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function truncate(text: string, limit: number): string {
  const chars = Array.from(text);
  return chars.length <= limit ? text : chars.slice(0, limit - 1).join('') + '…';
}

export class SessionRecall {
  private readonly getQuery: () => SessionQueryLike | undefined;
  private readonly cwd: () => string;
  private readonly timeoutMs: number;

  constructor(
    getQuery: () => SessionQueryLike | undefined,
    options: { cwd?: () => string; timeoutMs?: number } = {},
  ) {
    this.getQuery = getQuery;
    this.cwd = options.cwd ?? (() => process.cwd());
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  available(): boolean {
    return this.getQuery() !== undefined;
  }

  /** 跨会话检索；只保留当前工作目录的会话，返回 ≤limit 条。 */
  async search(query: string, limit = 3): Promise<SessionResult<SessionHit[]>> {
    const q = this.getQuery();
    if (!q) return { ok: false, reason: 'unavailable' };
    const text = String(query ?? '').trim();
    if (text === '') return { ok: true, value: [] };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const page = await q.searchSessions(
        { query: text, limit: Math.max(1, Math.min(10, limit * 3)) },
        { signal: controller.signal },
      );
      const mine = resolve(this.cwd());
      const hits: SessionHit[] = [];
      for (const item of page.items ?? []) {
        const header = headerOf(item);
        if (!header.id || !header.cwd) continue;
        if (resolve(header.cwd) !== mine) continue;
        const match = bestMatchOf(item);
        hits.push({
          sessionId: header.id,
          time: match.time ?? 0,
          snippet: truncate(match.snippet ?? '', 200),
        });
        if (hits.length >= limit) break;
      }
      return { ok: true, value: hits };
    } catch (error) {
      if (controller.signal.aborted) return { ok: false, reason: 'timeout' };
      return {
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** 读一个会话的 user/assistant 文本摘录（≤maxChars）。 */
  async read(sessionId: string, maxChars = 800): Promise<SessionResult<string>> {
    const q = this.getQuery();
    if (!q) return { ok: false, reason: 'unavailable' };
    const id = String(sessionId ?? '').trim();
    if (id === '') return { ok: false, reason: 'error', message: 'sessionId 为空' };
    try {
      const snap = await q.readSession(id);
      const cwd = snap.session?.header?.cwd;
      if (!cwd || resolve(cwd) !== resolve(this.cwd())) {
        return { ok: false, reason: 'error', message: '会话不在当前工作区' };
      }
      const parts: string[] = [];
      for (const raw of snap.events ?? []) {
        const event = raw as { type?: unknown; data?: unknown };
        if (event.type !== 'user/message' && event.type !== 'assistant/message') continue;
        const text = textOfData(event.data).trim();
        if (text) parts.push((event.type === 'user/message' ? '用户：' : '助手：') + text);
      }
      return { ok: true, value: truncate(parts.join('\n'), Math.max(100, maxChars)) };
    } catch (error) {
      return {
        ok: false,
        reason: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createSessionRecall(
  getQuery: () => SessionQueryLike | undefined,
  options?: { cwd?: () => string; timeoutMs?: number },
): SessionRecall {
  return new SessionRecall(getQuery, options);
}
