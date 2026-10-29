import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ProfileStore } from './profile.ts';

function store(): { dir: string; p: ProfileStore } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-profile-'));
  return { dir, p: new ProfileStore(join(dir, 'profile.json'), join(dir, 'backups')) };
}

test('新增 + 按文本去重（hits 递增，不新增条目）', async () => {
  const { dir, p } = store();
  try {
    const a = await p.add({ text: '我不吃辣', layer: 'user', source: 'manual' });
    assert.equal(a?.created, true);
    const b = await p.add({ text: '  我不吃辣 ', layer: 'user', source: 'manual' });
    assert.equal(b?.created, false);
    assert.equal(p.list().length, 1);
    assert.equal(p.list()[0].hits, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('自动来源不改已有条目的层与 updatedAt', async () => {
  const { dir, p } = store();
  try {
    await p.add({ text: '我不吃辣', layer: 'user', source: 'manual' });
    const before = p.list()[0];
    await p.applyOps([{ op: 'ADD', text: '我不吃辣', layer: 'fact' }], 'auto');
    const after = p.list()[0];
    assert.equal(after.layer, 'user');
    assert.equal(after.updatedAt, before.updatedAt);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('forget 写墓碑，同一文本不能再被加回；restore 可恢复', async () => {
  const { dir, p } = store();
  try {
    await p.add({ text: '我对花生过敏', layer: 'user', source: 'manual' });
    const id = p.list()[0].id;
    assert.equal(await p.forget(id), true);
    assert.equal(await p.add({ text: '我对花生过敏', layer: 'user', source: 'manual' }), undefined);
    assert.equal(await p.restore(id), true);
    assert.equal(p.list()[0].id, id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('新事实取代旧事实：旧条 archived + supersededBy 指向新条', async () => {
  const { dir, p } = store();
  try {
    await p.add({ text: '我不吃辣', layer: 'fact', source: 'manual' });
    const old = p.list()[0];
    await p.applyOps([{ op: 'UPDATE', text: '我现在吃辣了', supersedes: old.id }], 'auto');
    const all = p.list({ includeArchived: true });
    const oldAfter = all.find((e) => e.id === old.id)!;
    const fresh = all.find((e) => e.text === '我现在吃辣了')!;
    assert.equal(oldAfter.archived, true);
    assert.equal(oldAfter.supersededBy, fresh.id);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('索引只含 active，且遵守字符上限', async () => {
  const { dir, p } = store();
  try {
    await p.add({ text: '我不吃辣', layer: 'user', source: 'manual', importance: 5 });
    await p.add({ text: '我周三下午有课', layer: 'fact', source: 'auto', importance: 2 });
    const index = p.renderIndex(200);
    assert.match(index, /我不吃辣/);
    assert.ok(Array.from(index).length <= 200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
