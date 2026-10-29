/**
 * 延迟埋点（内存态，最多保留 200 个样本/类）：给设置页与 /memory/metrics 用。
 *
 * 只做“看得见”的粗粒度统计，不写盘、不参与决策；样本不足时 p50/p95 返回最后一条，
 * 避免报表里出现 NaN 或 0 误导人。
 */
export interface LatencyStat {
  count: number;
  p50: number;
  p95: number;
  last: number;
}

export class LatencyStore {
  private readonly samples = new Map<string, number[]>();
  private readonly cap: number;

  constructor(cap = 200) {
    this.cap = Math.max(10, cap);
  }

  record(kind: string, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    const list = this.samples.get(kind) ?? [];
    list.push(Math.round(ms));
    if (list.length > this.cap) list.splice(0, list.length - this.cap);
    this.samples.set(kind, list);
  }

  stats(kind: string): LatencyStat {
    const raw = this.samples.get(kind) ?? [];
    if (raw.length === 0) return { count: 0, p50: 0, p95: 0, last: 0 };
    const list = [...raw].sort((a, b) => a - b);
    const at = (ratio: number): number => list[Math.min(list.length - 1, Math.floor(ratio * list.length))];
    return { count: raw.length, p50: at(0.5), p95: at(0.95), last: raw[raw.length - 1] };
  }

  snapshot(): Record<string, LatencyStat> {
    const out: Record<string, LatencyStat> = {};
    for (const kind of this.samples.keys()) out[kind] = this.stats(kind);
    return out;
  }

  reset(): void {
    this.samples.clear();
  }
}
