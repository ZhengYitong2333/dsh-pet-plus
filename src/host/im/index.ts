/**
 * IM 通道：微信官方 ClawBot（iLink 直连）+ 通用桥 + QQ OneBot v11。
 *
 * 约束：
 *  - iLink 仅单聊、一个微信号一只 Bot；token 存 credentials，账号元数据存 im/ilink-account.json；
 *  - 所有入站先过白名单、去重、限流，再交给桌宠对话管线；回复走原通道；
 *  - 缺配置/缺 token 一律返回结构化错误，不静默。
 */
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../memory/store.ts';

const ILINK_BASE = 'https://ilinkai.weixin.qq.com';
const ILINK_APP_ID = 'bot';
const ILINK_CLIENT_VERSION = '65538';
const LONGPoll_MS = 35_000;

export interface ImMessage {
  channel: 'ilink' | 'bridge' | 'qq';
  from: string;
  fromName?: string;
  roomId?: string;
  text: string;
  contextToken?: string;
  messageId?: string;
  mentioned?: boolean;
}

export interface ImReply {
  text: string;
}

export interface ImConfig {
  weixin: {
    mode: 'off' | 'ilink' | 'bridge';
    enabled: boolean;
    ilink: { allowFrom: string[]; maxRepliesPerDay: number; rateLimitPerMinute: number };
    bridge: { outboundUrl: string; allowFrom: string[]; allowGroups: string[]; inboundSecret: string };
  };
  qq: {
    enabled: boolean;
    baseUrl: string;
    selfId: string;
    accessToken: string;
    eventSecret: string;
    allowFrom: string[];
    allowGroups: string[];
    autoReply: boolean;
    maxRepliesPerDay: number;
    rateLimitPerMinute: number;
  };
  remember: boolean;
}

