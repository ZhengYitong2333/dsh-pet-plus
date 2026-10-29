/** 内容副驾服务：缓存 + 生成；自动化状态先占位，CDP 引擎在 automation.ts 接入。 */
import { createHash } from 'node:crypto';
import type { DigestContext, DigestResult } from './generate.ts';
import { generateDigest } from './generate.ts';
import { contentConfigOf, type ContentConfig } from './config.ts';
import { contentKey, parseLink } from './link.ts';
import { ContentAutomation } from './automation.ts';

interface CacheEntry {
  at: number;
  result: DigestResult;
}

export class ContentService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ctx: DigestContext;
  private readonly getConf: () => ContentConfig;
  readonly automation: ContentAutomation;

  constructor(options: { ctx: DigestContext; getConf: () => ContentConfig; userRoot: string }) {
    this.ctx = options.ctx;
    this.getConf = options.getConf;
    this.automation = new ContentAutomation({
      userRoot: options.userRoot,
      getConf: options.getConf,
      commentFor: (text) => this.commentFor(text),
    });
  }

  private async commentFor(text: string): Promise<string | undefined> {
    const result = await this.digest({ text });
    return result.ok ? result.result.comments[0]?.text : undefined;
  }

  async digest(input: { link?: string; text?: string }): Promise<
    | { ok: true; result: DigestResult; cached: boolean }
    | { ok: false; reason: 'disabled' | 'empty' | 'bad-link'; message?: string }
  > {
    const conf = this.getConf();
    if (!conf.enabled) return { ok: false, reason: 'disabled' };
    const link = input.link ? parseLink(input.link) : undefined;
    if (input.link && !link) return { ok: false, reason: 'bad-link', message: '只支持抖音/小红书链接' };
    const text = String(input.text ?? '').trim();
    if (!link && !text) return { ok: false, reason: 'empty' };
    const key = createHash('sha256')
      .update(contentKey({ link: link?.url, text }) + ':' + conf.cacheMinutes)
      .digest('hex')
      .slice(0, 24);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < conf.cacheMinutes * 60_000) {
      return { ok: true, result: hit.result, cached: true };
    }
    const result = await generateDigest(this.ctx, { text, link });
    this.cache.set(key, { at: Date.now(), result });
    if (this.cache.size > 100) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.cache.delete(oldest[0]);
    }
    return { ok: true, result, cached: false };
  }

  status(): { config: ContentConfig } {
    return { config: this.getConf() };
  }
}

export function contentConfOf(conf: Record<string, unknown>): ContentConfig {
  return contentConfigOf(conf);
}
