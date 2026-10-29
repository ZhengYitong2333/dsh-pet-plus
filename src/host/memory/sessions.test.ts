import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionRecall, type SessionQueryLike } from './sessions.ts';

const cwd = '/tmp/work';

function fakeQuery(overrides: Partial<SessionQueryLike> = {}): SessionQueryLike {
  return {
    async searchSessions() {
      return {
        items: [
          {
            header: { id: 's1', cwd },
            bestMatch: { snippet: '我们讨论过记忆分层', time: 1000 },
          },
          {
            header: { id: 's2', cwd: '/tmp/other' },
            bestMatch: { snippet: '别人的会话', time: 2000 },
          },
        ],
      };
    },
    async readSession() {
      return {
        session: { header: { cwd } },
        events: [
          { type: 'user/message', data: { content: [{ type: 'text', text: '你好' }] } },
          { type: 'assistant/message', data: { content: [{ type: 'text', text: '在的' }] } },
          { type: 'tool/call', data: {} },
        ],
      };
    },
    ...overrides,
  };
}

test('只保留当前 cwd 的会话命中', async () => {
  const recall = new SessionRecall(() => fakeQuery(), { cwd: () => cwd, timeoutMs: 50 });
  const result = await recall.search('记忆');
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.map((h) => h.sessionId), ['s1']);
});

test('sessionQuery 缺失返回 unavailable', async () => {
  const recall = new SessionRecall(() => undefined, { cwd: () => cwd, timeoutMs: 50 });
  const result = await recall.search('记忆');
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});

test('超时降级为 timeout', async () => {
  const recall = new SessionRecall(
    () =>
      fakeQuery({
        searchSessions: (_req, exec) =>
          new Promise((_resolve, reject) => {
            exec?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      }),
    { cwd: () => cwd, timeoutMs: 20 },
  );
  const result = await recall.search('记忆');
  assert.deepEqual(result, { ok: false, reason: 'timeout' });
});

test('readSession 只保留 user/assistant 文本', async () => {
  const recall = new SessionRecall(() => fakeQuery(), { cwd: () => cwd, timeoutMs: 50 });
  const result = await recall.read('s1', 200);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.value, /用户：你好/);
  assert.match(result.value, /助手：在的/);
});
