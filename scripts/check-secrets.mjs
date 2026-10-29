#!/usr/bin/env node
/**
 * 提交前密钥/隐私扫描。
 *
 * 目的：公开仓库绝不出现真实 key、token、个人路径与本地配置。
 * 规则：
 *   - 扫描源码/文档/配置（不扫 assets、node_modules、lib）；
 *   - 命中高危模式即退出码 1，并打印文件名与行号；
 *   - 同时检查禁止入库的本地数据文件是否被 git 跟踪。
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.jsonc', '.yml', '.yaml',
  '.md', '.html', '.css', '.sh', '.txt', '.toml', '.ini',
]);
const SKIP_DIR = new Set([
  'node_modules', 'lib', 'dist', '.git', '.pnpm-store', '.npm-cache', '.npm-logs',
  '.dsh-types', 'assets', 'docs/assets',
]);
const FORBIDDEN_FILES = [
  'main-config.jsonc', 'main-config.json', 'memory.json', 'profile.json',
  'episodes.jsonl', 'input-history.json', 'budget.json', 'metrics.json',
  'content-log.jsonl', 'chrome-profile',
];
// 测试夹具里的明显假值（不构成泄露），按行放行
const ALLOW_LINE = [/TOP-SECRET-BYTES/, /secret-from-backend/, /never expose/];

const PATTERNS = [
  [/sk-[A-Za-z0-9_-]{16,}/g, '疑似 OpenAI/DeepSeek 风格密钥'],
  [/gh[pousr]_[A-Za-z0-9]{20,}/g, '疑似 GitHub token'],
  [/github_pat_[A-Za-z0-9_]{20,}/g, '疑似 GitHub fine-grained token'],
  [/AKIA[0-9A-Z]{16}/g, '疑似 AWS Access Key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '私钥'],
  [/Bearer\s+[A-Za-z0-9._-]{24,}/g, '疑似 Bearer token'],
  [/(?:api[_-]?key|secret|access[_-]?token|client[_-]?secret)\s*[:=]\s*['"][^'"]{12,}['"]/gi, '疑似明文密钥赋值'],
  [/\/Users\/[A-Za-z0-9._-]+\//g, '本机绝对路径'],
  [/[A-Za-z0-9._%+-]+@(?:didichuxing|xiaojukeji)\.com/gi, '公司邮箱'],
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIR.has(entry)) continue;
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) walk(path, out);
    else if (TEXT_EXT.has(extname(entry).toLowerCase())) out.push(path);
  }
  return out;
}

const problems = [];
const files = walk(ROOT);
for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel === 'scripts/check-secrets.mjs') continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (ALLOW_LINE.some((re) => re.test(line))) return;
    for (const [re, label] of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) problems.push({ rel, line: i + 1, label, text: line.trim().slice(0, 160) });
    }
  });
}

// 本地数据文件不得被 git 跟踪
try {
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  for (const name of FORBIDDEN_FILES) {
    if (tracked.some((f) => f === name || f.startsWith(name + '/'))) {
      problems.push({ rel: name, line: 0, label: '本地数据文件被 git 跟踪', text: name });
    }
  }
} catch {
  // 尚未 git init 时跳过这部分
}

if (problems.length === 0) {
  console.log(`[check-secrets] OK：扫描 ${files.length} 个文本文件，未发现密钥/个人路径。`);
  process.exit(0);
}
console.error(`[check-secrets] 发现 ${problems.length} 处问题：`);
for (const p of problems) console.error(`  ${p.rel}:${p.line}  ${p.label}\n    ${p.text}`);
process.exit(1);
