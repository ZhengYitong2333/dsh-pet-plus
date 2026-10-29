import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BudgetStore } from './budget.ts';

test('按次数与 token 双上限拦截', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-budget-'));
  try {
    const b = new BudgetStore(join(dir, 'budget.json'), () => new Date('2026-10-29T10:00:00'));
    const limits = { calls: 2, tokens: 100 };
    assert.equal(b.consume('memory', 60, limits), true);
    assert.equal(b.consume('memory', 40, limits), true);
    assert.equal(b.consume('memory', 1, limits), false);
    const snap = b.snapshot(limits);
    assert.equal(snap.calls.memory, 2);
    assert.equal(snap.tokens.memory, 100);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('跨日自动重置', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-budget-'));
  try {
    let now = new Date('2026-10-29T23:00:00');
    const b = new BudgetStore(join(dir, 'budget.json'), () => now);
    b.consume('memory', 10, { calls: 1, tokens: 100 });
    assert.equal(b.canSpend(1, { calls: 1, tokens: 100 }), false);
    now = new Date('2026-10-30T00:01:00');
    assert.equal(b.canSpend(1, { calls: 1, tokens: 100 }), true);
    assert.equal(b.snapshot({ calls: 1, tokens: 100 }).calls.memory ?? 0, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
