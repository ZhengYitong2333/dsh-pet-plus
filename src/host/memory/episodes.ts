/**
 * L1 情节记忆：重要度门控的会话摘要。
 *
 * 存储是 append-only JSONL（`episodes.jsonl`），一行一条；状态变更（promoted/archived）
 * 会重写整个文件（条数有上限，代价可接受）。摘要先用零成本规则生成，后续可接小模型精炼。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Episode } from './types';
import { writeTextAtomic } from './store.ts';
import { extractKeywords, tokenize } from './recall.ts';

const MAX_EPISODES = 500;
const ACTIVE_DAYS = 7;
const ARCHIVE_DAYS = 30;

export interface EpisodeInput {
  source: Episode['source'];
  sessionId: string;
  seqRange?: [number, number];
  summary: string;
  keywords?: string[];
  importance: number;
}

/** 规则评分：只给“值得长期记住”的轮次打分（0–5）。 */
export function scoreEpisode(userText: string, assistantText = ''): { importance: number; keywords: string[] } {
  const text = userText.trim();
  if (text.length < 4) return { importance: 0, keywords: [] };
  const signals: Array<[RegExp, number]> = [
    [/记住|别忘了|提醒我|以后|每次|总是|习惯|约定/, 3],
    [/我喜欢|我不喜欢|我讨厌|我爱|我不吃|我不能|我对.*过敏/, 3],
    [/我是|我在|我住|我养|我的生日|我生日/, 2],
    [/明天|后天|下周|月底|几点|日期|deadline|截止/, 2],
    [/别|不要|禁止|必须|一定要/, 1],
    [/错了|搞错|记错|不是这样|改一下/, 2],
    [/[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}月[0-9]{1,2}日/, 2],
  ];
  let score = 0;
  for (const [re, weight] of signals) if (re.test(text)) score += weight;
  if (text.length >= 40) score += 1;
  if (assistantText.length > 0) score += 0;
  const importance = Math.max(0, Math.min(5, score));
  return { importance, keywords: extractKeywords(text) };
}

function summaryOf(userText: string): string {
  const chars = Array.from(userText.replace(/\s+/g, ' ').trim());
  return chars.length <= 120 ? chars.join('') : chars.slice(0, 119).join('') + '…';
}

export class EpisodeStore {
  private readonly file: string;
  private readonly clock: () => Date;

  constructor(file: string, clock: () => Date = () => new Date()) {
    this.file = file;
    this.clock = clock;
  }

  private readAll(): Episode[] {
    if (!existsSync(this.file)) return [];
    let raw = '';
    try {
      raw = readFileSync(this.file, 'utf8');
    } catch {
      return [];
    }
    const out: Episode[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as Episode;
        if (parsed && typeof parsed.id === 'string' && typeof parsed.summary === 'string') out.push(parsed);
      } catch {
        /* 跳过损坏行 */
      }
    }
    return out;
  }

  private writeAll(episodes: readonly Episode[]): void {
    writeTextAtomic(this.file, episodes.map((e) => JSON.stringify(e)).join('\n') + '\n');
  }

  /** 规则门控后追加；importance < 3 或空文本不写。 */
  record(input: EpisodeInput): Episode | undefined {
    if (input.importance < 3 || input.summary.trim() === '') return undefined;
    const episode: Episode = {
      id: 'ep_' + randomBytes(6).toString('hex'),
      ts: this.clock().getTime(),
      source: input.source,
      sessionId: input.sessionId,
      ...(input.seqRange ? { seqRange: input.seqRange } : {}),
      summary: summaryOf(input.summary),
      keywords: (input.keywords?.length ? input.keywords : extractKeywords(input.summary)).slice(0, 48),
      importance: Math.max(0, Math.min(5, input.importance)),
      hits: 0,
      status: 'active',
    };
    try {
      appendFileSync(this.file, JSON.stringify(episode) + '\n', 'utf8');
    } catch (error) {
      console.warn('[dsh-pet-plus] 写 episodes.jsonl 失败：' + String(error));
      return undefined;
    }
    return episode;
  }

  /** 便捷入口：从一次宠物对话规则打分并记录。 */
  recordTurn(userText: string, assistantText: string, sessionId: string): Episode | undefined {
    const { importance, keywords } = scoreEpisode(userText, assistantText);
    return this.record({
      source: 'pet',
      sessionId,
      summary: userText,
      keywords,
      importance,
    });
  }

  list(options: { status?: Episode['status']; limit?: number } = {}): Episode[] {
    const now = this.clock().getTime();
    let episodes = this.readAll();
    if (options.status) episodes = episodes.filter((e) => e.status === options.status);
    episodes.sort((a, b) => b.ts - a.ts);
    if (episodes.length > MAX_EPISODES) episodes = episodes.slice(0, MAX_EPISODES);
    // 惰性清理：超过归档期的非 active 条目直接丢弃
    const kept = episodes.filter((e) => {
      if (e.status === 'active') return true;
      return now - e.ts <= ARCHIVE_DAYS * 86_400_000;
    });
    return options.limit ? kept.slice(0, options.limit) : kept;
  }

  /** 注入索引：active、按 importance×新近排序，一条一行。 */
  renderIndex(charLimit: number): string {
    const active = this.list({ status: 'active' }).sort(
      (a, b) => b.importance * 1e12 + b.ts - (a.importance * 1e12 + a.ts),
    );
    const lines: string[] = [];
    let used = 0;
    for (const episode of active) {
      const line = '- ' + episode.summary;
      if (used + line.length + 1 > charLimit) break;
      lines.push(line);
      used += line.length + 1;
    }
    return lines.join('\n');
  }

  /** 7 天到期：返回需要提升的 active 条目并把它们标记为 promoted；其余归档。 */
  promoteExpired(): { promote: Episode[]; archive: Episode[] } {
    const now = this.clock().getTime();
    const episodes = this.readAll();
    const promote: Episode[] = [];
    const archive: Episode[] = [];
    let changed = false;
    for (const episode of episodes) {
      if (episode.status !== 'active') continue;
      if (now - episode.ts <= ACTIVE_DAYS * 86_400_000) continue;
      if (episode.importance >= 4 || episode.hits >= 2) {
        episode.status = 'promoted';
        promote.push(episode);
      } else {
        episode.status = 'archived';
        archive.push(episode);
      }
      changed = true;
    }
    if (changed) this.writeAll(episodes);
    return { promote, archive };
  }

  markStatus(id: string, status: Episode['status']): boolean {
    const episodes = this.readAll();
    const found = episodes.find((e) => e.id === id);
    if (!found) return false;
    found.status = status;
    this.writeAll(episodes);
    return true;
  }

  search(query: string, limit = 3): Episode[] {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];
    return this.list({ status: 'active' })
      .map((episode) => {
        const haystack = (episode.summary + ' ' + episode.keywords.join(' ')).toLowerCase();
        const score = tokens.reduce((sum, t) => sum + (haystack.includes(t) ? 1 : 0), 0);
        return { episode, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.episode.ts - a.episode.ts)
      .slice(0, Math.max(1, limit))
      .map((item) => item.episode);
  }

  count(): { active: number; promoted: number; archived: number } {
    const episodes = this.readAll();
    return {
      active: episodes.filter((e) => e.status === 'active').length,
      promoted: episodes.filter((e) => e.status === 'promoted').length,
      archived: episodes.filter((e) => e.status === 'archived').length,
    };
  }
}
