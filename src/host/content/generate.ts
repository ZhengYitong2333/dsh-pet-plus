/**
 * 内容副驾生成：总结 + 3 个要点 + 3 条评论/回复候选 + 风险提示。
 * 只生成文本，不发送；所有发布动作由用户完成。
 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';
import type { ParsedLink } from './link.ts';

export interface DigestResult {
  summary: string;
  points: string[];
  comments: Array<{ tone: '真诚' | '幽默' | '专业'; text: string }>;
  risk: string;
  source: 'llm' | 'template';
}

export interface DigestContext {
  llm?: { stream(options: unknown): AsyncIterable<unknown> };
  agentDefaultModel: { currentSelection(): { provider: string; model: string } };
}

const TIMEOUT_MS = 25_000;

function template(input: string, link?: ParsedLink): DigestResult {
  const first = input.replace(/\s+/g, ' ').trim().slice(0, 80) || '这条内容';
  return {
    summary: (link ? `来自${link.platform === 'douyin' ? '抖音' : '小红书'}的内容：` : '内容：') + first,
    points: ['先看标题和封面是否一致', '再看评论区有没有争议点', '最后判断值不值得互动'],
    comments: [
      { tone: '真诚', text: '这条内容挺有意思的，感谢分享～' },
      { tone: '幽默', text: '看完只想说：算法你是懂我的。' },
      { tone: '专业', text: '思路挺清楚，不过第 2 点如果有数据支撑会更有说服力。' },
    ],
    risk: '模板结果，未读取正文；发布前请自己确认语境。',
    source: 'template',
  };
}

function parse(text: string): DigestResult | undefined {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) return undefined;
  try {
    const raw = JSON.parse(match[0]) as Record<string, unknown>;
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
    const points = Array.isArray(raw.points)
      ? raw.points.filter((p): p is string => typeof p === 'string').slice(0, 3)
      : [];
    const comments = Array.isArray(raw.comments)
      ? raw.comments
          .map((c) => {
            const item = c as Record<string, unknown>;
            const tone = item.tone === '幽默' || item.tone === '专业' ? item.tone : '真诚';
            const text = typeof item.text === 'string' ? item.text.trim() : '';
            return text ? { tone: tone as '真诚' | '幽默' | '专业', text } : undefined;
          })
          .filter((c): c is { tone: '真诚' | '幽默' | '专业'; text: string } => c !== undefined)
          .slice(0, 3)
      : [];
    if (!summary || comments.length < 3) return undefined;
    return {
      summary,
      points,
      comments,
      risk: typeof raw.risk === 'string' ? raw.risk.trim() : '',
      source: 'llm',
    };
  } catch {
    return undefined;
  }
}

export async function generateDigest(
  ctx: DigestContext,
  input: { text: string; link?: ParsedLink },
): Promise<DigestResult> {
  const sel = ctx.agentDefaultModel.currentSelection();
  if (!sel.provider || !sel.model || !ctx.llm?.stream) {
    return template(input.text, input.link);
  }
  const prompt =
    '你是主人的内容副驾，帮主人快速看懂一条抖音/小红书内容，并起草评论。\n' +
    '只输出 JSON：{"summary":"≤80字总结","points":["要点1","要点2","要点3"],' +
    '"comments":[{"tone":"真诚","text":"≤40字"},{"tone":"幽默","text":"≤40字"},{"tone":"专业","text":"≤40字"}],' +
    '"risk":"是否有引战/广告/风险，一句话"}\n' +
    '要求：评论像真人、不油腻、不复读；没有正文就基于标题/链接谨慎写。\n\n' +
    (input.link ? '【链接】' + input.link.url + '\n【平台】' + input.link.platform + '\n' : '') +
    '【正文/标题】\n' +
    (input.text || '（未提供正文）');
  const options = {
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-pet-plus-content',
    messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })],
    system: '你是内容副驾，只做总结与起草，不代替用户发布。',
    temperature: 0.7,
    maxTokens: 500,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of ctx.llm.stream(options)) {
      assembler.push(chunk as Parameters<BlockAssembler['push']>[0]);
    }
  } catch {
    return template(input.text, input.link);
  }
  const text = assembler
    .blocks()
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? (b as { text: string }).text : ''))
    .join('')
    .trim();
  return parse(text) ?? template(input.text, input.link);
}
