/** 内容副驾/自动化的配置归一化。 */
export interface ContentLimits {
  per10min: number;
  perDay: number;
  minGapSec: number;
  maxGapSec: number;
}

export interface ContentAutoConfig {
  enabled: boolean;
  acknowledged: boolean;
  dryRun: boolean;
  platforms: { douyin: boolean; xhs: boolean };
  limits: ContentLimits;
  quietHours: [string, string] | null;
  blacklist: string[];
  chromePath: string;
  profileDir: string;
  maxScrolls: number;
}

export interface ContentConfig {
  enabled: boolean;
  cacheMinutes: number;
  dailyCalls: number;
  auto: ContentAutoConfig;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function num(v: unknown, d: number, min: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : d;
}
function bool(v: unknown, d: boolean): boolean {
  return typeof v === 'boolean' ? v : d;
}
function str(v: unknown, d = ''): string {
  return typeof v === 'string' ? v : d;
}
function list(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 100) : [];
}

function quiet(v: unknown): [string, string] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const [a, b] = v;
  const re = /^([01]\d|2[0-3]):[0-5]\d$/;
  return typeof a === 'string' && typeof b === 'string' && re.test(a) && re.test(b) ? [a, b] : null;
}

export function contentConfigOf(conf: Record<string, unknown>): ContentConfig {
  const raw = obj(conf.content);
  const auto = obj(raw.auto);
  const platforms = obj(auto.platforms);
  const limits = obj(auto.limits);
  return {
    enabled: bool(raw.enabled, true),
    cacheMinutes: num(raw.cacheMinutes, 10, 1, 120),
    dailyCalls: num(raw.dailyCalls, 20, 0, 200),
    auto: {
      enabled: bool(auto.enabled, false),
      acknowledged: bool(auto.acknowledged, false),
      dryRun: auto.dryRun !== false,
      platforms: {
        douyin: platforms.douyin !== false,
        xhs: platforms.xhs !== false,
      },
      limits: {
        per10min: num(limits.per10min, 3, 1, 20),
        perDay: num(limits.perDay, 30, 1, 200),
        minGapSec: num(limits.minGapSec, 20, 5, 600),
        maxGapSec: num(limits.maxGapSec, 90, 10, 1200),
      },
      quietHours: quiet(auto.quietHours),
      blacklist: list(auto.blacklist),
      chromePath: str(auto.chromePath),
      profileDir: str(auto.profileDir),
      maxScrolls: num(auto.maxScrolls, 20, 1, 200),
    },
  };
}

/** 静默时段判断（跨午夜）。 */
export function inQuietHours(range: [string, string] | null, now = new Date()): boolean {
  if (!range) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const start = parse(range[0]);
  const end = parse(range[1]);
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}
