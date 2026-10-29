#!/usr/bin/env node
/** tsdown 的 IIFE 产物固定带 .iife 后缀；统一成 package.json 约定的 client.js。 */
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const from = join(root, 'lib', 'client.iife.js');
const to = join(root, 'lib', 'client.js');
if (existsSync(from)) {
  renameSync(from, to);
  console.log('[postbuild] lib/client.iife.js -> lib/client.js');
}
for (const name of ['index.js', 'client.js']) {
  if (!existsSync(join(root, 'lib', name))) {
    console.error('[postbuild] 缺少产物 lib/' + name);
    process.exit(1);
  }
}
