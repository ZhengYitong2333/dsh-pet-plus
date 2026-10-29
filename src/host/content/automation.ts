/**
 * 内容自动化的状态机与安全阀。
 *
 * 默认 dryRun；只有 enabled + acknowledged + 非静默时段才启动。
 * 每轮：打开平台 → 滚动 → 检测验证码 → 取一条可见内容 → 生成评论 →（非 dryRun 时）尝试发送。
 * 遇验证码/滑块/频繁/账号异常立即停；不碰私信、不点关注、不批量点赞。
 */
import { appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ChromeCdp } from './cdp.ts';
import { PLATFORMS, type PlatformAdapter } from './platforms.ts';
import { inQuietHours, type ContentAutoConfig, type ContentConfig } from './config.ts';

export interface AutoLogEntry {
  ts: number;
  platform?: string;
  action: 'start' | 'stop' | 'scroll' | 'comment-dry' | 'comment-sent' | 'comment-failed' | 'captcha' | 'error';
  detail: string;
}

export interface AutoStatus {
  running: boolean;
  dryRun: boolean;
  platform?: string;
  sentToday: number;
  lastError?: string;
  logs: AutoLogEntry[];
}

export class ContentAutomation {
  private readonly getConf: () => ContentConfig;
  private readonly userRoot: string;
  private readonly commentFor: (text: string) => Promise<string | undefined>;
  private readonly logs: AutoLogEntry[] = [];
  private running = false;
  private cdp: ChromeCdp | undefined;
  private sentToday = 0;
  private day = new Date().toISOString().slice(0, 10);
  private lastError: string | undefined;
  private stopRequested = false;
  private readonly sentAt: number[] = [];

  constructor(options: {
    userRoot: string;
    getConf: () => ContentConfig;
    commentFor: (text: string) => Promise<string | undefined>;
  }) {
    this.userRoot = options.userRoot;
    this.getConf = options.getConf;
    this.commentFor = options.commentFor;
  }

  private log(entry: Omit<AutoLogEntry, 'ts'>): void {
    const item = { ts: Date.now(), ...entry };
    this.logs.push(item);
    if (this.logs.length > 200) this.logs.shift();
    try {
      appendFileSync(join(this.userRoot, 'content-log.jsonl'), JSON.stringify(item) + '\n', 'utf8');
    } catch {
      /* ignore */
    }
  }

  status(): AutoStatus {
    return {
      running: this.running,
      dryRun: this.getConf().auto.dryRun,
      platform: this.logs.filter((l) => l.platform).at(-1)?.platform,
      sentToday: this.sentToday,
      lastError: this.lastError,
      logs: [...this.logs].slice(-50),
    };
  }

