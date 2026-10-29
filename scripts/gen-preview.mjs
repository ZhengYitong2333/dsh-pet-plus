#!/usr/bin/env node
/**
 * 生成 README 功能预览图（开发用，不参与运行时）：
 *  - 伴侣面板：从 src/client/companion.ts 抽出真实 CSS，套一份示例内容渲染；
 *  - 全局热键小窗：直接截 runtime/electron-helper/suggest.html?demo=1。
 *
 * 依赖本机 Chrome；找不到就跳过（CI 不跑）。生成的 PNG 提交进 docs/assets。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const OUT = join(ROOT, 'docs', 'assets');
const CHROME =
  process.env.CHROME_PATH ||
  ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
    (p) => existsSync(p),
  );

if (!CHROME) {
  console.error('[gen-preview] 找不到 Chrome，设置 CHROME_PATH 后重试');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

function screenshot(url, width, height, out) {
  execFileSync(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--hide-scrollbars',
      '--no-first-run',
      '--user-data-dir=' + join(tmpdir(), 'dsh-pet-plus-preview-profile'),
      '--default-background-color=00000000',
      `--window-size=${width},${height}`,
      '--screenshot=' + out,
      url,
    ],
    { stdio: 'inherit' },
  );
}

// ---------- 伴侣面板 ----------
const source = readFileSync(join(ROOT, 'src/client/companion.ts'), 'utf8');
const cssMatch = /function css\(\): string \{\s*return `([\s\S]*?)`;\s*\}/.exec(source);
if (!cssMatch) throw new Error('companion.ts 里找不到 css() 模板');
const cssText = cssMatch[1].replaceAll('${ROOT_ID}', 'dsh-pet-plus-companion').replaceAll('${ID}', 'dsh-pet-plus-island');

const rows = [
  ['✓', '写完 v0.1.0 的发版说明', '已完成', true],
  ['○', '给妈妈回电话', '还有 2 小时', false],
  ['○', '整理 IM 联调记录', '已超时 18 分钟', false, true],
  ['○', '把记忆面板的预览图放进 README', '明天', false],
];
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
html,body{margin:0;background:transparent}
${cssText}
#dsh-pet-plus-companion{position:absolute;left:16px;top:16px;right:auto;bottom:auto}
#dsh-pet-plus-companion .dpp-panel{position:relative;right:auto;bottom:auto;width:380px;max-height:none}
</style></head><body>
<div id="dsh-pet-plus-companion">
  <div class="dpp-panel">
    <div class="dpp-head"><span class="dpp-title">大肥鱼 · 伴侣面板</span><span class="dpp-x">✕</span></div>
    <div class="dpp-tabs">
      <button class="dpp-tab on">待办</button><button class="dpp-tab">天气</button>
      <button class="dpp-tab">音乐</button><button class="dpp-tab">记忆</button>
      <button class="dpp-tab">快捷</button><button class="dpp-tab">内容</button>
      <button class="dpp-tab">朗读</button><button class="dpp-tab">专注</button>
    </div>
    <div class="dpp-body">
      ${rows
        .map(
          ([mark, text, due, done, over]) =>
            `<div class="dpp-row"><input type="checkbox" ${done ? 'checked' : ''}/><div class="dpp-grow ${
              done ? 'dpp-done' : ''
            }">${text}<span class="${over ? 'dpp-over' : 'dpp-due'}">${due}</span></div><button class="dpp-mini">✕</button></div>`,
        )
        .join('')}
      <div class="dpp-add"><input type="text" placeholder="要做什么？回车添加"/><input type="datetime-local" style="width:150px"/><button class="dpp-primary">添加</button></div>
    </div>
  </div>
  <button class="dpp-btn" style="margin-top:10px">✦</button>
</div></body></html>`;

const previewHtml = join(tmpdir(), 'dsh-pet-plus-companion-preview.html');
writeFileSync(previewHtml, html);
screenshot('file://' + previewHtml, 412, 420, join(OUT, 'companion.png'));
console.log('[gen-preview] docs/assets/companion.png');

// ---------- 全局热键小窗 ----------
screenshot(
  'file://' + join(ROOT, 'runtime/electron-helper/suggest.html') + '?demo=1',
  380,
  246,
  join(OUT, 'global-hotkey.png'),
);
console.log('[gen-preview] docs/assets/global-hotkey.png');
