#!/usr/bin/env node
/**
 * 本地安装助手：把当前仓库 link 进一个 DSH profile，并把 bundle 加进加载列表。
 *
 * 用法：
 *   node scripts/install-local.mjs --profile web
 *   node scripts/install-local.mjs --profile desktop
 *
 * 只做三件事：pnpm link → 改 profile package.json 的 dsh.profile.bundles → 打印下一步。
 * 不重启 DSH、不改用户配置、不写任何密钥。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf('--' + name);
  return index >= 0 ? args[index + 1] : fallback;
}

const repo = resolve(new URL('..', import.meta.url).pathname);
const profile = flag('profile', 'web');
const home = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE || '', '.dsh');
const profileDir = join(home, 'profiles', profile);
const pkgPath = join(profileDir, 'package.json');

if (!existsSync(join(repo, 'lib', 'index.js'))) {
  console.error('[install-local] 还没构建：先跑 pnpm build');
  process.exit(1);
}
if (!existsSync(pkgPath)) {
  console.error(`[install-local] 找不到 profile：${profileDir}\n先跑：dsh plugin --profile ${profile} add link:${repo}`);
  process.exit(1);
}

console.log(`[install-local] profile=${profile} repo=${repo}`);
execFileSync('dsh', ['plugin', '--profile', profile, 'add', 'link:' + repo], { stdio: 'inherit' });

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const bundles = pkg?.dsh?.profile?.bundles;
if (!Array.isArray(bundles)) {
  console.error('[install-local] profile package.json 缺少 dsh.profile.bundles');
  process.exit(1);
}
if (!bundles.includes('dsh-pet-plus')) {
  bundles.push('dsh-pet-plus');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('[install-local] 已把 dsh-pet-plus 加到 bundles 末尾');
} else {
  console.log('[install-local] bundles 已包含 dsh-pet-plus');
}

console.log(`
下一步：
  1. 重启 DSH（或退出后重新打开 DeepSeek Harness）；
  2. 浏览器打开当前 GUI 后刷新页面；
  3. 验证：
       curl -s http://127.0.0.1:51769/plugins/dsh-pet-plus/client.js | head -c 80
       curl -s http://127.0.0.1:51769/dsh-pet-plus/config | head -c 80
  4. 设置 → 桌宠配置 / 桌宠 Plus；快捷键 Mod+Alt+K / Mod+Alt+J。
`);
