/**
 * 截图链路守卫：桌面宿主走主进程 desktopCapturer，浏览器才回落 getDisplayMedia；
 * 权限失败必须给出可操作的系统设置路径，不能只弹一句英文。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('host：/capture 优先 desktopCapturer，非桌面宿主显式 not-desktop', () => {
  const host = read('./index.ts');
  assert.match(host, /rest === 'capture'/);
  assert.match(host, /desktopCapturer/);
  assert.match(host, /reason: 'not-desktop'/);
  assert.match(host, /getSources\(\{/);
  assert.match(host, /screencapture/, 'macOS 需要有系统截图兜底');
});

test('client：只保留 🐟 展示按钮，不再挂截图/面板浮动按钮', () => {
  const client = read('../client/companion.ts');
  assert.match(client, /dpp-pet/);
  assert.doesNotMatch(client, /dpp-cam/);
  assert.doesNotMatch(client, /getDisplayMedia/);
  assert.doesNotMatch(client, /dpp-btn[^']*'>✦/);
});

test('展示按钮：仅在 none 时打开，默认 desktop；已打开状态原样沿用', () => {
  const client = read('../client/companion.ts');
  assert.match(client, /dpp-pet/);
  assert.match(client, /'\/pet-display'/);
  assert.match(client, /display: 'desktop'/);
  assert.match(client, /pet\.display === 'desktop'/);
});

test('面板 hidden 必须真正隐藏：.dpp-panel 的 display:flex 会覆盖 UA 的 [hidden]', () => {
  const client = read('../client/companion.ts');
  assert.match(client, /\[hidden\]\{display:none !important\}/);
});

test('右键菜单：文案为「打开程序」，动作走 dsh://open 并回落站点', () => {
  const sprite = read('../../runtime/electron-helper/sprite.js');
  const main = read('../../runtime/electron-helper/main.js');
  assert.match(sprite, /label: '打开程序'/);
  assert.match(main, /shell\.openExternal\('dsh:\/\/open'\)/);
  assert.match(main, /openSite\(url\)/);
});
