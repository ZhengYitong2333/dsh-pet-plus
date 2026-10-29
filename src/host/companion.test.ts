import assert from 'node:assert/strict';
import test from 'node:test';
import { festivalOf, getWeather } from './weather.ts';
import { assistText } from './assist.ts';

test('节日识别（固定日期）', () => {
  const f = festivalOf(new Date('2026-10-01T10:00:00'));
  assert.equal(f.name, '国庆节');
  assert.equal(f.weekday.length > 0, true);
});

test('未配置城市时天气结构化失败', async () => {
  const w = await getWeather('');
  assert.equal(w.ok, false);
  assert.match(w.message ?? '', /城市/);
});

test('无模型时 assist 走模板', async () => {
  const r = await assistText(
    { agentDefaultModel: { currentSelection: () => ({ provider: '', model: '' }) } },
    { text: '这是一段测试文本', kind: 'summary' },
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.source, 'template');
});
