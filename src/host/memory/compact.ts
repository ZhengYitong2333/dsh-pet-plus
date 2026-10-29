/**
 * 宠物对话记忆压缩：超过 N 轮后只保留最近 M 轮，控制 memory.json 体积与读取成本。
 *
 * 为什么可以丢：每一轮在写入时已由 EpisodeStore 规则打分进 L1；被丢掉的低重要度闲聊
 * 本来也不会进长期记忆。这里只做“窗口裁剪”，不调用模型。
 */
export function compactMessages<T>(
  messages: readonly T[],
  afterRounds: number,
  keepRecentRounds: number,
): { kept: T[]; dropped: T[]; compacted: boolean } {
  const after = Number.isFinite(afterRounds) ? Math.max(4, Math.floor(afterRounds)) : 30;
  const keep = Number.isFinite(keepRecentRounds) ? Math.max(1, Math.floor(keepRecentRounds)) : 10;
  const keepMessages = Math.min(keep, after) * 2;
  if (messages.length <= after * 2) {
    return { kept: [...messages], dropped: [], compacted: false };
  }
  const cut = Math.max(0, messages.length - keepMessages);
  return {
    kept: messages.slice(cut),
    dropped: messages.slice(0, cut),
    compacted: true,
  };
}

/** 把被裁掉的一批消息压成一句可读摘要（规则式，零模型）。 */
export function summarizeDropped(messages: ReadonlyArray<{ role: string; content: string }>): string {
  const userLines = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(-8);
  if (userLines.length === 0) return '';
  return `更早聊过：${userLines.join('；')}`.slice(0, 300);
}
