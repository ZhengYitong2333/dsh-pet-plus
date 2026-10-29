/**
 * 把记忆渲染成 system prompt 里的一段。
 *
 * 当前版本只接 L3（用户手写的指令层）；L2 索引 / L1 情节 / 召回片段在后续阶段接入，
 * 但**格式与截断规则**先固定下来，避免以后改 prompt 形态导致回归。
 */
import type { MemorySettings } from './types';

const L3_HEADER =
  '【你与主人的长期约定】以下是主人明确写下的偏好与规则，回答时自然遵守；不要在回复里逐字复述。';

/** 按字符截断（代理对安全），超出补省略号。 */
export function truncateChars(text: string, limit: number): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  if (limit <= 1) return '…';
  return chars.slice(0, limit - 1).join('') + '…';
}

export interface RenderInput {
  settings: MemorySettings;
  instructions: string;
  /** L2 索引（后续阶段） */
  l2Index?: string;
  /** L1 情节索引（后续阶段） */
  l1Index?: string;
  /** 本轮召回片段（后续阶段） */
  snippets?: string;
}

/**
 * 返回注入段；关闭 / 全空时返回空串（调用方据此保持 prompt 逐字节不变）。
 */
export function renderMemoryBlock(input: RenderInput): string {
  const { settings } = input;
  if (!settings.enabled) return '';
  const sections: string[] = [];
  let budget = settings.totalChars;

  const l3 = input.instructions.trim();
  if (l3 !== '') {
    const body = truncateChars(l3, Math.min(settings.l3Chars, budget - L3_HEADER.length - 1));
    if (body !== '') {
      sections.push(L3_HEADER + '\n' + body);
      budget -= L3_HEADER.length + body.length + 1;
    }
  }
  if (budget > 40 && input.l2Index?.trim()) {
    const body = truncateChars(input.l2Index.trim(), Math.min(settings.l2IndexChars, budget));
    sections.push('【长期记忆】\n' + body);
    budget -= body.length + 7;
  }
  if (budget > 40 && input.l1Index?.trim()) {
    const body = truncateChars(input.l1Index.trim(), Math.min(settings.l1Chars, budget));
    sections.push('【最近发生的事】\n' + body);
    budget -= body.length + 9;
  }
  if (budget > 40 && input.snippets?.trim()) {
    const body = truncateChars(input.snippets.trim(), Math.min(settings.snippetChars, budget));
    sections.push('【相关回忆】\n' + body);
  }
  return sections.join('\n\n');
}
