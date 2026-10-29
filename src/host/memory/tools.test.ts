import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ProfileStore } from './profile.ts';
import { EpisodeStore } from './episodes.ts';
import { SessionRecall } from './sessions.ts';
import { BudgetStore } from './budget.ts';
import { createMemoryTools } from './tools.ts';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-tools-'));
  const profile = new ProfileStore(join(dir, 'profile.json'), join(dir, 'backups'));
  const episodes = new EpisodeStore(join(dir, 'episodes.jsonl'));
  const sessions = new SessionRecall(
    () => ({
      async searchSessions() {
        return {
          items: [
            {
              header: { id: 's1', cwd: process.cwd() },
              bestMatch: { snippet: '我们讨论过记忆分层', time: 1 },
            },
          ],
        };
      },
      async readSession() {
        return {
          session: { header: { cwd: process.cwd() } },
          events: [{ type: 'user/message', data: { content: [{ type: 'text', text: '你好' }] } }],
        };
      },
    }),
    { cwd: () => process.cwd(), timeoutMs: 50 },
  );
  const budget = new BudgetStore(join(dir, 'budget.json'), () => new Date('2026-10-29T10:00:00'));
  return { dir, profile, episodes, sessions, budget };
}

test('recall 汇总 L2/L1/L0，并标注来源', async () => {
  const { dir, profile, episodes, sessions, budget } = setup();
  try {
    await profile.add({ text: '我不吃辣', layer: 'user', source: 'manual' });
    episodes.record({ source: 'pet', sessionId: 'p', summary: '我对花生过敏', importance: 5 });
    const tools = createMemoryTools({
      profile,
      episodes,
      sessions,
      budget,
      conf: { memory: { enabled: true } },
    });
    const result = await tools.execute('recall', JSON.stringify({ query: '花生' }));
    assert.equal(result.isError, undefined);
    assert.match(result.text, /长期记忆|最近的事|历史会话/);
    assert.ok(Array.from(result.text).length <= 600);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('read_session 走 L0 适配器；预算耗尽时拒绝', async () => {
  const { dir, profile, episodes, sessions, budget } = setup();
  try {
    const tools = createMemoryTools({
      profile,
      episodes,
      sessions,
      budget,
      conf: { memory: { enabled: true, budget: { dailyCalls: 2, dailyTokens: 1000 } } },
    });
    const read = await tools.execute('read_session', JSON.stringify({ sessionId: 's1' }));
    assert.match(read.text, /用户：你好/);
    await tools.execute('recall', JSON.stringify({ query: '记忆' }));
    const blocked = await tools.execute('recall', JSON.stringify({ query: '记忆' }));
    assert.match(blocked.text, /预算已用尽/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
