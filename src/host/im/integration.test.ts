/**
 * IM 出站联调：用本地假 OneBot / 桥服务收请求，验证真实的 HTTP 形状、鉴权、白名单与群聊 @ 规则。
 * 不依赖任何真实 QQ / 微信账号。
 */
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ImService, imConfigOf } from './index.ts';

interface Captured {
  url: string;
  method: string;
  auth?: string;
  body: Record<string, unknown>;
}

async function fakeServer(): Promise<{ url: string; captured: Captured[]; close: () => Promise<void> }> {
  const captured: Captured[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.from(c)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      captured.push({
        url: req.url ?? '',
        method: req.method ?? '',
        auth: req.headers.authorization,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', retcode: 0 }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function service(url: string, overrides: Record<string, unknown> = {}): { im: ImService; replies: string[]; dir: string } {
  const replies: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-im-'));
  const conf = {
    im: {
      remember: false,
      weixin: {
        enabled: false,
        mode: 'off',
        ilink: { allowFrom: [], maxRepliesPerDay: 100, rateLimitPerMinute: 6 },
        bridge: { outboundUrl: '', allowFrom: [], allowGroups: [] },
      },
      qq: {
        enabled: true,
        baseUrl: url,
        selfId: '999',
        accessToken: 'test-token',
        allowFrom: ['42'],
        allowGroups: ['7'],
        autoReply: true,
        maxRepliesPerDay: 100,
        rateLimitPerMinute: 10,
        ...overrides,
      },
    },
  };
  const im = new ImService({
    userRoot: dir,
    getConfig: () => imConfigOf(conf),
    reply: async (text) => {
      replies.push(text);
      return '收到：' + text;
    },
  });
  return { im, replies, dir };
}

test('QQ 私聊：带 Bearer token 发到 /send_private_msg，user_id 为数字', async () => {
  const server = await fakeServer();
  const { im, replies, dir } = service(server.url);
  try {
    await im.handleInbound({ channel: 'qq', from: '42', text: '在吗', messageId: 'm1' });
    assert.deepEqual(replies, ['在吗']);
    assert.equal(server.captured.length, 1);
    assert.equal(server.captured[0].url, '/send_private_msg');
    assert.equal(server.captured[0].auth, 'Bearer test-token');
    assert.deepEqual(server.captured[0].body, { user_id: 42, message: '收到：在吗' });
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('QQ 群聊：未 @ 不回，@ 了才发到 /send_group_msg', async () => {
  const server = await fakeServer();
  const { im, replies, dir } = service(server.url);
  try {
    await im.handleInbound({
      channel: 'qq',
      from: '42',
      roomId: '7',
      text: '今天吃什么',
      messageId: 'g1',
      mentioned: false,
    });
    assert.deepEqual(replies, []);
    assert.equal(server.captured.length, 0);
    await im.handleInbound({
      channel: 'qq',
      from: '42',
      roomId: '7',
      text: '@999 今天吃什么',
      messageId: 'g2',
      mentioned: true,
    });
    assert.equal(server.captured.length, 1);
    assert.equal(server.captured[0].url, '/send_group_msg');
    assert.equal(server.captured[0].body.group_id, 7);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('白名单：不在 allowFrom 的私聊直接丢弃，不触发模型', async () => {
  const server = await fakeServer();
  const { im, replies, dir } = service(server.url);
  try {
    await im.handleInbound({ channel: 'qq', from: '99', text: '你好', messageId: 'x1' });
    assert.deepEqual(replies, []);
    assert.equal(server.captured.length, 0);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('autoReply=false：不生成、不发送（静默观察）', async () => {
  const server = await fakeServer();
  const { im, replies, dir } = service(server.url, { autoReply: false });
  try {
    await im.handleInbound({ channel: 'qq', from: '42', text: '在吗', messageId: 'q1' });
    assert.deepEqual(replies, []);
    assert.equal(server.captured.length, 0);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('去重：10 分钟内相同 messageId 只回一次', async () => {
  const server = await fakeServer();
  const { im, dir } = service(server.url);
  try {
    await im.handleInbound({ channel: 'qq', from: '42', text: '在吗', messageId: 'dup' });
    await im.handleInbound({ channel: 'qq', from: '42', text: '在吗', messageId: 'dup' });
    assert.equal(server.captured.length, 1);
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('通用桥出站：POST outboundUrl，带 to/text/roomId', async () => {
  const server = await fakeServer();
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-bridge-'));
  const conf = {
    im: {
      remember: false,
      weixin: {
        enabled: true,
        mode: 'bridge',
        ilink: { allowFrom: [], maxRepliesPerDay: 100, rateLimitPerMinute: 6 },
        bridge: {
          outboundUrl: server.url + '/send',
          allowFrom: ['wxid_1'],
          allowGroups: ['room_1'],
        },
      },
      qq: {
        enabled: false,
        baseUrl: '',
        selfId: '',
        accessToken: '',
        allowFrom: [],
        allowGroups: [],
        autoReply: true,
        maxRepliesPerDay: 100,
        rateLimitPerMinute: 6,
      },
    },
  };
  const im = new ImService({ userRoot: dir, getConfig: () => imConfigOf(conf), reply: async () => '好呀' });
  try {
    await im.handleInbound({ channel: 'bridge', from: 'wxid_1', text: '在吗', messageId: 'b1' });
    assert.equal(server.captured.length, 1);
    assert.equal(server.captured[0].url, '/send');
    assert.deepEqual(server.captured[0].body, { to: 'wxid_1', text: '好呀' });
  } finally {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
