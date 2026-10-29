/** 快捷启动：只允许配置里的 app/url，不拼接 shell。 */
import { spawn } from 'node:child_process';

export interface QuickItem {
  id: string;
  label: string;
  type: 'app' | 'url';
  target: string;
}

export function quickItemsOf(conf: Record<string, unknown>): QuickItem[] {
  const p2 = (conf.p2 ?? {}) as Record<string, unknown>;
  const q = (p2.quickLaunch ?? {}) as Record<string, unknown>;
  const items = Array.isArray(q.items) ? q.items : [];
  return items
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      const id = String(item.id ?? '');
      const label = String(item.label ?? id);
      const type = item.type === 'url' ? 'url' : 'app';
      const target = String(item.target ?? '');
      return id && target ? { id, label, type, target } : undefined;
    })
    .filter((x): x is QuickItem => x !== undefined)
    .slice(0, 20);
}

export function openQuick(item: QuickItem): { ok: boolean; message?: string } {
  if (item.type === 'url' && !/^https?:\/\//i.test(item.target)) {
    return { ok: false, message: '只允许 http(s) 链接' };
  }
  if (process.platform !== 'darwin') return { ok: false, message: '快捷启动目前仅支持 macOS' };
  const child = spawn('open', [item.target], { stdio: 'ignore', detached: true });
  child.unref();
  return { ok: true };
}
