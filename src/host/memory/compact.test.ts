import assert from 'node:assert/strict';
import test from 'node:test';
import { compactMessages, summarizeDropped } from './compact.ts';

test('未超过阈值不裁剪', () => {
  const messages = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
  const r = compactMessages(messages, 30, 10);
  assert.equal(r.compacted, false);
  assert.equal(r.kept.length, 40);
});

test('超过阈值保留最近 keep 轮，其余进 dropped', () => {
  const messages = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }));
  const r = compactMessages(messages, 30, 10);
  assert.equal(r.compacted, true);
  assert.equal(r.kept.length, 20);
  assert.equal(r.dropped.length, 60);
  assert.equal(r.kept[0].content, '60');
});

test('非法/过小参数回落到安全值', () => {
  const messages = Array.from({ length: 8 }, (_, i) => ({ role: 'user', content: String(i) }));
  const r = compactMessages(messages, 1, 0);
  assert.equal(r.compacted, false, 'after 至少 4 轮，8 条不触发');
  const r2 = compactMessages(Array.from({ length: 30 }, (_, i) => i), 4, 1);
  assert.equal(r2.compacted, true);
  assert.equal(r2.kept.length, 2);
});

test('摘要只取最近的用户输入并截断', () => {
  const summary = summarizeDropped([
    { role: 'user', content: '第一件事' },
    { role: 'assistant', content: '好的' },
    { role: 'user', content: '第二件事' },
  ]);
  assert.match(summary, /第一件事/);
  assert.match(summary, /第二件事/);
  assert.ok(summary.length <= 300);
  assert.equal(summarizeDropped([{ role: 'assistant', content: '嗯' }]), '');
});
