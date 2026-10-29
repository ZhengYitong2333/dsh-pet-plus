import { defineConfig } from 'tsdown';

/**
 * 两个产物：
 *  - lib/index.js  host 半侧（ESM，@deepseek-ai/* 由 DSH 提供，其余运行时依赖打进包）
 *  - lib/client.js 浏览器半侧（IIFE，经 window.__ModuleLoader__ 注册；react 由宿主 require）
 */
export default defineConfig([
  {
    entry: { index: 'src/host/index.ts' },
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'node22',
    dts: false,
    clean: false,
    sourcemap: false,
    outExtensions: () => ({ js: '.js' }),
    deps: { neverBundle: [/^@deepseek-ai\//] },
  },
  {
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: ['iife'],
    platform: 'browser',
    target: 'es2020',
    dts: false,
    clean: false,
    sourcemap: false,
    outExtensions: () => ({ js: '.js' }),
  },
]);
