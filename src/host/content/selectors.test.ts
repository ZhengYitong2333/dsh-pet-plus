/**
 * 选择器诊断脚本的源码守卫：平台适配器与脚本必须同步，
 * 否则用户按文档跑 `pnpm check:selectors` 时会漏掉某个平台。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PLATFORMS } from './platforms.ts';

test('两个平台的四类选择器都存在且非空', () => {
  for (const id of ['douyin', 'xhs'] as const) {
    const adapter = PLATFORMS[id];
    assert.ok(adapter.home.startsWith('https://'), id + ' home');
    for (const key of ['feedCards', 'commentButton', 'commentInput', 'submitButton'] as const) {
      assert.equal(typeof adapter[key], 'string');
      assert.ok(adapter[key].length > 3, `${id}.${key} 不能为空`);
    }
  }
});

test('check-selectors 脚本读取同一份 PLATFORMS 并覆盖四类选择器', () => {
  const script = readFileSync(new URL('../../../scripts/check-selectors.mjs', import.meta.url), 'utf8');
  assert.match(script, /from '\.\.\/src\/host\/content\/platforms\.ts'/);
  for (const key of ['feedCards', 'commentButton', 'commentInput', 'submitButton']) {
    assert.match(script, new RegExp(key));
  }
  assert.match(script, /--platform/);
  assert.match(script, /口.*调试端口|remote-debugging-port/);
});

test('package.json 暴露 check:selectors 脚本', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  assert.match(pkg.scripts?.['check:selectors'] ?? '', /scripts\/check-selectors\.mjs/);
});
