/** L2 检索与注入选择的纯函数（零 IO，便于单测）。 */
import type { ProfileEntry } from './types';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff]/u;

/** 分词：CJK 相邻二字 + ASCII 单词/版本号；小写去重。 */
export function tokenize(text: string): string[] {
  const out = new Set<string>();
  const raw = String(text ?? '').toLowerCase();
  const ascii = raw.match(/[a-z0-9_]+(?:\.[a-z0-9_]+)*/gu) ?? [];
  for (const word of ascii) if (word.length >= 2) out.add(word);
  const cjk = raw.match(/[\u3400-\u4dbf\u4e00-\u9fff]+/gu) ?? [];
  for (const run of cjk) {
    const chars = Array.from(run);
    if (chars.length === 1) out.add(chars[0]);
    for (let i = 0; i + 1 < chars.length; i++) out.add(chars[i] + chars[i + 1]);
  }
  return [...out].slice(0, 64);
}

export function extractKeywords(text: string, limit = 16): string[] {
  return tokenize(text).slice(0, limit);
}

function idfOf(token: string, entries: readonly ProfileEntry[]): number {
  const n = entries.length || 1;
  const df = entries.reduce((count, e) => count + (e.keywords.includes(token) ? 1 : 0), 0);
  return Math.log(1 + n / (1 + df));
}

/** BM25 风格打分 × 艾宾浩斯衰减 × importance；返回 0 表示不相关。 */
export function scoreEntry(
  entry: ProfileEntry,
  queryTokens: readonly string[],
  all: readonly ProfileEntry[],
  now = Date.now(),
): number {
  if (queryTokens.length === 0) return 0;
  const text = entry.text.toLowerCase();
  let score = 0;
  for (const token of queryTokens) {
    if (!text.includes(token) && !entry.keywords.includes(token)) continue;
    score += idfOf(token, all);
  }
  if (score <= 0) return 0;
  const ageDays = Math.max(0, (now - entry.updatedAt) / 86_400_000);
  const decay = Math.pow(0.5, ageDays / 14);
  const importance = 1 + Math.max(0, Math.min(5, entry.importance)) / 5;
  return score * decay * importance;
}

/** 取 top-k（相对门槛 25%，避免长尾噪声）。 */
export function recallEntries(
  entries: readonly ProfileEntry[],
  query: string,
  options: { limit?: number; now?: number; relativeMin?: number } = {},
): ProfileEntry[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const now = options.now ?? Date.now();
  const scored = entries
    .filter((e) => !e.archived)
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens, entries, now) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const max = scored[0].score;
  const min = max * (options.relativeMin ?? 0.25);
  return scored
    .filter((item) => item.score >= min)
    .slice(0, Math.max(1, options.limit ?? 3))
    .map((item) => item.entry);
}

/** 索引渲染：active 条目按 importance×新近排序，一行一条，硬字符上限。 */
export function renderIndex(entries: readonly ProfileEntry[], charLimit: number): string {
  const active = entries.filter((e) => !e.archived);
  active.sort((a, b) => {
    const ia = a.importance * 1e12 + a.updatedAt;
    const ib = b.importance * 1e12 + b.updatedAt;
    return ib - ia;
  });
  const lines: string[] = [];
  let used = 0;
  for (const entry of active) {
    const line = '- ' + entry.text.replace(/\s+/g, ' ').trim();
    if (used + line.length + 1 > charLimit) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n');
}
