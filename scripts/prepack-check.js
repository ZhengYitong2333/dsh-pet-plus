#!/usr/bin/env node
/**
 * 发布前守卫：npm 包必须包含 Helper 运行所需的每个模块。
 *
 * 为什么单独有这一层：Helper 是 Electron 直接 `electron main.js` 拉起的，不经过 bundler，
 * 少一个 require 目标不会在构建期报错，只会在用户机器上“宠物起不来”。这里把
 * runtime/electron-helper 下的必需文件钉死，并与 package.json 的 files 白名单交叉校验。
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function mustExist(rel) {
  if (!existsSync(join(ROOT, rel))) errors.push(`缺少文件：${rel}`);
}

function main() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  if (!files.includes('runtime/electron-helper')) {
    errors.push('package.json files 必须包含 runtime/electron-helper');
  }

  const required = [
    'runtime/electron-helper/main.js',
    'runtime/electron-helper/preload.js',
    'runtime/electron-helper/index.html',
    'runtime/electron-helper/renderer.js',
    'runtime/electron-helper/events.js',
    'runtime/electron-helper/constants.js',
    'runtime/electron-helper/shared-core.js',
    'runtime/electron-helper/sound.js',
    'runtime/electron-helper/host-liveness.js',
    'runtime/electron-helper/dpi-linearization.js',
    'runtime/electron-helper/pointer-target.js',
    'runtime/electron-helper/topmost-watchdog.js',
    'runtime/electron-helper/desktop-geometry.js',
    'runtime/electron-helper/tray-platform.js',
  ];
  for (const rel of required) mustExist(rel);

  // main.js 必须逐个 require 它们；漏了 require 等于漏了功能
  const main = readFileSync(join(ROOT, 'runtime/electron-helper/main.js'), 'utf8');
  for (const rel of [
    'runtime/electron-helper/host-liveness.js',
    'runtime/electron-helper/dpi-linearization.js',
    'runtime/electron-helper/pointer-target.js',
    'runtime/electron-helper/topmost-watchdog.js',
    'runtime/electron-helper/tray-platform.js',
    'runtime/electron-helper/desktop-geometry.js',
  ]) {
    const base = rel.split('/').pop();
    if (!main.includes(`require('./${base}')`) && !main.includes(`require("./${base}")`)) {
      errors.push(`main.js 未 require ${base}`);
    }
  }

  // iife 产物不得带入宿主没有的运行时 helper（#63 的 @oxc-project/runtime 事故）
  const libIndex = join(ROOT, 'lib', 'index.js');
  if (existsSync(libIndex)) {
    const built = readFileSync(libIndex, 'utf8');
    if (built.includes('@oxc-project/runtime')) {
      errors.push('lib/index.js 引用了 @oxc-project/runtime（宿主不提供，加载会崩）');
    }
  }

  if (errors.length > 0) {
    console.error('[prepack-check] 失败：');
    for (const e of errors) console.error(' - ' + e);
    process.exit(1);
  }
  console.log('[prepack-check] OK：Helper 必需文件齐全，main.js require 完整。');
}

main();
