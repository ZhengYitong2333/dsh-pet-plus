/**
 * 快捷键三候选：根据最近输入 + 长期记忆生成 3 条“用户可能想说的下一句话”。
 *
 * 设计：一次小调用（≤300 输出 token），严格 JSON；失败/无模型走零成本模板；结果按 10 分钟缓存。
 * 只生成文本，不发送、不写记忆；用户采纳后才作为偏好弱信号。
 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';

export interface SuggestContext {
  llm?: { stream(options: unknown): AsyncIterable<unknown> };
  agentDefaultModel: { currentSelection(): { provider: string; model: string } };
}

export interface SuggestInput {
  system: string;
  recent: string[];
  memories: string[];
}

export type SuggestResult =
  | { ok: true; options: string[]; source: 'llm' | 'template' }
  | { ok: false; reason: 'provider-missing' | 'generate-error'; message?: string };

const TIMEOUT_MS = 20_000;

function templateOptions(recent: string[], memories: string[]): string[] {
  const last = recent[recent.length - 1]?.trim();
  const mem = memories[0]?.trim();
  const options = [
    last ? `继续「${Array.from(last).slice(0, 16).join('')}」` : '帮我梳理一下现在的进展',
    mem ? `按「${Array.from(mem).slice(0, 14).join('')}」来` : '根据我的偏好给点建议',
    '把刚才的结论压缩成三点',
  ];
  return options.map((s) => Array.from(s).slice(0, 60).join(''));
}

function parseOptions(text: string): string[] | undefined {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return undefined;
  try {
    const parsed = JSON.parse(match[0]) as { options?: unknown };
    if (!Array.isArray(parsed.options)) return undefined;
    const options = parsed.options
      .filter((o): o is string => typeof o === 'string')
      .map((o) => o.replace(/\s+/g, ' ').trim())
      .filter((o) => o.length > 0 && Array.from(o).length <= 60);
    const unique = [...new Set(options)].slice(0, 3);
    return unique.length === 3 ? unique : undefined;
  } catch {
    return undefined;
  }
}

export async function generateSuggestions(
  ctx: SuggestContext,
  input: SuggestInput,
): Promise<SuggestResult> {
  const sel = ctx.agentDefaultModel.currentSelection();
  if (!sel.provider || !sel.model) {
    return { ok: true, options: templateOptions(input.recent, input.memories), source: 'template' };
  }
  const llm = ctx.llm;
  if (!llm || typeof llm.stream !== 'function') {
    return { ok: true, options: templateOptions(input.recent, input.memories), source: 'template' };
  }
  const recent = input.recent.slice(-8).join('\n') || '（暂无）';
  const memories = input.memories.slice(0, 6).join('\n') || '（暂无）';
  const prompt =
    '你是主人的桌面宠物。根据下面的「最近输入」和「长期记忆」，生成 3 条主人接下来可能想说的第一人称输入。\n' +
    '要求：每条 ≤40 字、像主人平时说话、三条角度不同、不要编号、不要解释。\n' +
    '只输出 JSON：{"options":["…","…","…"]}\n\n' +
    '【最近输入】\n' +
    recent +
    '\n\n【长期记忆】\n' +
    memories;
  const options = {
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-pet-plus-suggest',
    messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })],
    system: input.system,
    temperature: 0.8,
    maxTokens: 300,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of llm.stream(options)) {
      assembler.push(chunk as Parameters<BlockAssembler['push']>[0]);
    }
  } catch (error) {
    return {
      ok: false,
      reason: 'generate-error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const text = assembler
    .blocks()
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? (b as { text: string }).text : ''))
    .join('')
    .trim();
  const parsed = parseOptions(text);
  if (!parsed) {
    return { ok: true, options: templateOptions(input.recent, input.memories), source: 'template' };
  }
  return { ok: true, options: parsed, source: 'llm' };
}

/** 进程内 10 分钟缓存（key 由调用方拼好）。 */
export class SuggestCache {
  private readonly map = new Map<string, { at: number; options: string[]; source: 'llm' | 'template' }>();
  private readonly ttlMs: number;

  constructor(ttlMs = 10 * 60_000) {
    this.ttlMs = ttlMs;
  }

  get(key: string, now = Date.now()): { options: string[]; source: 'llm' | 'template' } | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (now - hit.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    return { options: hit.options, source: hit.source };
  }

  set(key: string, options: string[], source: 'llm' | 'template', now = Date.now()): void {
    this.map.set(key, { at: now, options, source });
    if (this.map.size > 100) {
      const oldest = [...this.map.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.map.delete(oldest[0]);
    }
  }
}
