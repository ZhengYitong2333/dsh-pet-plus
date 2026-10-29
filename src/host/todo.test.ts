import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { TodoStore } from './todo.ts';

test('待办增删改查', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-todo-'));
  try {
    const store = new TodoStore(join(dir, 'todo.json'));
    const item = await store.add('写 README');
    assert.ok(item);
    assert.equal(store.list().length, 1);
    await store.update(item!.id, { done: true });
    assert.equal(store.list()[0].done, true);
    assert.equal(await store.remove(item!.id), true);
    assert.equal(store.list().length, 0);
    assert.equal(await store.add('   '), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
