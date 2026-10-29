import assert from 'node:assert/strict';
import test from 'node:test';
import { quickItemsOf, openQuick } from './quicklaunch.ts';

test('快捷启动只放行合法条目', () => {
  const items = quickItemsOf({
    p2: { quickLaunch: { items: [
      { id: 'a', label: 'A', type: 'url', target: 'https://example.com' },
      { id: 'b', label: 'B', type: 'app', target: '/Applications/Safari.app' },
      { id: '', label: 'X', type: 'url', target: 'https://x' },
      { id: 'c', type: 'url' },
    ] } },
  });
  assert.equal(items.length, 2);
  assert.equal(openQuick({ id: 'a', label: 'A', type: 'url', target: 'javascript:alert(1)' }).ok, false);
});
