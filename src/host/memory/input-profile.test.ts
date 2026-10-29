import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExtractPrompt,
  parseExtractedFacts,
  shouldExtractInputProfile,
} from './input-profile.ts';

test('提炼提示词包含最近输入并截断', () => {
  const prompt = buildExtractPrompt(['我喜欢喝美式', '下周三去上海出差']);
  assert.match(prompt, /我喜欢喝美式/);
  assert.match(prompt, /JSON/);
});

test('解析 JSON 数组：过滤过长/过短/重复，layer 与 importance 归一', () => {
  const facts = parseExtractedFacts(`好的，结果如下：
\`\`\`json
[
  {"text":"用户喜欢喝美式","layer":"user","importance":0.9},
  {"text":"用户喜欢喝美式","layer":"user","importance":0.9},
  {"text":"a","layer":"fact"},
  {"text":"用户对花生过敏","layer":"fact","importance":5},
  {"text":"用户在准备周报","layer":"topic","importance":0.5},
  {"text":"第六第六第六第六条","layer":"user","importance":0.5},
  {"text":"第七条应该被截断","layer":"user","importance":0.5}
]
\`\`\``);
  assert.equal(facts.length, 5);
  assert.equal(facts[0].text, '用户喜欢喝美式');
  assert.equal(facts[1].importance, 1);
  assert.equal(facts[2].layer, 'topic');
});

test('模型输出不是 JSON 时返回空数组', () => {
  assert.deepEqual(parseExtractedFacts('我觉得你人很好'), []);
  assert.deepEqual(parseExtractedFacts(''), []);
});

test('触发判断：条数、间隔与关闭', () => {
  const base = { enabled: true, promptsSinceLast: 10, every: 10, lastExtractAt: 0, now: 1_000_000 };
  assert.equal(shouldExtractInputProfile(base), true);
  assert.equal(shouldExtractInputProfile({ ...base, promptsSinceLast: 9 }), false);
  assert.equal(shouldExtractInputProfile({ ...base, enabled: false }), false);
  assert.equal(shouldExtractInputProfile({ ...base, every: 0 }), false);
  assert.equal(shouldExtractInputProfile({ ...base, lastExtractAt: base.now - 60_000 }), false);
  assert.equal(shouldExtractInputProfile({ ...base, lastExtractAt: base.now - 11 * 60_000 }), true);
});
