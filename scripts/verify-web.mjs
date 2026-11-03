#!/usr/bin/env node
/**
 * Web profile 冒烟：验证 DSH 服务端确实提供了 dsh-pet-plus 的浏览器半侧与宿主路由。
 *
 * 用法：
 *   node scripts/verify-web.mjs --url "http://127.0.0.1:51769/?token=..."
 *   DSH_WEB_URL="http://127.0.0.1:51769/?token=..." node scripts/verify-web.mjs
 *
 * 为什么不能直接 curl /plugins/dsh-pet-plus/client.js：DSH 的客户端资源按
 * `<id>/client.js&rev=<hash>` 组合并带修订号下发，裸路径一定 404。这里从首页的
 * __DSH_BOOT__ 里取出真实 URL 再请求。
 */
const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : fallback;
}

const rawUrl = flag('url', process.env.DSH_WEB_URL ?? 'http://127.0.0.1:51769/');
let base;
try {
  base = new URL(rawUrl);
} catch {
  console.error('[verify-web] --url 不是合法 URL：' + rawUrl);
  process.exit(1);
}

function fail(message) {
  console.error('[verify-web] 失败：' + message);
  process.exit(1);
}

async function get(path, expectJson = false) {
  const url = new URL(path, base);
  const res = await fetch(url, { headers: authHeaders, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  if (!res.ok) {
    const hint =
      res.status === 401
        ? '（首页需要 DSH 打印的 token；把完整 URL 传给 --url，例：--url "http://127.0.0.1:51769/?token=..."）'
        : '';
    fail(`${url.pathname} 返回 ${res.status}${hint}`);
  }
  if (expectJson) {
    try {
      return { res, json: JSON.parse(text) };
    } catch {
      fail(`${url.pathname} 不是 JSON：${text.slice(0, 80)}`);
    }
  }
  return { res, text };
}

// DSH 用 ?token= 换一次 303 + Set-Cookie；Node fetch 不会在重定向间带 cookie，
// 所以手动完成这次交换，后续请求都带上 dsh-auth-* cookie。
let homeRes = await fetch(base, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
let cookie = '';
if (homeRes.status >= 300 && homeRes.status < 400) {
  cookie = (homeRes.headers.getSetCookie?.() ?? []).map((item) => item.split(';')[0]).join('; ');
  const location = new URL(homeRes.headers.get('location') ?? './', base);
  homeRes = await fetch(location, {
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(8000),
  });
}
const homeText = await homeRes.text();
if (!homeRes.ok) {
  const hint =
    homeRes.status === 401
      ? '（首页需要 DSH 打印的 token；把完整 URL 传给 --url，例：--url "http://127.0.0.1:51769/?token=..."）'
      : '';
  fail(`首页 ${base.href} 返回 ${homeRes.status}${hint}`);
}
const authHeaders = cookie ? { cookie } : {};
const match = homeText.match(/globalThis\["__DSH_BOOT__"\]\s*=\s*(\{[\s\S]*?\})<\/script>/);
if (!match) fail('首页里找不到 __DSH_BOOT__（DSH 版本或页面结构变了）');
let boot;
try {
  boot = JSON.parse(match[1]);
} catch (error) {
  fail('__DSH_BOOT__ 不是合法 JSON：' + (error instanceof Error ? error.message : String(error)));
}
const entry = (boot.entries ?? []).find((item) => item.id === 'dsh-pet-plus');
if (!entry) fail('__DSH_BOOT__ 里没有 dsh-pet-plus —— profile bundles 未包含或插件加载失败');

const clientUrl = new URL(entry.url, base);
const client = await fetch(clientUrl, { headers: authHeaders, signal: AbortSignal.timeout(15000) });
const clientBody = await client.text();
if (!client.ok) fail(`客户端资源 ${clientUrl.pathname} 返回 ${client.status}`);
if (!clientBody.includes('伴侣面板')) fail('客户端资源里没有预期代码（可能拿到了旧缓存/空包）');
const type = client.headers.get('content-type') ?? '';
if (!type.includes('javascript')) fail('客户端资源 content-type 不是 JS：' + type);

for (const route of ['/dsh-pet-plus/config', '/dsh-pet-plus/todo']) {
  const { json } = await get(route, true);
  if (json === null || typeof json !== 'object') fail(route + ' 没有返回对象');
}

console.log('[verify-web] OK');
console.log(`  DSH release : ${boot.release?.version ?? 'unknown'}`);
console.log(`  plugin entry: dsh-pet-plus rev=${entry.rev}`);
console.log(`  client.js   : ${clientUrl.pathname}${clientUrl.search} (${clientBody.length} bytes, ${type})`);
console.log('  host routes : /dsh-pet-plus/config ✓  /dsh-pet-plus/todo ✓');
