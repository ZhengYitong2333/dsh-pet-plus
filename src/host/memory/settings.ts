/** 把配置里的 `memory` 段归一化成安全默认值（消费端零校验）。 */
import type { MemorySettings } from './types';

const DEFAULTS: MemorySettings = {
  enabled: true,
  totalChars: 1500,
  l3Chars: 300,
  l2IndexChars: 350,
  l1Chars: 150,
  snippetChars: 500,
  dailyCalls: 30,
  dailyTokens: 40_000,
  model: { provider: '', model: '' },
  toolsMode: 'always',
  extractEveryTurns: 8,
  prefilter: true,
  inputHistory: { enabled: true, maxPrompts: 200, extractEveryPrompts: 10, ttlDays: 7 },
  compress: { afterRounds: 30, keepRecentRounds: 10 },
};

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function model(value: unknown): { provider: string; model: string } {
  const m = obj(value);
  const provider = typeof m.provider === 'string' ? m.provider.trim() : '';
  const name = typeof m.model === 'string' ? m.model.trim() : '';
  if ((provider === '') !== (name === '')) return { provider: '', model: '' };
  return { provider, model: name };
}

export function memorySettingsOf(conf: Record<string, unknown>): MemorySettings {
  const raw = obj(conf.memory);
  const inject = obj(raw.inject);
  const budget = obj(raw.budget);
  const input = obj(raw.inputHistory);
  const compress = obj(raw.compress);
  const tools = typeof raw.tools === 'object' ? obj(raw.tools).mode : undefined;
  const toolsMode =
    tools === 'always' || tools === 'gated' || tools === 'off' ? tools : DEFAULTS.toolsMode;
  return {
    enabled: bool(raw.enabled, DEFAULTS.enabled),
    totalChars: num(inject.totalChars, DEFAULTS.totalChars, 200, 4000),
    l3Chars: num(inject.l3Chars, DEFAULTS.l3Chars, 100, 1200),
    l2IndexChars: num(inject.l2IndexChars, DEFAULTS.l2IndexChars, 100, 1200),
    l1Chars: num(inject.l1Chars, DEFAULTS.l1Chars, 60, 600),
    snippetChars: num(inject.snippetChars, DEFAULTS.snippetChars, 100, 1200),
    dailyCalls: num(budget.dailyCalls, DEFAULTS.dailyCalls, 0, 1000),
    dailyTokens: num(budget.dailyTokens, DEFAULTS.dailyTokens, 0, 2_000_000),
    model: model(raw.model),
    toolsMode,
    extractEveryTurns: num(raw.extractEveryTurns, DEFAULTS.extractEveryTurns, 1, 50),
    prefilter: bool(raw.prefilter, DEFAULTS.prefilter),
    inputHistory: {
      enabled: bool(input.enabled, DEFAULTS.inputHistory.enabled),
      maxPrompts: num(input.maxPrompts, DEFAULTS.inputHistory.maxPrompts, 0, 2000),
      extractEveryPrompts: num(
        input.extractEveryPrompts,
        DEFAULTS.inputHistory.extractEveryPrompts,
        1,
        100,
      ),
      ttlDays: num(input.ttlDays, DEFAULTS.inputHistory.ttlDays, 1, 90),
    },
    compress: {
      afterRounds: num(compress.afterRounds, DEFAULTS.compress.afterRounds, 5, 500),
      keepRecentRounds: num(
        compress.keepRecentRounds,
        DEFAULTS.compress.keepRecentRounds,
        1,
        200,
      ),
    },
  };
}
