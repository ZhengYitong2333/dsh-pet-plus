/** 长期记忆的数据契约（L3 指令层先行；L1/L2 复用同一套类型）。 */

/** 记忆分层：user 偏好 / fact 事实 / lesson 教训 / topic 话题 */
export type MemoryLayer = 'user' | 'fact' | 'lesson' | 'topic';

/** L2 条目（P3 实现 CRUD 时使用；先固化结构，避免后续迁移） */
export interface ProfileEntry {
  id: string;
  text: string;
  layer: MemoryLayer;
  keywords: string[];
  importance: number;
  source: 'manual' | 'auto' | 'auto-input' | 'import';
  hits: number;
  lastHitAt?: number;
  createdAt: number;
  updatedAt: number;
  archived?: boolean;
  supersededBy?: string | null;
  rev: number;
}

/** L1 情节摘要（P2 实现；每天 0..N 条） */
export interface Episode {
  id: string;
  ts: number;
  source: 'dsh' | 'pet';
  sessionId: string;
  seqRange?: [number, number];
  summary: string;
  keywords: string[];
  importance: number;
  hits: number;
  status: 'active' | 'promoted' | 'archived';
  promotedTo?: string;
}

/** L3 指令层快照 */
export interface InstructionSnapshot {
  text: string;
  version: number;
  updatedAt: string;
}

/** 消费端归一化后的记忆设置（缺省/非法一律回落安全默认） */
export interface MemorySettings {
  enabled: boolean;
  /** 注入段总字符上限（L3 + L2 索引 + L1 + 片段） */
  totalChars: number;
  /** L3 指令层上限 */
  l3Chars: number;
  /** L2 索引上限 */
  l2IndexChars: number;
  /** L1 索引上限 */
  l1Chars: number;
  /** 召回片段上限 */
  snippetChars: number;
  /** 每天允许的额外模型调用次数 */
  dailyCalls: number;
  /** 每天允许的额外 token */
  dailyTokens: number;
  /** 记忆提炼/压缩所用模型；空 = 跟随对话模型 */
  model: { provider: string; model: string };
  /** 工具模式：always / gated / off */
  toolsMode: 'always' | 'gated' | 'off';
  /** 每 N 轮提炼一次 */
  extractEveryTurns: number;
  /** 规则预筛（省钱） */
  prefilter: boolean;
  inputHistory: InputHistorySettings;
  compress: {
    afterRounds: number;
    keepRecentRounds: number;
  };
}

/** 输入历史设置 */
export interface InputHistorySettings {
  enabled: boolean;
  maxPrompts: number;
  extractEveryPrompts: number;
  ttlDays: number;
}

/** 预算快照 */
export interface BudgetSnapshot {
  date: string;
  calls: Record<string, number>;
  tokens: Record<string, number>;
  limits: { calls: number; tokens: number };
}
