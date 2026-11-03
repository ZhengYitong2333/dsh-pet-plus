#!/usr/bin/env node
/**
 * 抖音 / 小红书选择器实机体检：连接一个已打开调试端口的 Chrome，统计每个选择器命中数。
 *
 * 用法：
 *   1. 用调试端口启动 Chrome 并手动登录平台：
 *      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *        --remote-debugging-port=9222 --user-data-dir="$HOME/.dsh/chrome-profile"
 *   2. node scripts/check-selectors.mjs --port 9222 --platform douyin
 *   3. node scripts/check-selectors.mjs --port 9222 --list   # 先看有哪些页面
 *
 * 按平台域名自动选页面（douyin.com / xiaohongshu.com），--platform all 不会把
 * 抖音的结果当成小红书。只读 DOM，不滚动、不点击、不发送；命中数为 0 时给出
 * 可操作的下一步。
 */
import { PLATFORMS } from '../src/host/content/platforms.ts';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : fallback;
}
const port = Number(flag('port', '9222'));
const platform = flag('platform', 'all');
const onlyList = args.includes('--list');

/** 平台页面判定：只要 host 命中就够，登录页 / 推荐流 / 搜索页都能体检。 */
const PAGE_HOSTS = {
  douyin: ['douyin.com'],
  xhs: ['xiaohongshu.com'],
};

async function pages() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('调试端口 HTTP ' + res.status);
  const list = await res.json();
  return list.filter((t) => t.type === 'page' && typeof t.webSocketDebuggerUrl === 'string');
}

/**
 * 选页面：只认 host 命中当前平台的标签页。
 * 多个平台时绝不复用同一个页面——否则会把抖音结果当成小红书。
 */
async function pageTarget(id) {
  const list = await pages();
  if (list.length === 0) throw new Error('没有可调试的页面，先在 Chrome 里打开平台首页');
  const hosts = PAGE_HOSTS[id] ?? [];
  return list.find((page) => {
    try {
      const host = new URL(page.url).hostname;
      return hosts.some((h) => host === h || host.endsWith('.' + h));
    } catch {
      return false;
    }
  });
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

async function inspect(target, adapter) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  try {
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
  } finally {
    ws.close();
  }
}

async function main() {
  const ids = platform === 'all' ? Object.keys(PLATFORMS) : [platform];
  if (ids.some((id) => !PLATFORMS[id])) throw new Error('--platform 只能是 douyin / xhs / all');
  if (onlyList) {
    for (const page of await pages()) console.log(`${page.id}\t${page.title || '(无标题)'}\t${page.url}`);
    return;
  }
  const missing = [];
  for (const id of ids) {
    const target = await pageTarget(id);
    if (target === undefined) {
      missing.push(id);
      continue;
    }
    await inspect(target, PLATFORMS[id]);
  }
  if (missing.length > 0) {
    console.log(`\n未找到页面：${missing.join(', ')}。先在调试 Chrome 里打开对应平台首页（登录后可体检评论框）。`);
  }
}

main().catch((error) => {
  console.error('[check-selectors] ' + (error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
