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
          const [stats, inst, cstatus, is] = await Promise.all([
            fetch('/dsh-pet-plus/memory/stats').then((r) => r.json()),
            fetch('/dsh-pet-plus/memory/instructions').then((r) => r.json()),
            fetch('/dsh-pet-plus/content/status').then((r) => r.json()),
            fetch('/dsh-pet-plus/im/status').then((r) => r.json()),
          ]);
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
      ),
      h(
        'section',
        { style: cardStyle },
        h('h3', { style: { fontSize: 14, margin: '0 0 6px' } }, '微信 / QQ'),
        h('p', { style: { fontSize: 12, opacity: 0.8 } }, JSON.stringify(im)),
        h('button', { style: btnStyle, onClick: () => void bind() }, '扫码绑定微信 ClawBot'),
        qr
          ? h(
              'p',
              { style: { fontSize: 12, wordBreak: 'break-all' as const } },
              '二维码/链接：',
              h('a', { href: qr.url, target: '_blank', rel: 'noreferrer' }, qr.url || qr.qrcode),
            )
          : null,
        h('p', { style: { fontSize: 12, opacity: 0.6 } }, 'QQ / 桥的地址、白名单在 main-config.jsonc 的 im 段配置。'),
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
