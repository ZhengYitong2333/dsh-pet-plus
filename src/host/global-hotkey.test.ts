/**
 * 全局热键（P7）的源码级守卫：
 * 主进程注册/注销 → 宠物窗口拉 /suggest → preload 转发 → 小窗展示/复制/关闭。
 * 这条链路跨 4 个文件、没有 bundler 兜底，任何一环漏了都只会在用户机器上静默失效。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

test('main.js：注册全局快捷键，触发时广播给宠物窗口，退出时注销', () => {
  const main = read('../../runtime/electron-helper/main.js');
  assert.match(main, /globalShortcut\.register\(accelerator/);
  assert.match(main, /pet:global-shortcut/);
  assert.match(main, /globalShortcut\.unregisterAll\(\)/);
  assert.match(main, /DSH_PET_GLOBAL_SHORTCUT/);
  assert.match(main, /loadFile\(path\.join\(__dirname, 'suggest\.html'\)\)/);
});

test('preload：暴露热键、展示候选、复制、关闭与候选数据订阅', () => {
  const preload = read('../../runtime/electron-helper/preload.js');
  for (const name of ['onGlobalShortcut', 'showSuggest', 'copyText', 'closeSuggest', 'onSuggestData']) {
    assert.ok(new RegExp(`\\b${name}\\(`).test(preload), `preload 缺少 ${name}`);
  }
  assert.match(preload, /pet:suggest-options/);
  assert.match(preload, /suggest:data/);
});

test('renderer.js：收到热键后请求 /suggest 并交给小窗', () => {
  const renderer = read('../../runtime/electron-helper/renderer.js');
  assert.match(renderer, /onGlobalShortcut/);
  assert.match(renderer, /BASE \+ '\/suggest'/);
  assert.match(renderer, /showSuggest\(data\.options/);
  assert.match(renderer, /globalSuggestBusy/);
});

test('suggest 小窗：可点击复制、Esc 关闭、1/2/3 选择', () => {
  const html = read('../../runtime/electron-helper/suggest.html');
  const js = read('../../runtime/electron-helper/suggest.js');
  assert.match(html, /suggest\.js/);
  assert.match(js, /copyText/);
  assert.match(js, /closeSuggest/);
  assert.match(js, /event\.key === 'Escape'/);
  assert.match(js, /index >= 1 && index <= options\.length/);
  assert.match(js, /textContent = text/, '候选必须用 textContent 写入，避免 HTML 注入');
});
