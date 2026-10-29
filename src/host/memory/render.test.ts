import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMemoryBlock, truncateChars } from './render.ts';
import { memorySettingsOf } from './settings.ts';

const settings = memorySettingsOf({
  memory: { enabled: true, inject: { totalChars: 300, l3Chars: 120 } },
});

test('关闭 / 空指令 → 空串（保持 prompt 不变）', () => {
  assert.equal(renderMemoryBlock({ settings, instructions: '' }), '');
  assert.equal(
    renderMemoryBlock({ settings: { ...settings, enabled: false }, instructions: 'x' }),
    '',
  );
});

test('有指令时带标题并遵守字符上限', () => {
  const text = '我不吃辣。'.repeat(50);
  const block = renderMemoryBlock({ settings, instructions: text });
  assert.match(block, /【你与主人的长期约定】/);
  assert.ok(Array.from(block).length <= 300 + 40, '总长度应受 totalChars 约束');
  assert.ok(block.includes('…'), '超长应截断并带省略号');
});

test('truncateChars 代理对安全', () => {
  assert.equal(truncateChars('🐟🐟🐟', 2), '🐟…');
  assert.equal(truncateChars('abc', 3), 'abc');
});
