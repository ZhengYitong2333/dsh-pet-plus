/**
 * 记忆/内容自动化的每日预算（次数 + token）。
 *
 * 预算只做“刹车”，不做精确计费：拿不到 usage 时由调用方按字符估算后传入。
 * 跨日自动重置；写盘失败只告警，内存计数仍然生效（宁可少花，不可失控）。
 */
import type { BudgetSnapshot } from './types';
import { readJsonFile, writeJsonAtomic } from './store.ts';

interface BudgetState {
  date: string;
  calls: Record<string, number>;
  tokens: Record<string, number>;
}

export interface BudgetLimits {
  calls: number;
  tokens: number;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function empty(date: string): BudgetState {
  return { date, calls: {}, tokens: {} };
}

export class BudgetStore {
  private state: BudgetState | null = null;

  private readonly file: string;
  private readonly clock: () => Date;

  constructor(file: string, clock: () => Date = () => new Date()) {
    this.file = file;
    this.clock = clock;
  }

  private load(): BudgetState {
    const today = dateKey(this.clock());
    if (this.state !== null) {
      if (this.state.date === today) return this.state;
      this.state = empty(today);
      return this.state;
    }
    const read = readJsonFile<BudgetState>(this.file, empty(today));
    if (!read.ok || !read.value || read.value.date !== today) {
      this.state = empty(today);
      return this.state;
    }
    this.state = {
      date: today,
      calls: { ...(read.value.calls ?? {}) },
      tokens: { ...(read.value.tokens ?? {}) },
    };
    return this.state;
  }

  private total(map: Record<string, number>): number {
    return Object.values(map).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  }

  /** 预检：不写入，只判断还能不能花。 */
  canSpend(tokens: number, limits: BudgetLimits): boolean {
    const s = this.load();
    if (limits.calls <= 0 || limits.tokens <= 0) return false;
    return (
      this.total(s.calls) + 1 <= limits.calls && this.total(s.tokens) + Math.max(0, tokens) <= limits.tokens
    );
  }

  /** 记账；超预算返回 false 且不写盘。 */
  consume(kind: string, tokens: number, limits: BudgetLimits): boolean {
    if (!this.canSpend(tokens, limits)) return false;
    const s = this.load();
    s.calls[kind] = (s.calls[kind] ?? 0) + 1;
    s.tokens[kind] = (s.tokens[kind] ?? 0) + Math.max(0, Math.round(tokens));
    try {
      writeJsonAtomic(this.file, s);
    } catch (error) {
      console.warn('[dsh-pet-plus] 预算写盘失败（内存计数仍然生效）：' + String(error));
    }
    return true;
  }

  snapshot(limits: BudgetLimits): BudgetSnapshot {
    const s = this.load();
    return {
      date: s.date,
      calls: { ...s.calls },
      tokens: { ...s.tokens },
      limits: { calls: limits.calls, tokens: limits.tokens },
    };
  }
}
