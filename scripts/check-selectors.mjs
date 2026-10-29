#!/usr/bin/env node
/**
 * 抖音 / 小红书选择器实机体检：连接一个已打开调试端口的 Chrome，统计每个选择器命中数。
 *
 * 用法：
 *   1. 用调试端口启动 Chrome 并手动登录平台：
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --remote-debugging-port=9222 --user-data-dir="$HOME/.dsh/chrome-profile"
 *   2. node scripts/check-selectors.mjs --port 9222 --platform douyin
 *
 * 只读 DOM，不滚动、不点击、不发送；命中数为 0 时给出可操作的下一步。
 */
import { PLATFORMS } from '../src/host/content/platforms.ts';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : fallback;
}
const port = Number(flag('port', '9222'));
const platform = flag('platform', 'all');

async function pageTarget() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('调试端口 HTTP ' + res.status);
  const list = await res.json();
  const pages = list.filter((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string');
  if (pages.length === 0) throw new Error('没有可调试的页面，先在 Chrome 里打开平台首页');
  return pages[0];
}

function evaluate(ws, expression) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => reject(new Error('CDP evaluate 超时')), 10_000);
    const onMessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (msg.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(msg.error.message ?? 'CDP error'));
      else resolve(msg.result?.result?.value);
    };
    ws.addEventListener('message', onMessage);
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      }),
    );
  });
}

async function main() {
  const ids = platform === 'all' ? Object.keys(PLATFORMS) : [platform];
  if (ids.some((id) => !PLATFORMS[id])) throw new Error('--platform 只能是 douyin / xhs / all');
  const target = await pageTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  try {
    for (const id of ids) {
      const adapter = PLATFORMS[id];
      const selectors = {
        feedCards: adapter.feedCards,
        commentButton: adapter.commentButton,
        commentInput: adapter.commentInput,
        submitButton: adapter.submitButton,
      };
      const result = await evaluate(
        ws,
        `(() => {
          const sels = ${JSON.stringify(selectors)};
          const out = { url: location.href, title: document.title, counts: {}, samples: {} };
          for (const [key, sel] of Object.entries(sels)) {
            try {
              const nodes = document.querySelectorAll(sel);
              out.counts[key] = nodes.length;
              out.samples[key] = (nodes[0]?.innerText || nodes[0]?.getAttribute('placeholder') || '').slice(0, 60);
            } catch (e) {
              out.counts[key] = -1;
              out.samples[key] = String(e && e.message ? e.message : e);
            }
          }
          return out;
        })()`,
      );
      console.log(`\n=== ${adapter.name} (${adapter.id}) ===`);
      console.log(`页面：${result.title || '(无标题)'}  ${result.url}`);
      for (const key of Object.keys(selectors)) {
        const count = result.counts[key];
        const mark = count > 0 ? '✓' : '✗';
        console.log(`  ${mark} ${key}: ${count} 个 ${result.samples[key] ? '｜' + result.samples[key] : ''}`);
      }
      if (Object.values(result.counts).some((n) => n === 0)) {
        console.log('  提示：先确保已登录并停在平台首页/推荐流；仍为 0 就更新 src/host/content/platforms.ts。');
      }
    }
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error('[check-selectors] ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
