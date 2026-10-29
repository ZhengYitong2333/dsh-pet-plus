import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { backupFile, readJsonFile, writeJsonAtomic } from './store.ts';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-pet-plus-memory-'));
}

test('writeJsonAtomic 写入并可读回', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'a.json');
    writeJsonAtomic(file, { hello: '世界', n: 1 });
    const read = readJsonFile<{ hello: string; n: number }>(file, { hello: '', n: 0 });
    assert.equal(read.ok, true);
    assert.deepEqual(read.value, { hello: '世界', n: 1 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('损坏 JSON：备份原文件并返回 fallback', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'b.json');
    writeFileSync(file, '{broken', 'utf8');
    const read = readJsonFile<{ ok: boolean }>(file, { ok: false });
    assert.equal(read.ok, true);
    assert.deepEqual(read.value, { ok: false });
    assert.ok(read.backup, '应返回备份路径');
    assert.equal(readFileSync(read.backup!, 'utf8'), '{broken');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('backupFile 复制到备份目录', () => {
  const dir = tempDir();
  try {
    const file = join(dir, 'c.txt');
    writeFileSync(file, 'v1');
    const backup = backupFile(file, join(dir, 'backups'));
    assert.ok(backup);
    assert.equal(readFileSync(backup!, 'utf8'), 'v1');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
