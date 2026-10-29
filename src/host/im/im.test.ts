import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ImService, imConfigOf } from './index.ts';

test('imConfigOf 默认关闭，缺省值安全', () => {
  const c = imConfigOf({});
  assert.equal(c.weixin.mode, 'off');
  assert.equal(c.weixin.enabled, false);
  assert.equal(c.qq.enabled, false);
  assert.deepEqual(c.weixin.ilink.allowFrom, []);
});

test('imConfigOf 解析配置', () => {
  const c = imConfigOf({
    im: {
      weixin: { enabled: true, mode: 'bridge', bridge: { allowFrom: ['u1'], inboundSecret: 's' } },
      qq: { enabled: true, baseUrl: 'http://127.0.0.1:3000', selfId: '100', allowGroups: ['g1'] },
    },
  });
  assert.equal(c.weixin.mode, 'bridge');
  assert.deepEqual(c.weixin.bridge.allowFrom, ['u1']);
  assert.equal(c.qq.selfId, '100');
});

test('桥入站：白名单、去重、群聊需 @', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-pet-plus-im-'));
  try {
    let replies = 0;
    const service = new ImService({
      userRoot: dir,
      getConfig: () =>
        imConfigOf({
          im: {
            weixin: {
              enabled: true,
              mode: 'bridge',
              bridge: { outboundUrl: '', allowFrom: ['u1'], allowGroups: ['g1'], inboundSecret: 's' },
            },
          },
        }),
      reply: async () => {
        replies += 1;
        return '收到';
      },
    });
    await service.handleInbound({ channel: 'bridge', from: 'u1', text: '你好', messageId: 'e1' });
    await service.handleInbound({ channel: 'bridge', from: 'u1', text: '你好', messageId: 'e1' });
    await service.handleInbound({ channel: 'bridge', from: 'u2', text: '你好', messageId: 'e2' });
    await service.handleInbound({ channel: 'bridge', from: 'u1', text: '你好', roomId: 'g1', messageId: 'e3' });
    await service.handleInbound({ channel: 'bridge', from: 'u1', text: '你好', roomId: 'g1', mentioned: true, messageId: 'e4' });
    assert.equal(replies, 2, '只应回复白名单私聊一次 + 群聊 @ 一次');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
