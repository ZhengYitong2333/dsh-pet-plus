/** 拖拽/剪贴板即问：总结 / 翻译 / 解释 / 改写成评论。 */
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm';

export type AssistKind = 'summary' | 'translate' | 'explain' | 'comment';

export interface AssistContext {
  llm?: { stream(options: unknown): AsyncIterable<unknown> };
  agentDefaultModel: { currentSelection(): { provider: string; model: string } };
}

const INSTRUCTIONS: Record<AssistKind, string> = {
  summary: '用不超过 120 字总结下面内容，保留关键数字与结论。',
  translate: '把下面内容翻译成简体中文；如果已经是中文就翻译成英文。只输出译文。',
  explain: '解释下面内容在说什么，面向非专业读者，不超过 150 字。',
  comment: '基于下面内容写 3 条自然的评论候选，每条不超过 40 字，用 1/2/3 编号。',
};

export async function assistText(
  ctx: AssistContext,
  input: { text: string; kind: AssistKind },
): Promise<{ ok: true; text: string; source: 'llm' | 'template' } | { ok: false; reason: 'empty' | 'no-model' | 'error'; message?: string }> {
  const text = String(input.text ?? '').trim().slice(0, 8000);
  if (!text) return { ok: false, reason: 'empty' };
  const sel = ctx.agentDefaultModel.currentSelection();
  if (!sel.provider || !sel.model || !ctx.llm?.stream) {
    return { ok: true, text: text.slice(0, 300), source: 'template' };
  }
  const options = {
    provider: sel.provider,
    model: sel.model,
    sessionId: 'dsh-pet-plus-assist',
    messages: [
      createUserMessage({
        content: [{ type: 'text', text: INSTRUCTIONS[input.kind] + '\n\n【内容】\n' + text }],
        source: { kind: 'user' },
      }),
    ],
    system: '你是桌宠的快捷助手，回答简短、直接、不寒暄。',
    temperature: 0.4,
    maxTokens: 400,
    signal: AbortSignal.timeout(25_000),
  };
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of ctx.llm.stream(options)) {
      assembler.push(chunk as Parameters<BlockAssembler['push']>[0]);
    }
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  const out = assembler
    .blocks()
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? (b as { text: string }).text : ''))
    .join('')
    .trim();
  if (!out) return { ok: false, reason: 'error', message: '模型未返回文本' };
  return { ok: true, text: out, source: 'llm' };
}
