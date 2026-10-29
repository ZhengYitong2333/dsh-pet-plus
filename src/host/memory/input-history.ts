/**
 * 输入历史（L2 auto-input 的原料）：只记录用户真实输入，脱敏后环形保存。
 *
 * 语义：
 *  - 只收 `source.kind === 'user'` 的消息（agent 注入 / skill / 文件通知不算）；
 *  - 每条截 500 字，最多 200 条 / 7 天；
 *  - key/secret/token/长 hex 一律替换为 ***；
 *  - 默认开启，设置页可关闭并清空。
 */
import type { InputHistorySettings } from './types';
import { readJsonFile, writeJsonAtomic } from './store.ts';

export interface InputPrompt {
  ts: number;
  sessionId: string;
  text: string;
}

interface InputHistoryState {
  version: 1;
  prompts: InputPrompt[];
  stats: { seen: number; lastExtractAt: number };
}

function empty(): InputHistoryState {
  return { version: 1, prompts: [], stats: { seen: 0, lastExtractAt: 0 } };
}

export function redact(text: string): string {
  return String(text ?? '')
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***')
    .replace(/[A-Fa-f0-9]{32,}/g, '***')
    .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1***')
    .replace(/((?:api[_-]?key|secret|token)\s*[:=]\s*)[^\s,;]{8,}/gi, '$1***');
}

function clip(text: string, limit = 500): string {
  const chars = Array.from(text);
  return chars.length <= limit ? text : chars.slice(0, limit - 1).join('') + '…';
}

export class InputHistoryStore {
  private readonly file: string;
  private readonly clock: () => Date;

  constructor(file: string, clock: () => Date = () => new Date()) {
    this.file = file;
    this.clock = clock;
  }

  private load(): InputHistoryState {
    const read = readJsonFile<InputHistoryState>(this.file, empty());
    const state = read.ok && read.value ? read.value : empty();
    return {
      version: 1,
      prompts: Array.isArray(state.prompts) ? state.prompts : [],
      stats: {
        seen: Number(state.stats?.seen) || 0,
        lastExtractAt: Number(state.stats?.lastExtractAt) || 0,
      },
    };
  }

  private prune(state: InputHistoryState, settings: InputHistorySettings): void {
    const now = this.clock().getTime();
    const ttl = settings.ttlDays * 86_400_000;
    state.prompts = state.prompts
      .filter((p) => now - p.ts <= ttl)
      .slice(-Math.max(0, settings.maxPrompts));
  }

  /** 记录一条用户输入；空/超短/重复（同 session 同文本紧邻）跳过。 */
  record(sessionId: string, text: string, settings: InputHistorySettings): boolean {
    if (!settings.enabled) return false;
    const clean = clip(redact(text).replace(/\s+/g, ' ').trim());
    if (Array.from(clean).length < 4) return false;
    const state = this.load();
    const last = state.prompts[state.prompts.length - 1];
    if (last && last.sessionId === sessionId && last.text === clean) return false;
    state.prompts.push({ ts: this.clock().getTime(), sessionId, text: clean });
    state.stats.seen += 1;
    this.prune(state, settings);
    try {
      writeJsonAtomic(this.file, state);
    } catch (error) {
      console.warn('[dsh-pet-plus] 输入历史写盘失败：' + String(error));
      return false;
    }
    return true;
  }

  /** 最近 n 条（按时间正序）。 */
  recent(n = 10): InputPrompt[] {
    return this.load().prompts.slice(-Math.max(0, n));
  }

  /** 上次提炼之后新增的输入（lastExtractAt 之前的一律不算）。 */
  since(ts: number): InputPrompt[] {
    return this.load().prompts.filter((p) => p.ts > ts);
  }

  /** 标记一次提炼完成，避免每次输入都调用模型。 */
  markExtracted(at = this.clock().getTime()): void {
    const state = this.load();
    state.stats.lastExtractAt = at;
    try {
      writeJsonAtomic(this.file, state);
    } catch (error) {
      console.warn('[dsh-pet-plus] 输入历史写盘失败：' + String(error));
    }
  }

  stats(): { count: number; seen: number; lastExtractAt: number } {
    const state = this.load();
    return { count: state.prompts.length, seen: state.stats.seen, lastExtractAt: state.stats.lastExtractAt };
  }

  clear(): void {
    writeJsonAtomic(this.file, empty());
  }
}
