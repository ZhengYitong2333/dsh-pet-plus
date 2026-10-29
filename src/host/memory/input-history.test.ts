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

test('since 与 markExtracted：只取上次提炼后的输入', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-input-'));
  try {
    const h = new InputHistoryStore(join(dir, 'input-history.json'), () => new Date(1_700_000_000_000));
    h.record('s1', '第一条足够长的输入', settings);
    h.record('s1', '第二条足够长的输入', settings);
    assert.equal(h.since(0).length, 2);
    h.markExtracted(1_700_000_000_000);
    assert.equal(h.since(1_700_000_000_000).length, 0);
    assert.equal(h.stats().lastExtractAt, 1_700_000_000_000);
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
