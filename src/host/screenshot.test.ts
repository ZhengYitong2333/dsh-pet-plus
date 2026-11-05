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

test('client：先 /capture，失败回落 getDisplayMedia；权限失败给 macOS 路径', () => {
  const client = read('../client/companion.ts');
  assert.match(client, /api<\{ ok\?: boolean; dataUrl\?: string; message\?: string \}>\('\/capture'/);
  assert.match(client, /getDisplayMedia/);
  assert.match(client, /NotAllowedError/);
  assert.match(client, /系统设置 → 隐私与安全性 → 屏幕录制/);
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
