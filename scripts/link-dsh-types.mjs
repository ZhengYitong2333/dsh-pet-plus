#!/usr/bin/env node
/**
 * 开发期把 DSH 自带的 @deepseek-ai/* 包链进本项目 node_modules，
 * 让 tsc / tsdown 能解析 peer 依赖；发布物不依赖本脚本。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const nm = join(root, 'node_modules');
mkdirSync(nm, { recursive: true });

function candidates() {
  const list = [];
  if (process.env.DSH_PACKAGE_ROOT) list.push(join(process.env.DSH_PACKAGE_ROOT, 'node_modules', '@deepseek-ai'));
  try {
    const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    list.push(join(globalRoot, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai'));
  } catch {}
  list.push('/Applications/DeepSeek Harness.app/Contents/Resources/app.asar.unpacked/dsh/node_modules/@deepseek-ai');
  return list;
}

const src = candidates().find((p) => existsSync(p));
if (!src) {
  console.error('[link-dsh-types] 找不到 DSH 的 @deepseek-ai 包目录；可设置 DSH_PACKAGE_ROOT。');
  process.exit(1);
}

const dest = join(nm, '@deepseek-ai');
try {
  if (lstatSync(dest)) {
    console.log('[link-dsh-types] 已存在：' + dest);
    process.exit(0);
  }
} catch {}
mkdirSync(join(nm, '@deepseek-ai'), { recursive: true });
// 逐个链子包，避免覆盖已有目录
for (const name of execFileSync('ls', [src], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
  const target = join(dest, name);
  try {
    lstatSync(target);
  } catch {
    symlinkSync(join(src, name), target, 'dir');
  }
}
console.log('[link-dsh-types] 已链接 ' + src + ' -> ' + dest);
