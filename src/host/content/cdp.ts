/**
 * 零依赖 Chrome DevTools Protocol 客户端（仅用于内容自动化）。
 *
 * 启动独立 Chrome profile（不碰日常浏览器），通过 /json/list 找到页面 target，
 * 用 Node 内置 WebSocket 发 CDP 命令。任何一步失败都显式抛错，由自动化层停手。
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class CdpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CdpError';
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
}

export class ChromeCdp {
  private readonly ws: WebSocket;
  private readonly child: ChildProcess | undefined;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;

  private constructor(ws: WebSocket, child?: ChildProcess) {
    this.ws = ws;
    this.child = child;
    ws.addEventListener('message', (event) => {
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(String((event as MessageEvent).data)) as typeof msg;
      } catch {
        return;
      }
      if (typeof msg.id !== 'number') return;
      const waiter = this.pending.get(msg.id);
      if (!waiter) return;
      this.pending.delete(msg.id);
      if (msg.error) waiter.reject(new CdpError(msg.error.message ?? 'CDP error'));
      else waiter.resolve(msg.result);
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const [, waiter] of this.pending) waiter.reject(new CdpError('CDP closed'));
      this.pending.clear();
    });
  }

  private static async waitJson(url: string, timeoutMs = 12_000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
        if (res.ok) return (await res.json()) as Record<string, unknown>;
      } catch {
        /* retry */
      }
      if (Date.now() > deadline) throw new CdpError('Chrome 调试端口未就绪');
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  static async launch(options: {
    chromePath: string;
    profileDir: string;
    port: number;
  }): Promise<ChromeCdp> {
    if (!options.chromePath || !existsSync(options.chromePath)) {
      throw new CdpError('找不到 Chrome：请设置 content.auto.chromePath');
    }
    mkdirSync(options.profileDir, { recursive: true });
    const child = spawn(
      options.chromePath,
      [
        `--remote-debugging-port=${options.port}`,
        `--user-data-dir=${options.profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        'about:blank',
      ],
      { detached: false, stdio: 'ignore' },
    );
    const version = await ChromeCdp.waitJson(`http://127.0.0.1:${options.port}/json/version`);
    const wsUrl = typeof version.webSocketDebuggerUrl === 'string' ? version.webSocketDebuggerUrl : '';
    if (!wsUrl) throw new CdpError('Chrome 未返回调试地址');
    const list = await ChromeCdp.waitJson(`http://127.0.0.1:${options.port}/json/list`);
    const pages = Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
    const pageUrl = pages.find((p) => p.type === 'page' && typeof p.webSocketDebuggerUrl === 'string');
    const pageWs = typeof pageUrl?.webSocketDebuggerUrl === 'string' ? pageUrl.webSocketDebuggerUrl : wsUrl;
    const ws = new WebSocket(pageWs);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new CdpError('CDP WebSocket 连接失败')), { once: true });
    });
    const cdp = new ChromeCdp(ws, child);
    await cdp.send('Page.enable').catch(() => {});
    await cdp.send('Runtime.enable').catch(() => {});
    return cdp;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) return Promise.reject(new CdpError('CDP 已关闭'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new CdpError('CDP 超时：' + method));
      }, 20_000);
    });
  }

  async navigate(url: string): Promise<void> {
    await this.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 2500));
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: T } };
    return result.result?.value as T;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
    this.child?.kill();
    this.closed = true;
  }
}
