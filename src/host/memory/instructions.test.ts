import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { InstructionsStore } from './instructions.ts';

function store(): { dir: string; s: InstructionsStore; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-instr-'));
  const file = join(dir, 'instructions.md');
  const s = new InstructionsStore(file, join(dir, 'backups'), () => new Date('2026-10-29T00:00:00Z'));
  return { dir, s, file };
}

test('空文件读取为空快照', () => {
  const { dir, s } = store();
  try {
    assert.deepEqual(s.read(), { text: '', version: 0, updatedAt: '' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('保存后版本递增、可读回、带 frontmatter', () => {
  const { dir, s, file } = store();
  try {
    const first = s.save('不要在早上打扰我');
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.snapshot.version, 1);
    assert.equal(s.read().text, '不要在早上打扰我');
    assert.match(readFileSync(file, 'utf8'), /^---\nversion: 1/m);
    const second = s.save('我不吃辣');
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.snapshot.version, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('expectedVersion 不匹配返回 conflict，且不写盘', () => {
  const { dir, s } = store();
  try {
    const first = s.save('a');
    assert.equal(first.ok, true);
    const conflict = s.save('b', 99);
    assert.equal(conflict.ok, false);
    if (conflict.ok) return;
    assert.equal(conflict.reason, 'conflict');
    assert.equal(s.read().text, 'a');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('空正文拒绝保存；clear 保留版本递增', () => {
  const { dir, s } = store();
  try {
    const invalid = s.save('   ');
    assert.equal(invalid.ok, false);
    s.save('x');
    const cleared = s.clear();
    assert.equal(cleared.ok, true);
    assert.equal(s.read().text, '');
    assert.ok(s.read().version >= 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
