/**
 * 给桌宠对话用的长期记忆工具。
 *
 * 只暴露两个工具：`recall`（L2 条目 + L1 情节 + L0 会话片段）与 `read_session`（读某个会话摘录）。
 * 结果统一 ≤600 字；sessionQuery 不存在/超时按不可用返回，不抛给模型。
 */
import type { ToolSchema } from '@deepseek-ai/dsh-llm';
import type { ProfileStore } from './profile.ts';
import type { EpisodeStore } from './episodes.ts';
import type { SessionRecall } from './sessions.ts';
import { memorySettingsOf } from './settings.ts';
import type { BudgetStore } from './budget.ts';

const RECALL_TOOL: ToolSchema = {
  name: 'recall',
  description:
    '检索长期记忆：主人以前说过的事实/偏好、最近发生过的事、以及历史会话片段。只有在现有上下文不足时才调用；能直接回答就不要调用。',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索关键词，尽量具体' },
      scope: {
        type: 'string',
        enum: ['all', 'memory', 'episodes', 'sessions'],
        description: '检索范围，默认 all',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
};

const READ_SESSION_TOOL: ToolSchema = {
  name: 'read_session',
  description: '读取某个历史会话的 user/assistant 文本摘录。sessionId 必须来自 recall 的结果。',
  parameters: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: '会话 id（recall 返回）' },
    },
    required: ['sessionId'],
    additionalProperties: false,
  },
};

export interface MemoryTools {
  tools: ToolSchema[];
  execute(name: string, rawArgs: string): Promise<{ text: string; isError?: boolean }>;
}

export interface MemoryToolsDeps {
  profile: ProfileStore;
  episodes: EpisodeStore;
  sessions: SessionRecall;
  budget: BudgetStore;
  /** 该宠物条目的配置，用于读取预算上限 */
  conf: Record<string, unknown>;
}

function clip(text: string, limit = 600): string {
  const chars = Array.from(text);
  return chars.length <= limit ? text : chars.slice(0, limit - 1).join('') + '…';
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 回忆意图判定：用于 gated 模式下决定是否注入工具。 */
export function hasRecallIntent(text: string): boolean {
  const t = String(text ?? '');
  if (t.trim().length < 4) return false;
  return /上次|之前|以前|那天|那次|记得|还记得|我们聊过|历史|刚说|前面说|回忆|记不记得|忘没忘/.test(t);
}

export function createMemoryTools(deps: MemoryToolsDeps): MemoryTools {
  const settings = memorySettingsOf(deps.conf);
  const limits = { calls: settings.dailyCalls, tokens: settings.dailyTokens };
  return {
    tools: [RECALL_TOOL, READ_SESSION_TOOL],
    async execute(name, rawArgs) {
      if (!deps.budget.consume('tool', 120, limits)) {
        return { text: '记忆工具今日预算已用尽，请直接回答。', isError: false };
      }
      const args = parseArgs(rawArgs);
      if (name === 'read_session') {
        const id = String(args.sessionId ?? '').trim();
        if (!id) return { text: '缺少 sessionId', isError: true };
        const result = await deps.sessions.read(id, 800);
        if (!result.ok) {
          return {
            text: result.reason === 'unavailable' ? '会话检索未启用（sessionQuery 不可用）。' : '读取会话失败。',
            isError: false,
          };
        }
        return { text: clip(result.value, 800) };
      }
      const query = String(args.query ?? '').trim();
      if (!query) return { text: '缺少 query', isError: true };
      const scope = String(args.scope ?? 'all');
      const parts: string[] = [];
      if (scope === 'all' || scope === 'memory') {
        const entries = deps.profile.search(query, 3);
        if (entries.length > 0) {
          parts.push('【长期记忆】\n' + entries.map((e) => '- ' + e.text).join('\n'));
        }
      }
      if (scope === 'all' || scope === 'episodes') {
        const episodes = deps.episodes.search(query, 3);
        if (episodes.length > 0) {
          parts.push('【最近的事】\n' + episodes.map((e) => '- ' + e.summary).join('\n'));
        }
      }
      if (scope === 'all' || scope === 'sessions') {
        const hits = await deps.sessions.search(query, 3);
        if (hits.ok && hits.value.length > 0) {
          parts.push(
            '【历史会话】\n' +
              hits.value.map((h) => `- [${h.sessionId}] ${h.snippet}`).join('\n'),
          );
        }
      }
      if (parts.length === 0) return { text: '没有检索到相关记忆。' };
      return { text: clip(parts.join('\n\n'), 600) };
    },
  };
}
