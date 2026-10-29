import assert from 'node:assert/strict';
import test from 'node:test';
import { generateSuggestions, SuggestCache } from './suggest.ts';

test('没有可用模型时走零成本模板', async () => {
  const result = await generateSuggestions(
    { agentDefaultModel: { currentSelection: () => ({ provider: '', model: '' }) } },
    { system: '你是桌宠', recent: ['我不吃辣'], memories: ['我对花生过敏'] },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source, 'template');
  assert.equal(result.options.length, 3);
  assert.ok(result.options.every((o) => Array.from(o).length <= 60));
});

test('缓存命中与过期', () => {
  const cache = new SuggestCache(1000);
  cache.set('k', ['a', 'b', 'c'], 'llm', 1000);
  assert.deepEqual(cache.get('k', 1500)?.options, ['a', 'b', 'c']);
  assert.equal(cache.get('k', 2500), undefined);
});