export function imConfigOf(conf: Record<string, unknown>): ImConfig {
  const im = (conf.im ?? {}) as Record<string, unknown>;
  const wx = (im.weixin ?? {}) as Record<string, unknown>;
  const ilink = (wx.ilink ?? {}) as Record<string, unknown>;
  const bridge = (wx.bridge ?? {}) as Record<string, unknown>;
  const qq = (im.qq ?? {}) as Record<string, unknown>;
  const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const mode = str(wx.mode, 'off');
  return {
    weixin: {
      mode: mode === 'ilink' || mode === 'bridge' ? mode : 'off',
      enabled: wx.enabled === true,
      ilink: {
        allowFrom: list(ilink.allowFrom),
        maxRepliesPerDay: num(ilink.maxRepliesPerDay, 100),
        rateLimitPerMinute: num(ilink.rateLimitPerMinute, 6),
      },
      bridge: {
        outboundUrl: str(bridge.outboundUrl),
        allowFrom: list(bridge.allowFrom),
        allowGroups: list(bridge.allowGroups),
        inboundSecret: str(bridge.inboundSecret),
      },
    },
    qq: {
      enabled: qq.enabled === true,
      baseUrl: str(qq.baseUrl),
      selfId: str(qq.selfId),
      accessToken: str(qq.accessToken),
      eventSecret: str(qq.eventSecret),
      allowFrom: list(qq.allowFrom),
      allowGroups: list(qq.allowGroups),
      autoReply: qq.autoReply !== false,
      maxRepliesPerDay: num(qq.maxRepliesPerDay, 100),
      rateLimitPerMinute: num(qq.rateLimitPerMinute, 6),
    },
    remember: im.remember === true,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uin(): string {
  return Buffer.from(String(randomBytes(4).readUInt32BE(0))).toString('base64');
}

function textOfItems(items: unknown): string {
  if (!Array.isArray(items)) return '';
  return items
    .map((item) => {
      const i = item as { type?: unknown; text_item?: { text?: unknown } };
      return i.type === 1 && typeof i.text_item?.text === 'string' ? i.text_item.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

export interface IlinkQr {
  qrcode: string;
  url: string;
}

export class IlinkClient {
  private token = '';
  private baseUrl = ILINK_BASE;
  private cursor = '';
  private abort: AbortController | undefined;
  private running = false;
  private readonly syncFile: string;
  private readonly onMessage: (msg: ImMessage) => void;
  private readonly log: (message: string) => void;

  constructor(options: {
    userRoot: string;
    onMessage: (msg: ImMessage) => void;
    log?: (message: string) => void;
  }) {
    this.syncFile = join(options.userRoot, 'im', 'ilink-sync.json');
    this.onMessage = options.onMessage;
    this.log = options.log ?? ((m) => console.log('[dsh-pet-plus][im] ' + m));
    const sync = readJsonFile<{ cursor: string }>(this.syncFile, { cursor: '' });
    this.cursor = sync.ok && sync.value?.cursor ? sync.value.cursor : '';
  }

  private headers(withToken: boolean): Record<string, string> {
    const h: Record<string, string> = {
      'content-type': 'application/json',
      'iLink-App-Id': ILINK_APP_ID,
      'iLink-App-ClientVersion': ILINK_CLIENT_VERSION,
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': uin(),
    };
    if (withToken) h.Authorization = 'Bearer ' + this.token;
    return h;
  }

  private async get(path: string, timeoutMs = 40_000): Promise<Record<string, unknown>> {
    const res = await fetch(this.baseUrl + path, {
      headers: this.headers(false),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  private async post(path: string, body: unknown, timeoutMs = 40_000): Promise<Record<string, unknown>> {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return (await res.json()) as Record<string, unknown>;
  }

  async qr(): Promise<{ ok: true; qr: IlinkQr } | { ok: false; message: string }> {
    try {
      const resp = await this.get('/ilink/bot/get_bot_qrcode?bot_type=3', 20_000);
      const qrcode = typeof resp.qrcode === 'string' ? resp.qrcode : '';
      const url = typeof resp.qrcode_img_content === 'string' ? resp.qrcode_img_content : '';
      if (!qrcode) return { ok: false, message: '未拿到二维码' };
      return { ok: true, qr: { qrcode, url } };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async qrStatus(qrcode: string): Promise<Record<string, unknown>> {
    return this.get('/ilink/bot/get_qrcode_status?qrcode=' + encodeURIComponent(qrcode), 40_000);
  }

  /** 设置 token/baseUrl 并启动长轮询（幂等）。 */
  start(token: string, baseUrl = ILINK_BASE): void {
    this.token = token;
    this.baseUrl = baseUrl || ILINK_BASE;
    if (this.running) return;
    this.running = true;
    this.abort = new AbortController();
    void this.loop(this.abort.signal);
  }

  stop(): void {
    this.running = false;
    this.abort?.abort();
    this.abort = undefined;
  }

  status(): { running: boolean; baseUrl: string; hasToken: boolean } {
    return { running: this.running, baseUrl: this.baseUrl, hasToken: this.token !== '' };
  }

  private async loop(signal: AbortSignal): Promise<void> {
    this.log('iLink monitor started');
    while (this.running && !signal.aborted) {
      try {
        const resp = await this.post(
          '/ilink/bot/getupdates',
          { get_updates_buf: this.cursor, base_info: { channel_version: '1.0.2' } },
          LONGPoll_MS + 5_000,
        );
        const ret = Number(resp.ret ?? 0);
        if (ret === -14) {
          this.log('iLink token 失效（-14），暂停 30 分钟');
          await sleep(30 * 60_000);
          continue;
        }
        if (ret !== 0) {
          this.log('iLink getupdates ret=' + ret + ' ' + String(resp.errmsg ?? ''));
          await sleep(5_000);
          continue;
        }
        const next = typeof resp.get_updates_buf === 'string' ? resp.get_updates_buf : '';
        if (next) {
          this.cursor = next;
          try {
            writeJsonAtomic(this.syncFile, { cursor: this.cursor });
          } catch {
            /* 游标写失败不影响本轮 */
          }
        }
        const msgs = Array.isArray(resp.msgs) ? resp.msgs : [];
        for (const raw of msgs) {
          const msg = raw as {
            from_user_id?: string;
            context_token?: string;
            message_type?: number;
            item_list?: unknown;
          };
          if (msg.message_type !== 1) continue;
          const text = textOfItems(msg.item_list).trim();
          if (!text || !msg.from_user_id) continue;
          this.onMessage({
            channel: 'ilink',
            from: msg.from_user_id,
            text,
            contextToken: msg.context_token,
          });
        }
      } catch (error) {
        if (signal.aborted) break;
        this.log('iLink 长轮询异常：' + (error instanceof Error ? error.message : String(error)));
        await sleep(5_000);
      }
    }
    this.log('iLink monitor stopped');
  }

  async send(to: string, text: string, contextToken?: string): Promise<boolean> {
    try {
      const resp = await this.post('/ilink/bot/sendmessage', {
        msg: {
          to_user_id: to,
          message_type: 2,
          message_state: 2,
          ...(contextToken ? { context_token: contextToken } : {}),
          item_list: [{ type: 1, text_item: { text } }],
        },
        base_info: { channel_version: '1.0.2' },
      });
      return Number(resp.ret ?? 0) === 0;
    } catch (error) {
      this.log('iLink 发送失败：' + (error instanceof Error ? error.message : String(error)));
      return false;
    }
  }
}

export interface OutboundTarget {
  channel: 'ilink' | 'bridge' | 'qq';
  to: string;
  roomId?: string;
}

export class ImService {
  readonly ilink: IlinkClient;
  private readonly cfg: () => ImConfig;
  private readonly reply: (text: string, msg: ImMessage) => Promise<string | undefined>;
  private readonly seen = new Map<string, number>();
  private readonly rate = new Map<string, { window: number; count: number }>();
  private readonly daily = new Map<string, { day: string; count: number }>();
  private readonly userRoot: string;

  constructor(options: {
    userRoot: string;
    getConfig: () => ImConfig;
    reply: (text: string, msg: ImMessage) => Promise<string | undefined>;
  }) {
    this.userRoot = options.userRoot;
    this.cfg = options.getConfig;
    this.reply = options.reply;
    this.ilink = new IlinkClient({
      userRoot: options.userRoot,
      onMessage: (msg) => void this.handleInbound(msg),
    });
  }

  private allowed(channel: ImMessage['channel'], msg: ImMessage): boolean {
    const c = this.cfg();
    if (channel === 'ilink') {
      const list = c.weixin.ilink.allowFrom;
      return list.length === 0 || list.includes(msg.from);
    }
    if (channel === 'bridge') {
      if (msg.roomId) return c.weixin.bridge.allowGroups.includes(msg.roomId);
      return c.weixin.bridge.allowFrom.includes(msg.from);
    }
    if (msg.roomId) return c.qq.allowGroups.includes(msg.roomId);
    return c.qq.allowFrom.includes(msg.from);
  }

  private limit(channel: ImMessage['channel'], from: string): boolean {
    const c = this.cfg();
    const perMinute =
      channel === 'ilink' ? c.weixin.ilink.rateLimitPerMinute : channel === 'qq' ? c.qq.rateLimitPerMinute : 6;
    const perDay =
      channel === 'ilink' ? c.weixin.ilink.maxRepliesPerDay : channel === 'qq' ? c.qq.maxRepliesPerDay : 100;
    const now = Date.now();
    const window = Math.floor(now / 60_000);
    const r = this.rate.get(from);
    if (!r || r.window !== window) this.rate.set(from, { window, count: 1 });
    else if (r.count >= perMinute) return false;
    else r.count += 1;
    const day = new Date().toISOString().slice(0, 10);
    const d = this.daily.get(from);
    if (!d || d.day !== day) this.daily.set(from, { day, count: 1 });
    else if (d.count >= perDay) return false;
    else d.count += 1;
    return true;
  }

  private duplicate(key: string): boolean {
    const now = Date.now();
    const old = this.seen.get(key);
    if (old !== undefined && now - old < 10 * 60_000) return true;
    this.seen.set(key, now);
    if (this.seen.size > 500) {
      for (const [k, t] of this.seen) if (now - t > 10 * 60_000) this.seen.delete(k);
    }
    return false;
  }

  async handleInbound(msg: ImMessage): Promise<void> {
    const c = this.cfg();
    if (msg.channel === 'qq' && !c.qq.enabled) return;
    if (msg.channel === 'bridge' && !(c.weixin.enabled && c.weixin.mode === 'bridge')) return;
    if (msg.channel === 'ilink' && !(c.weixin.enabled && c.weixin.mode === 'ilink')) return;
    if (!this.allowed(msg.channel, msg)) return;
    if (msg.roomId && msg.mentioned !== true) return;
    const key = msg.channel + ':' + (msg.messageId ?? msg.from + ':' + msg.text.slice(0, 40));
    if (this.duplicate(key)) return;
    if (!this.limit(msg.channel, msg.from)) return;
    const replyText = await this.reply(msg.text, msg);
    if (!replyText) return;
    await this.send({ channel: msg.channel, to: msg.from, roomId: msg.roomId }, replyText, msg);
  }

  async send(target: OutboundTarget, text: string, msg?: ImMessage): Promise<boolean> {
    const c = this.cfg();
    if (target.channel === 'ilink') {
      return this.ilink.send(target.to, text, msg?.contextToken);
    }
    if (target.channel === 'qq') {
      if (!c.qq.baseUrl) return false;
      const endpoint = target.roomId ? '/send_group_msg' : '/send_private_msg';
      const body = target.roomId
        ? { group_id: Number(target.roomId), message: text }
        : { user_id: Number(target.to), message: text };
      try {
        const res = await fetch(c.qq.baseUrl.replace(/\/$/, '') + endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(c.qq.accessToken ? { authorization: 'Bearer ' + c.qq.accessToken } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
        const json = (await res.json().catch(() => ({}))) as { status?: string; retcode?: number };
        return json.status === 'ok' || json.retcode === 0;
      } catch {
        return false;
      }
    }
    // bridge
    if (!c.weixin.bridge.outboundUrl) return false;
    try {
      const res = await fetch(c.weixin.bridge.outboundUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to: target.to, text, roomId: target.roomId }),
        signal: AbortSignal.timeout(15_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  status(): Record<string, unknown> {
    return { ilink: this.ilink.status(), weixinMode: this.cfg().weixin.mode, qqEnabled: this.cfg().qq.enabled };
  }
}
