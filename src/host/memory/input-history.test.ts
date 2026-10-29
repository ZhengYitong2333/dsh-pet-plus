import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { InputHistoryStore, redact } from './input-history.ts';

const settings = { enabled: true, maxPrompts: 5, extractEveryPrompts: 10, ttlDays: 7 };

test('脱敏：key/token/长 hex 被替换', () => {
  const text = redact('用 sk-testkey123 和 Bearer abcdefghijklmnop 以及 token=secret123 访问');
  assert.ok(!text.includes('testkey123'));
  assert.ok(!text.includes('secret123'));
  assert.match(text, /\*\*\*/);
});

test('记录/最近/清空/上限', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-input-'));
  try {
    const h = new InputHistoryStore(join(dir, 'input-history.json'));
    assert.equal(h.record('s1', '你好', settings), false, '过短不入库');
    for (let i = 0; i < 8; i++) h.record('s1', `第 ${i} 条输入内容`, settings);
    assert.equal(h.recent(100).length, 5);
    assert.equal(h.stats().seen, 8);
    h.clear();
    assert.equal(h.recent(10).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('关闭后不记录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-input-'));
  try {
    const h = new InputHistoryStore(join(dir, 'input-history.json'));
    assert.equal(h.record('s1', '这是一条足够长的输入', { ...settings, enabled: false }), false);
    assert.equal(h.recent(10).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
