#!/usr/bin/env node
/**
 * 把仓库里的 VP9-alpha webm 转成 README 用 GIF。
 * 透明背景：palettegen reserve_transparent + paletteuse alpha_threshold。
 * 失败不阻塞构建（README 可先用静态图）。
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'docs', 'assets');
mkdirSync(outDir, { recursive: true });

let ffmpeg;
try {
  ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
} catch {
  console.warn('[gen-gifs] 未安装 @ffmpeg-installer/ffmpeg，跳过。');
  process.exit(0);
}

const jobs = [
  { src: 'assets/webm/待机呼吸休闲.webm', out: 'hero.gif', seconds: 5, width: 480 },
  { src: 'assets/webm/点击回应-开心跃动.webm', out: 'click.gif', seconds: 3, width: 420 },
  { src: 'assets/webm/原地专心玩魔方.webm', out: 'idle.gif', seconds: 4, width: 420 },
];

for (const job of jobs) {
  const src = join(root, job.src);
  if (!existsSync(src)) {
    console.warn('[gen-gifs] 缺少素材 ' + job.src);
    continue;
  }
  const out = join(outDir, job.out);
  const vf =
    `fps=12,scale=${job.width}:-1:flags=lanczos,split[s0][s1];` +
    `[s0]palettegen=max_colors=160:reserve_transparent=1[p];` +
    `[s1][p]paletteuse=alpha_threshold=128:dither=bayer`;
  try {
    execFileSync(
      ffmpeg,
      ['-y', '-v', 'error', '-i', src, '-t', String(job.seconds), '-vf', vf, '-loop', '0', out],
      { stdio: 'inherit' },
    );
    const kb = Math.round(statSync(out).size / 1024);
    console.log(`[gen-gifs] ${job.out}  ${kb} KB`);
  } catch (error) {
    console.warn('[gen-gifs] 转换失败：' + job.out + ' ' + String(error));
  }
}
