import assert from 'node:assert/strict';
import test from 'node:test';
import { extractUrl, parseLink } from './link.ts';
import { contentConfigOf, inQuietHours } from './config.ts';
import { generateDigest } from './generate.ts';

test('识别抖音/小红书链接', () => {
  assert.equal(parseLink('看这个 https://v.douyin.com/abc123/ 哈哈')?.platform, 'douyin');
  assert.equal(parseLink('https://www.xiaohongshu.com/explore/123456')?.platform, 'xhs');
  assert.equal(parseLink('https://example.com/x'), undefined);
  assert.equal(extractUrl('xx https://v.douyin.com/a/ 。'), 'https://v.douyin.com/a/');
});

test('配置默认关闭自动化、静默时段跨午夜', () => {
  const c = contentConfigOf({});
  assert.equal(c.auto.enabled, false);
  assert.equal(c.auto.dryRun, true);
  assert.equal(inQuietHours(['23:00', '08:00'], new Date('2026-10-29T02:00:00')), true);
  assert.equal(inQuietHours(['23:00', '08:00'], new Date('2026-10-29T12:00:00')), false);
});

test('无模型时走模板，仍返回 3 条候选', async () => {
  const result = await generateDigest(
    { agentDefaultModel: { currentSelection: () => ({ provider: '', model: '' }) } },
    { text: '一条测试内容', link: parseLink('https://www.xiaohongshu.com/explore/1') },
  );
  assert.equal(result.source, 'template');
  assert.equal(result.comments.length, 3);
  assert.ok(result.summary.length > 0);
});
