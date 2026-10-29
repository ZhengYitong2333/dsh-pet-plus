#!/usr/bin/env node
/**
 * 开发流：不经过 DSH 宿主，直接拉起桌面 Helper。
 *
 * 与宿主 HelperProcess 保持同一套环境约定：
 *  - DSH_PET_HOST_PID 注入当前进程 pid（宿主退出 helper 自己退）；
 *  - 删掉 ELECTRON_RUN_AS_NODE（否则 Electron 退化成纯 Node，require('electron') 直接崩）。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const HOME = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || '', '.dsh');
const rel =
  process.platform === 'win32'
    ? 'electron.exe'
    : process.platform === 'darwin'
      ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
      : 'electron';
const fallback = join(HOME, 'electron', rel);
const electron = process.env.DSH_PET_ELECTRON_PATH || fallback;

if (!existsSync(electron)) {
  console.error(`[start-desktop] 找不到 Electron：${electron}\n先运行 node scripts/ensure-electron.mjs，或设置 DSH_PET_ELECTRON_PATH。`);
  process.exit(1);
}

const env = {
  ...process.env,
  DSH_PET_HOST_PID: String(process.pid),
};
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [join(ROOT, 'runtime/electron-helper/main.js')], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  windowsHide: true,
});

child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