  private resetDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.day !== today) {
      this.day = today;
      this.sentToday = 0;
    }
  }

  private canSend(conf: ContentAutoConfig): boolean {
    this.resetDay();
    if (this.sentToday >= conf.limits.perDay) return false;
    const now = Date.now();
    const recent = this.sentAt.filter((t) => now - t < 10 * 60_000);
    return recent.length < conf.limits.per10min;
  }

  async start(): Promise<{ ok: true } | { ok: false; reason: string }> {
    const conf = this.getConf();
    if (!conf.enabled) return { ok: false, reason: '内容副驾已关闭' };
    if (!conf.auto.enabled) return { ok: false, reason: '自动化未启用' };
    if (!conf.auto.acknowledged) return { ok: false, reason: '请先勾选风险确认' };
    if (inQuietHours(conf.auto.quietHours)) return { ok: false, reason: '当前处于静默时段' };
    if (this.running) return { ok: true };
    this.running = true;
    this.stopRequested = false;
    this.log({ action: 'start', detail: conf.auto.dryRun ? 'dry-run' : 'live' });
    try {
      this.cdp = await ChromeCdp.launch({
        chromePath: conf.auto.chromePath || defaultChromePath(),
        profileDir: conf.auto.profileDir || join(this.userRoot, 'chrome-profile'),
        port: 9222 + Math.floor(Math.random() * 500),
      });
    } catch (error) {
      this.running = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.log({ action: 'error', detail: this.lastError });
      return { ok: false, reason: this.lastError };
    }
    void this.loop(conf);
    return { ok: true };
  }

  stop(): void {
    this.stopRequested = true;
    this.running = false;
    this.cdp?.close();
    this.cdp = undefined;
    this.log({ action: 'stop', detail: 'manual' });
  }

  private async loop(conf: ContentConfig): Promise<void> {
    const cdp = this.cdp;
    if (!cdp) return;
    const adapters = (Object.keys(PLATFORMS) as Array<keyof typeof PLATFORMS>)
      .filter((id) => conf.auto.platforms[id])
      .map((id) => PLATFORMS[id]);
    while (this.running && !this.stopRequested && this.cdp) {
      for (const adapter of adapters) {
        if (!this.running) break;
        try {
          await this.runPlatform(cdp, adapter, conf);
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : String(error);
          this.log({ action: 'error', platform: adapter.id, detail: this.lastError });
          this.stop();
          return;
        }
      }
      const gap = conf.auto.limits.minGapSec + Math.random() * Math.max(0, conf.auto.limits.maxGapSec - conf.auto.limits.minGapSec);
      await new Promise((r) => setTimeout(r, Math.min(30, gap) * 1000));
    }
  }

  private async runPlatform(cdp: ChromeCdp, adapter: PlatformAdapter, conf: ContentConfig): Promise<void> {
    await cdp.navigate(adapter.home);
    for (let i = 0; i < conf.auto.maxScrolls && this.running; i++) {
      const body = await cdp.evaluate<string>('document.body.innerText.slice(0, 2000)');
      if (/验证码|滑块|安全验证|操作频繁|账号异常|请完成验证/.test(body)) {
        this.log({ action: 'captcha', platform: adapter.id, detail: '检测到验证/风控页面，已停止' });
        this.stop();
        return;
      }
      const text = await cdp.evaluate<string>(
        `(() => { const card = document.querySelector(${JSON.stringify(adapter.feedCards)}); return card ? card.innerText.slice(0,300) : ''; })()`,
      );
      if (text.trim()) {
        const comment = this.running ? await this.commentFor(text) : undefined;
        if (comment) {
          if (conf.auto.dryRun || !this.canSend(conf.auto)) {
            this.log({ action: 'comment-dry', platform: adapter.id, detail: comment.slice(0, 120) });
          } else {
            const result = await this.attemptComment(cdp, adapter, comment);
            this.log({
              action: result ? 'comment-sent' : 'comment-failed',
              platform: adapter.id,
              detail: result ? comment.slice(0, 120) : '选择器未命中/发送失败',
            });
            if (result) {
              this.sentToday += 1;
              this.sentAt.push(Date.now());
            }
          }
        }
      }
      await cdp.evaluate('window.scrollBy(0, window.innerHeight * 0.9)');
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
    }
  }

  private async attemptComment(cdp: ChromeCdp, adapter: PlatformAdapter, comment: string): Promise<boolean> {
    const script = `(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const card = document.querySelector(${JSON.stringify(adapter.feedCards)});
      if (!card) return false;
      card.click(); await sleep(1200);
      const btn = document.querySelector(${JSON.stringify(adapter.commentButton)});
      if (!btn) return false;
      btn.click(); await sleep(1200);
      const input = document.querySelector(${JSON.stringify(adapter.commentInput)});
      if (!input) return false;
      input.focus();
      if (input.tagName === 'TEXTAREA') {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(comment)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.execCommand('insertText', false, ${JSON.stringify(comment)});
      }
      await sleep(500);
      const submit = document.querySelector(${JSON.stringify(adapter.submitButton)});
      if (!submit) return false;
      submit.click(); await sleep(800);
      return true;
    })()`;
    try {
      return (await cdp.evaluate<boolean>(script)) === true;
    } catch {
      return false;
    }
  }
}

export function defaultChromePath(): string {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  return candidates.find((p) => existsSync(p)) ?? '';
}
