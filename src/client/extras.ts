/**
 * 设置页「桌宠 Plus」分区：记忆 / 内容自动化 / 微信 / 音效。
 * 独立 settings.section，避免改动原 dsh-pet 设置组件的巨型状态机。
 */
import type { FunctionComponent } from 'react';

const cardStyle = {
  border: '1px solid var(--dsw-alias-border-secondary, #334155)',
  borderRadius: 12,
  padding: '14px 16px',
  marginBottom: 12,
  background: 'var(--dsw-alias-bg-secondary, #1e293b)',
};
const labelStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '8px 0' };
const inputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-secondary, #475569)',
  background: 'var(--dsw-alias-bg-primary, #0f172a)',
  color: 'var(--dsw-alias-text-primary, #e2e8f0)',
  fontSize: 13,
};
const btnStyle = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--dsw-alias-border-secondary, #475569)',
  background: 'var(--dsw-alias-bg-primary, #0f172a)',
  color: 'var(--dsw-alias-text-primary, #e2e8f0)',
  cursor: 'pointer',
  fontSize: 12,
};

function splitList(value: string): string[] {
  return value
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

export function makeExtrasSection(react: {
  useState: typeof import('react').useState;
  useEffect: typeof import('react').useEffect;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSH 注入的 createElement
  createElement: (...args: any[]) => any;
}): FunctionComponent {
  const { useState, useEffect } = react;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 多子节点用 createElement 语义
  const h = react.createElement as any;
  return function ExtrasSection() {
    const [msg, setMsg] = useState('');
    const [busy, setBusy] = useState(false);
    const [mem, setMem] = useState({ enabled: true, chars: 0, version: 0 });
    const [instructions, setInstructions] = useState('');
    const [auto, setAuto] = useState({ enabled: false, acknowledged: false, dryRun: true });
    const [contentStatus, setContentStatus] = useState<Record<string, unknown>>({});
    const [im, setIm] = useState<Record<string, unknown>>({});
    const [sound, setSound] = useState({ enabled: true, volume: 0.7 });
    const [city, setCity] = useState('');
    const [qr, setQr] = useState<{ qrcode: string; url: string } | undefined>();
    const [profile, setProfile] = useState<
      Array<{ id: string; text: string; layer: string; importance: number; archived: boolean; rev: number }>
    >([]);
    const [newMemory, setNewMemory] = useState('');
    const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
    const [p2, setP2] = useState({ island: false, music: true, quickLaunch: true, tts: false, ttsVoice: '', ttsRate: 180 });
    const [quick, setQuick] = useState<Array<{ id: string; label: string; type: 'app' | 'url'; target: string }>>([]);
    const [imCfg, setImCfg] = useState({
      weixinEnabled: false,
      weixinMode: 'off',
      ilinkAllowFrom: '',
      bridgeUrl: '',
      qqEnabled: false,
      qqBaseUrl: '',
      qqSelfId: '',
      qqAllowFrom: '',
      autoReply: true,
    });

    useEffect(() => {
      void (async () => {
        try {
          const cfg = (await fetch('/dsh-pet-plus/config').then((r) => r.json())) as Record<string, Record<string, unknown>>;
          const main = cfg.main ?? {};
          const memory = (main.memory ?? {}) as Record<string, unknown>;
          const content = (main.content ?? {}) as Record<string, unknown>;
          const autoCfg = (content.auto ?? {}) as Record<string, unknown>;
          const p1 = (main.p1 ?? {}) as Record<string, unknown>;
          const weather = (p1.weather ?? {}) as Record<string, unknown>;
          const imMain = (main.im ?? {}) as Record<string, unknown>;
          const wx = (imMain.weixin ?? {}) as Record<string, unknown>;
          const ilink = (wx.ilink ?? {}) as Record<string, unknown>;
          const bridge = (wx.bridge ?? {}) as Record<string, unknown>;
          const qq = (imMain.qq ?? {}) as Record<string, unknown>;
          const p2Main = (main.p2 ?? {}) as Record<string, unknown>;
          const island = (p2Main.island ?? {}) as Record<string, unknown>;
          const music = (p2Main.music ?? {}) as Record<string, unknown>;
          const quickLaunch = (p2Main.quickLaunch ?? {}) as Record<string, unknown>;
          const tts = (p2Main.tts ?? {}) as Record<string, unknown>;
          setP2({
            island: island.enabled === true,
            music: music.enabled !== false,
            quickLaunch: quickLaunch.enabled !== false,
            tts: tts.enabled === true,
            ttsVoice: typeof tts.voice === 'string' ? tts.voice : '',
            ttsRate: Number(tts.rate ?? 180),
          });
          setQuick(
            Array.isArray(quickLaunch.items)
              ? (quickLaunch.items as Array<Record<string, unknown>>)
                  .map((it) => ({
                    id: String(it.id ?? ''),
                    label: String(it.label ?? it.id ?? ''),
                    type: it.type === 'url' ? ('url' as const) : ('app' as const),
                    target: String(it.target ?? ''),
                  }))
                  .filter((it) => it.id && it.target)
              : [],
          );
          setImCfg({
            weixinEnabled: wx.enabled === true,
            weixinMode: typeof wx.mode === 'string' ? wx.mode : 'off',
            ilinkAllowFrom: Array.isArray(ilink.allowFrom) ? (ilink.allowFrom as string[]).join(',') : '',
            bridgeUrl: typeof bridge.outboundUrl === 'string' ? bridge.outboundUrl : '',
            qqEnabled: qq.enabled === true,
            qqBaseUrl: typeof qq.baseUrl === 'string' ? qq.baseUrl : '',
            qqSelfId: typeof qq.selfId === 'string' ? qq.selfId : '',
            qqAllowFrom: Array.isArray(qq.allowFrom) ? (qq.allowFrom as string[]).join(',') : '',
            autoReply: qq.autoReply !== false,
          });
          setSound({
            enabled: main.clickSoundEnabled !== false,
            volume: Number(main.clickSoundVolume ?? 0.7),
          });
          setAuto({
            enabled: autoCfg.enabled === true,
            acknowledged: autoCfg.acknowledged === true,
            dryRun: autoCfg.dryRun !== false,
          });
          setCity(typeof weather.city === 'string' ? weather.city : '');
          const [stats, inst, cstatus, is, prof, logRes] = await Promise.all([
            fetch('/dsh-pet-plus/memory/stats').then((r) => r.json()),
            fetch('/dsh-pet-plus/memory/instructions').then((r) => r.json()),
            fetch('/dsh-pet-plus/content/status').then((r) => r.json()),
            fetch('/dsh-pet-plus/im/status').then((r) => r.json()),
            fetch('/dsh-pet-plus/memory/profile?includeArchived=1').then((r) => r.json()),
            fetch('/dsh-pet-plus/content/auto/logs').then((r) => r.json()),
          ]);
          setProfile(
            Array.isArray((prof as { entries?: unknown[] }).entries)
              ? ((prof as { entries: Array<Record<string, unknown>> }).entries.map((e) => ({
                  id: String(e.id ?? ''),
                  text: String(e.text ?? ''),
                  layer: String(e.layer ?? 'L2'),
                  importance: Number(e.importance ?? 0),
                  archived: e.archived === true,
                  rev: Number(e.rev ?? 0),
                })) as typeof profile)
              : [],
          );
          setLogs(Array.isArray((logRes as { logs?: unknown[] }).logs) ? ((logRes as { logs: Array<Record<string, unknown>> }).logs) : []);
          setMem({
            enabled: memory.enabled !== false,
            chars: Number((stats as { instructions?: { chars?: number } }).instructions?.chars ?? 0),
            version: Number((stats as { instructions?: { version?: number } }).instructions?.version ?? 0),
          });
          setInstructions(typeof (inst as { text?: string }).text === 'string' ? (inst as { text: string }).text : '');
          setContentStatus(cstatus as Record<string, unknown>);
          setIm(is as Record<string, unknown>);
        } catch {
          setMsg('加载扩展设置失败');
        }
      })();
    }, []);

    const saveExtras = async () => {
      setBusy(true);
      try {
        const res = await fetch('/dsh-pet-plus/settings/extras', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            memory: { enabled: mem.enabled },
            content: { auto },
            p1: { weather: { city } },
            p2: {
              island: { enabled: p2.island },
              music: { enabled: p2.music },
              quickLaunch: { enabled: p2.quickLaunch, items: quick },
              tts: { enabled: p2.tts, voice: p2.ttsVoice, rate: p2.ttsRate },
            },
            im: {
              weixin: {
                enabled: imCfg.weixinEnabled,
                mode: imCfg.weixinMode,
                ilink: { allowFrom: splitList(imCfg.ilinkAllowFrom) },
                bridge: { outboundUrl: imCfg.bridgeUrl },
              },
              qq: {
                enabled: imCfg.qqEnabled,
                baseUrl: imCfg.qqBaseUrl,
                selfId: imCfg.qqSelfId,
                allowFrom: splitList(imCfg.qqAllowFrom),
                autoReply: imCfg.autoReply,
              },
            },
            clickSoundEnabled: sound.enabled,
            clickSoundVolume: sound.volume,
            clickSoundPack: { kind: 'builtin', id: 'default', path: '' },
          }),
        });
        setMsg(res.ok ? '已保存' : '保存失败');
      } catch {
        setMsg('保存失败');
      } finally {
        setBusy(false);
      }
    };

    const saveInstructions = async () => {
      setBusy(true);
      try {
        const res = await fetch('/dsh-pet-plus/memory/instructions', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: instructions }),
        });
        setMsg(res.ok ? '记忆指令已保存' : '保存失败（可能版本冲突）');
        if (res.ok) {
          const next = (await res.json()) as { version?: number };
          setMem((m) => ({ ...m, version: Number(next.version ?? m.version) }));
        }
      } finally {
        setBusy(false);
      }
    };

    const addMemory = async () => {
      const text = newMemory.trim();
      if (!text) return;
      setBusy(true);
      try {
        const res = (await fetch('/dsh-pet-plus/memory/profile', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        }).then((r) => r.json())) as { ok?: boolean; entry?: (typeof profile)[number] };
        if (res.ok && res.entry) {
          setProfile((list) => [res.entry as (typeof profile)[number], ...list]);
          setNewMemory('');
          setMsg('已记住');
        } else {
          setMsg('添加失败（可能已被删除过）');
        }
      } finally {
        setBusy(false);
      }
    };

    const forgetMemory = async (id: string) => {
      setBusy(true);
      try {
        const res = await fetch('/dsh-pet-plus/memory/profile/' + encodeURIComponent(id) + '/forget', { method: 'POST' });
        if (res.ok) {
          setProfile((list) => list.map((e) => (e.id === id ? { ...e, archived: true } : e)));
          setMsg('已删除并写入墓碑');
        } else setMsg('删除失败');
      } finally {
        setBusy(false);
      }
    };

    const restoreMemory = async (id: string) => {
      setBusy(true);
      try {
        const res = await fetch('/dsh-pet-plus/memory/profile/' + encodeURIComponent(id) + '/restore', { method: 'POST' });
        if (res.ok) {
          setProfile((list) => list.map((e) => (e.id === id ? { ...e, archived: false } : e)));
          setMsg('已恢复');
        } else setMsg('恢复失败');
      } finally {
        setBusy(false);
      }
    };

    const bind = async () => {
      try {
        const res = (await fetch('/dsh-pet-plus/im/ilink/qr').then((r) => r.json())) as {
          ok?: boolean;
          qr?: { qrcode: string; url: string };
        };
        if (res.ok && res.qr) setQr(res.qr);
        else setMsg('拿二维码失败');
      } catch {
        setMsg('拿二维码失败');
      }
    };

    useEffect(() => {
      if (!qr) return;
      const timer = window.setInterval(() => {
        void (async () => {
          try {
            const res = (await fetch(
              '/dsh-pet-plus/im/ilink/qr/status?qrcode=' + encodeURIComponent(qr.qrcode),
            ).then((r) => r.json())) as { status?: string };
            if (res.status === 'confirmed') {
              setQr(undefined);
              setMsg('微信绑定成功');
            }
          } catch {
            /* retry */
          }
        })();
      }, 2500);
      return () => window.clearInterval(timer);
    }, [qr]);

    const row = (label: string, control: unknown) =>
      h('div', { style: labelStyle }, h('span', { style: { fontSize: 13 } }, label), control);

    return h(
      'div',
      { style: { maxWidth: 720 } },
      h('h2', { style: { fontSize: 16, margin: '0 0 12px' } }, '桌宠 Plus'),
      h(
        'section',
        { style: cardStyle },
        h('h3', { style: { fontSize: 14, margin: '0 0 6px' } }, '长期记忆'),
        row(
          '启用记忆注入',
          h('input', {
            type: 'checkbox',
            checked: mem.enabled,
            onChange: (e: { target: { checked: boolean } }) => setMem((m) => ({ ...m, enabled: e.target.checked })),
          }),
        ),
        h('p', { style: { fontSize: 12, opacity: 0.7, margin: '4px 0' } }, `当前指令 ${mem.chars} 字 / v${mem.version}`),
        h('textarea', {
          value: instructions,
          rows: 4,
          placeholder: '写下你希望它永远记住的约定，例如：早上不要打扰我；我不吃辣。',
          style: { ...inputStyle, resize: 'vertical' as const },
          onChange: (e: { target: { value: string } }) => setInstructions(e.target.value),
        }),
        h(
          'div',
          { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h('button', { style: btnStyle, onClick: () => void saveInstructions(), disabled: busy }, '保存记忆指令'),
          h('button', { style: btnStyle, onClick: () => void saveExtras(), disabled: busy }, '保存开关'),
        ),
        h('h4', { style: { fontSize: 13, margin: '14px 0 6px' } }, `长期画像（${profile.filter((e) => !e.archived).length} 条生效）`),
        h(
          'div',
          { style: { display: 'flex', gap: 8 } },
          h('input', {
            value: newMemory,
            placeholder: '手动记一条，例如：我对花生过敏',
            style: { ...inputStyle, flex: 1 },
            onChange: (e: { target: { value: string } }) => setNewMemory(e.target.value),
          }),
          h('button', { style: btnStyle, onClick: () => void addMemory(), disabled: busy }, '记住'),
        ),
        h(
          'div',
          { style: { marginTop: 8, maxHeight: 220, overflow: 'auto' } },
          profile.length === 0
            ? h('p', { style: { fontSize: 12, opacity: 0.6 } }, '还没有长期记忆。')
            : profile.map((entry) =>
                h(
                  'div',
                  {
                    key: entry.id,
                    style: {
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      padding: '6px 0',
                      borderBottom: '1px solid rgba(148,163,184,.15)',
                      opacity: entry.archived ? 0.45 : 1,
                    },
                  },
                  h(
                    'span',
                    { style: { fontSize: 10, color: '#a5b4fc', minWidth: 20, marginTop: 2 } },
                    entry.layer,
                  ),
                  h(
                    'span',
                    { style: { flex: 1, fontSize: 12, lineHeight: 1.5, textDecoration: entry.archived ? 'line-through' : 'none' } },
                    entry.text,
                  ),
                  h(
                    'button',
                    {
                      style: { ...btnStyle, padding: '2px 8px', fontSize: 11 },
                      onClick: () => void (entry.archived ? restoreMemory(entry.id) : forgetMemory(entry.id)),
                      disabled: busy,
                    },
                    entry.archived ? '恢复' : '忘记',
                  ),
                ),
              ),
        ),
      ),
      h(
        'section',
        { style: cardStyle },
        h('h3', { style: { fontSize: 14, margin: '0 0 6px' } }, '内容自动化（抖音 / 小红书）'),
        row(
          '启用',
          h('input', {
            type: 'checkbox',
            checked: auto.enabled,
            onChange: (e: { target: { checked: boolean } }) => setAuto((a) => ({ ...a, enabled: e.target.checked })),
          }),
        ),
        row(
          '已确认风险（建议小号）',
          h('input', {
            type: 'checkbox',
            checked: auto.acknowledged,
            onChange: (e: { target: { checked: boolean } }) => setAuto((a) => ({ ...a, acknowledged: e.target.checked })),
          }),
        ),
        row(
          '预演模式（只生成不发送）',
          h('input', {
            type: 'checkbox',
            checked: auto.dryRun,
            onChange: (e: { target: { checked: boolean } }) => setAuto((a) => ({ ...a, dryRun: e.target.checked })),
          }),
        ),
        h(
          'div',
          { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h('button', { style: btnStyle, onClick: () => void saveExtras(), disabled: busy }, '保存设置'),
          h(
            'button',
            {
              style: btnStyle,
              onClick: () =>
                void fetch('/dsh-pet-plus/content/auto/start', { method: 'POST' }).then((r) => setMsg(r.ok ? '已启动' : '启动失败')),
            },
            '启动',
          ),
          h(
            'button',
            {
              style: btnStyle,
              onClick: () => void fetch('/dsh-pet-plus/content/auto/stop', { method: 'POST' }).then(() => setMsg('已停止')),
            },
            '停止',
          ),
        ),
        h('p', { style: { fontSize: 12, opacity: 0.7, margin: '6px 0 0' } }, JSON.stringify(contentStatus.status ?? {})),
        h(
          'div',
          { style: { display: 'flex', gap: 8, marginTop: 8 } },
          h(
            'button',
            {
              style: btnStyle,
              onClick: async () => {
                const res = (await fetch('/dsh-pet-plus/content/auto/logs').then((r) => r.json())) as {
                  logs?: Array<Record<string, unknown>>;
                };
                setLogs(Array.isArray(res.logs) ? res.logs : []);
              },
            },
            '刷新日志',
          ),
        ),
        h(
          'div',
          { style: { maxHeight: 160, overflow: 'auto', marginTop: 6, fontSize: 11, opacity: 0.75 } },
          logs.length === 0
            ? h('p', null, '还没有自动模式日志。')
            : logs
                .slice(-30)
                .reverse()
                .map((entry, index) =>
                  h(
                    'div',
                    { key: index, style: { padding: '2px 0', borderBottom: '1px solid rgba(148,163,184,.1)' } },
                    JSON.stringify(entry),
                  ),
                ),
        ),
      ),
      h(
        'section',
        { style: cardStyle },
        h('h3', { style: { fontSize: 14, margin: '0 0 6px' } }, '微信 / QQ'),
        h('p', { style: { fontSize: 12, opacity: 0.8 } }, JSON.stringify(im)),
        row(
          '微信启用',
          h('input', {
            type: 'checkbox',
            checked: imCfg.weixinEnabled,
            onChange: (e: { target: { checked: boolean } }) => setImCfg((c) => ({ ...c, weixinEnabled: e.target.checked })),
          }),
        ),
        row(
          '微信模式',
          h(
            'select',
            {
              value: imCfg.weixinMode,
              style: { ...inputStyle, width: 180 },
              onChange: (e: { target: { value: string } }) => setImCfg((c) => ({ ...c, weixinMode: e.target.value })),
            },
            h('option', { value: 'off' }, '关闭'),
            h('option', { value: 'ilink' }, 'ClawBot / iLink 直连'),
            h('option', { value: 'bridge' }, '自建桥'),
          ),
        ),
        row(
          'iLink 白名单',
          h('input', {
            value: imCfg.ilinkAllowFrom,
            placeholder: '逗号分隔，留空 = 不限制',
            style: { ...inputStyle, width: 260 },
            onChange: (e: { target: { value: string } }) => setImCfg((c) => ({ ...c, ilinkAllowFrom: e.target.value })),
          }),
        ),
        row(
          '桥出站地址',
          h('input', {
            value: imCfg.bridgeUrl,
            placeholder: 'https://...',
            style: { ...inputStyle, width: 260 },
            onChange: (e: { target: { value: string } }) => setImCfg((c) => ({ ...c, bridgeUrl: e.target.value })),
          }),
        ),
        row(
          'QQ 启用',
          h('input', {
            type: 'checkbox',
            checked: imCfg.qqEnabled,
            onChange: (e: { target: { checked: boolean } }) => setImCfg((c) => ({ ...c, qqEnabled: e.target.checked })),
          }),
        ),
        row(
          'QQ OneBot 地址',
          h('input', {
            value: imCfg.qqBaseUrl,
            placeholder: 'http://127.0.0.1:3000',
            style: { ...inputStyle, width: 260 },
            onChange: (e: { target: { value: string } }) => setImCfg((c) => ({ ...c, qqBaseUrl: e.target.value })),
          }),
        ),
        row(
          'QQ 机器人 QQ 号',
          h('input', {
            value: imCfg.qqSelfId,
            placeholder: '123456789',
            style: { ...inputStyle, width: 200 },
            onChange: (e: { target: { value: string } }) => setImCfg((c) => ({ ...c, qqSelfId: e.target.value })),
          }),
        ),
        row(
          'QQ 白名单',
          h('input', {
            value: imCfg.qqAllowFrom,
            placeholder: '逗号分隔 QQ 号，留空 = 不限制',
            style: { ...inputStyle, width: 240 },
            onChange: (e: { target: { value: string } }) => setImCfg((c) => ({ ...c, qqAllowFrom: e.target.value })),
          }),
        ),
        row(
          'QQ 自动回复',
          h('input', {
            type: 'checkbox',
            checked: imCfg.autoReply,
            onChange: (e: { target: { checked: boolean } }) => setImCfg((c) => ({ ...c, autoReply: e.target.checked })),
          }),
        ),
        h('p', { style: { fontSize: 11, opacity: 0.55, margin: '4px 0' } }, '密钥（accessToken / inboundSecret）只从凭据库或环境变量读取，不会写进配置文件。'),
        h(
          'div',
          { style: { display: 'flex', gap: 8, marginTop: 6 } },
          h('button', { style: btnStyle, onClick: () => void saveExtras(), disabled: busy }, '保存 IM 设置'),
          h('button', { style: btnStyle, onClick: () => void bind() }, '扫码绑定微信 ClawBot'),
        ),
        qr
          ? h(
              'p',
              { style: { fontSize: 12, wordBreak: 'break-all' as const } },
              '二维码/链接：',
              h('a', { href: qr.url, target: '_blank', rel: 'noreferrer' }, qr.url || qr.qrcode),
            )
          : null,
      ),
      h(
        'section',
        { style: cardStyle },
        h('h3', { style: { fontSize: 14, margin: '0 0 6px' } }, '灵动岛 / 音乐 / 朗读 / 快捷启动'),
        row(
          '顶部灵动岛',
          h('input', {
            type: 'checkbox',
            checked: p2.island,
            onChange: (e: { target: { checked: boolean } }) => setP2((v) => ({ ...v, island: e.target.checked })),
          }),
        ),
        row(
          '正在播放',
          h('input', {
            type: 'checkbox',
            checked: p2.music,
            onChange: (e: { target: { checked: boolean } }) => setP2((v) => ({ ...v, music: e.target.checked })),
          }),
        ),
        row(
          '快捷启动',
          h('input', {
            type: 'checkbox',
            checked: p2.quickLaunch,
            onChange: (e: { target: { checked: boolean } }) => setP2((v) => ({ ...v, quickLaunch: e.target.checked })),
          }),
        ),
        row(
          '朗读（macOS say）',
          h('input', {
            type: 'checkbox',
            checked: p2.tts,
            onChange: (e: { target: { checked: boolean } }) => setP2((v) => ({ ...v, tts: e.target.checked })),
          }),
        ),
        row(
          '朗读音色 / 语速',
          h(
            'div',
            { style: { display: 'flex', gap: 6 } },
            h('input', {
              type: 'text',
              value: p2.ttsVoice,
              placeholder: '留空 = 系统默认',
              style: { ...inputStyle, width: 150 },
              onChange: (e: { target: { value: string } }) => setP2((v) => ({ ...v, ttsVoice: e.target.value })),
            }),
            h('input', {
              type: 'number',
              min: 80,
              max: 400,
              value: p2.ttsRate,
              style: { ...inputStyle, width: 80 },
              onChange: (e: { target: { value: string } }) =>
                setP2((v) => ({ ...v, ttsRate: Number(e.target.value) || 180 })),
            }),
          ),
        ),
        h('h4', { style: { fontSize: 13, margin: '12px 0 4px' } }, '快捷启动条目'),
        ...quick.map((item, index) =>
          h(
            'div',
            { key: item.id, style: { display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' } },
            h('input', {
              type: 'text',
              value: item.label,
              placeholder: '名称',
              style: { ...inputStyle, width: 110 },
              onChange: (e: { target: { value: string } }) =>
                setQuick((list) => list.map((x, i) => (i === index ? { ...x, label: e.target.value } : x))),
            }),
            h(
              'select',
              {
                value: item.type,
                style: { ...inputStyle, width: 80 },
                onChange: (e: { target: { value: string } }) =>
                  setQuick((list) =>
                    list.map((x, i) => (i === index ? { ...x, type: e.target.value === 'url' ? 'url' : 'app' } : x)),
                  ),
              },
              h('option', { value: 'app' }, 'App'),
              h('option', { value: 'url' }, '网址'),
            ),
            h('input', {
              type: 'text',
              value: item.target,
              placeholder: 'App 名或 https://...',
              style: { ...inputStyle, flex: 1 },
              onChange: (e: { target: { value: string } }) =>
                setQuick((list) => list.map((x, i) => (i === index ? { ...x, target: e.target.value } : x))),
            }),
            h(
              'button',
              {
                style: { ...btnStyle, padding: '2px 8px' },
                onClick: () => setQuick((list) => list.filter((_, i) => i !== index)),
              },
              '删',
            ),
          ),
        ),
        h(
          'button',
          {
            style: { ...btnStyle, marginTop: 4 },
            onClick: () =>
              setQuick((list) => [
                ...list,
                { id: 'q' + Date.now().toString(36), label: '', type: 'app', target: '' },
              ]),
          },
          '+ 加一条',
        ),
        h('button', { style: { ...btnStyle, marginLeft: 8, marginTop: 4 }, onClick: () => void saveExtras(), disabled: busy }, '保存'),
      ),
      h(
        'section',
        { style: cardStyle },
        h('h3', { style: { fontSize: 14, margin: '0 0 6px' } }, '互动与陪伴'),
        row(
          '点击音效',
          h('input', {
            type: 'checkbox',
            checked: sound.enabled,
            onChange: (e: { target: { checked: boolean } }) => setSound((s) => ({ ...s, enabled: e.target.checked })),
          }),
        ),
        row(
          '音量',
          h('input', {
            type: 'range',
            min: 0,
            max: 1,
            step: 0.05,
            value: sound.volume,
            onChange: (e: { target: { value: string } }) =>
              setSound((s) => ({ ...s, volume: Number(e.target.value) })),
          }),
        ),
        row(
          '天气城市',
          h('input', {
            type: 'text',
            value: city,
            placeholder: '例如：北京',
            style: { ...inputStyle, width: 200 },
            onChange: (e: { target: { value: string } }) => setCity(e.target.value),
          }),
        ),
        h('button', { style: btnStyle, onClick: () => void saveExtras(), disabled: busy }, '保存互动设置'),
      ),
      msg ? h('p', { style: { fontSize: 12, color: '#93c5fd' } }, msg) : null,
    );
  };
}
