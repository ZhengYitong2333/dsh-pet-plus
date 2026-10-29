/** 抖音 / 小红书链接识别与归一化（只做解析，不抓取）。 */

export type Platform = 'douyin' | 'xhs';

export interface ParsedLink {
  platform: Platform;
  url: string;
  kind: 'video' | 'note' | 'short' | 'unknown';
}

const URL_RE = /https?:\/\/[^\s<>"'）)】]+/i;
const SHORT_HOSTS = new Set(['v.douyin.com', 'xhslink.com']);

export function extractUrl(text: string): string | undefined {
  const match = URL_RE.exec(String(text ?? ''));
  if (!match) return undefined;
  return match[0].replace(/[.,;!?]+$/u, '');
}

export function parseLink(input: string): ParsedLink | undefined {
  const url = extractUrl(input) ?? (input.startsWith('http') ? input : undefined);
  if (!url) return undefined;
  let host = '';
  let path = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.toLowerCase();
    path = parsed.pathname;
  } catch {
    return undefined;
  }
  const douyin = host.endsWith('douyin.com');
  const xhs = host.endsWith('xiaohongshu.com');
  if (!douyin && !xhs) return undefined;
  const platform: Platform = douyin ? 'douyin' : 'xhs';
  const kind = SHORT_HOSTS.has(host)
    ? 'short'
    : /\/video\/|\/note\//.test(path)
      ? 'video'
      : /\/explore\/|\/discovery\/item\//.test(path)
        ? 'note'
        : 'unknown';
  return { platform, url, kind };
}

/** 生成缓存 key（链接或文本）。 */
export function contentKey(input: { link?: string; text?: string }): string {
  const raw = (input.link ?? '').trim() || (input.text ?? '').trim().slice(0, 200);
  return raw;
}
