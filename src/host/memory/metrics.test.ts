import assert from 'node:assert/strict';
import test from 'node:test';
import { LatencyStore } from './metrics.ts';

test('空样本返回 0，不产生 NaN', () => {
  const store = new LatencyStore();
  assert.deepEqual(store.stats('first-token'), { count: 0, p50: 0, p95: 0, last: 0 });
});

test('p50/p95 按最近排名取样，last 是最后写入值', () => {
  const store = new LatencyStore();
  for (const ms of [100, 10, 50, 20, 40]) store.record('prep', ms);
  const stat = store.stats('prep');
  assert.equal(stat.count, 5);
  assert.equal(stat.p50, 40);
  assert.equal(stat.p95, 100);
  assert.equal(stat.last, 40);
});

test('容量上限只保留最新样本', () => {
  const store = new LatencyStore(10);
  for (let i = 0; i < 30; i++) store.record('x', i);
  const stat = store.stats('x');
  assert.equal(stat.count, 10);
  assert.equal(stat.last, 29);
  assert.equal(store.stats("x").p50, 25);
});

test('非法值忽略，snapshot/reset 生效', () => {
  const store = new LatencyStore();
  store.record('a', -1);
  store.record('a', Number.NaN);
  store.record('b', 12);
  assert.deepEqual(Object.keys(store.snapshot()), ['b']);
  store.reset();
  assert.deepEqual(store.snapshot(), {});
});
