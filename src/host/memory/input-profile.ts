/**
 * 输入画像提炼（P3）：从用户最近的输入里提炼**稳定**的偏好/事实，写进 L2 画像。
 *
 * 为什么单独一个模块：
 *  - 提示词与解析纯函数化，单测不用起 LLM；
 *  - 预筛（长度/去重/触发间隔）与预算判断都在调用方之前，省一次模型调用；
 *  - 失败绝不抛给事件循环：输入记录是热路径，提炼只是旁路。
 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { MemoryLayer } from './types.ts';

export interface ExtractedFact {
  text: string;
  layer: MemoryLayer;
  importance: number;
}

export interface ExtractContext {
  llm?: { stream(options: unknown): AsyncIterable<unknown> };
  selection: { provider: string; model: string };
}

const SYSTEM =
  '你是一个谨慎的用户画像提炼器。只提炼会长期成立的偏好、事实、习惯、雷区；' +
  '不要记录一次性任务、寒暄、代码细节、临时情绪、别人的隐私。拿不准就不要写。';

export function buildExtractPrompt(prompts: readonly string[]): string {
  const list = prompts
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n')
    .slice(0, 6000);
  return [
    '下面是用户最近在 DSH 里的真实输入（已脱敏）。请提炼 0-5 条**长期有效**的记忆。',
    '输出严格 JSON 数组，不要 markdown 代码块，每项：',
    '{"text":"不超过 60 字的中文陈述","layer":"user|fact|lesson|topic","importance":0.0-1.0}',
    'layer 含义：user=偏好/习惯，fact=关于用户的事实，lesson=需要记住的教训/雷区，topic=长期关注的话题。',
    '没有值得记的就输出 []。不要重复用户原话里的临时请求。',
    '',
    '【最近输入】',
    list,
  ].join('\n');
}

function normalize(text: string): string {
  return String(text ?? '')
    .trim()
    .replace(/^[-*•\d.、)\s]+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function parseExtractedFacts(raw: string): ExtractedFact[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const layers: MemoryLayer[] = ['user', 'fact', 'lesson', 'topic'];
  const seen = new Set<string>();
  const facts: ExtractedFact[] = [];
  for (const item of parsed) {
    const record = item as Record<string, unknown>;
    const value = String(record?.text ?? '').trim().replace(/\s+/g, ' ');
    if (Array.from(value).length < 4 || Array.from(value).length > 120) continue;
    const key = normalize(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const layer = layers.includes(record?.layer as MemoryLayer) ? (record.layer as MemoryLayer) : 'fact';
    const importance = Number(record?.importance);
    facts.push({
      text: value,
      layer,
      importance: Number.isFinite(importance) ? Math.max(0, Math.min(1, importance)) : 0.6,
    });
    if (facts.length >= 5) break;
  }
  return facts;
}

/** 触发判断：关闭、不足条数、或距上次提炼不足 10 分钟都跳过。 */
export function shouldExtractInputProfile(input: {
  enabled: boolean;
  promptsSinceLast: number;
  every: number;
  lastExtractAt: number;
  now: number;
}): boolean {
  if (!input.enabled) return false;
  if (!Number.isFinite(input.every) || input.every <= 0) return false;
  if (input.promptsSinceLast < input.every) return false;
  if (input.lastExtractAt > 0 && input.now - input.lastExtractAt < 10 * 60_000) return false;
  return true;
}

export async function extractInputProfile(
  ctx: ExtractContext,
  prompts: readonly string[],
): Promise<{ ok: true; facts: ExtractedFact[]; tokens: number } | { ok: false; reason: string }> {
  if (prompts.length === 0) return { ok: false, reason: 'empty' };
  if (!ctx.llm?.stream || !ctx.selection.provider || !ctx.selection.model) return { ok: false, reason: 'no-model' };
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of ctx.llm.stream({
      provider: ctx.selection.provider,
      model: ctx.selection.model,
      sessionId: 'dsh-pet-plus-input-profile',
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: buildExtractPrompt(prompts) }],
          source: { kind: 'user' },
        }),
      ],
      system: SYSTEM,
      temperature: 0.2,
      maxTokens: 500,
      signal: AbortSignal.timeout(20_000),
    })) {
      assembler.push(chunk as Parameters<BlockAssembler['push']>[0]);
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  const raw = assembler
    .blocks()
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? (b as { text: string }).text : ''))
    .join('');
  const facts = parseExtractedFacts(raw);
  const promptChars = buildExtractPrompt(prompts).length + SYSTEM.length;
  return { ok: true, facts, tokens: Math.ceil((promptChars + raw.length) / 1.5) };
}
