/**
 * 快捷键三候选（浏览器半侧）：
 *  - 注册官方 shortcuts 命令（默认 Mod+Alt+K）；
 *  - 会话探针：挂在 conversation.input.overlay 上，捕获当前会话 scoped ctx；
 *  - 弹层：3 个候选 chip，点击填入当前会话草稿（拿不到会话则复制到剪贴板）。
 */
import type { Context } from '@deepseek-ai/cordis';

interface SuggestOption {
  text: string;
}

const STYLE_ID = 'dsh-pet-plus/suggest.css';

/** 最近一次探到的会话 scoped ctx；其它 client 模块（伴侣面板/拖拽即问）复用它把文本填进输入框。 */
let latestSessionCtx: unknown;

/** 把文本填进当前会话输入框；没有会话时退化为复制到剪贴板。 */
export function insertIntoLatestSession(text: string): boolean {
  try {
    if (!latestSessionCtx) throw new Error('no session');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSH 服务无静态类型
    const anyCtx = latestSessionCtx as any;
    const input = anyCtx.conversation?.input?.for?.(latestSessionCtx);
    if (!input || typeof input.setDraft !== 'function') throw new Error('no input facade');
    input.setDraft(text);
    input.focus?.();
    return true;
  } catch {
    void navigator.clipboard?.writeText(text).catch(() => {});
    return false;
  }
}
const POPUP_ID = 'dsh-pet-plus-suggest';

function ensureStyle(): void {
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return;
  const style = document.createElement('style');
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = `
.${POPUP_ID}{position:fixed;z-index:2147483002;left:50%;top:62%;transform:translate(-50%,-50%);
  width:min(420px,86vw);background:rgba(24,28,38,.96);color:#eef2ff;border:1px solid rgba(129,140,248,.35);
  border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.45);padding:14px 14px 10px;
  font-family:var(--dsh-pet-font-family,'PingFang SC','Microsoft YaHei',sans-serif);backdrop-filter:blur(14px);}
.${POPUP_ID} .h{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#a5b4fc;margin-bottom:8px}
.${POPUP_ID} .x{cursor:pointer;color:#94a3b8;padding:2px 6px;border-radius:6px}
.${POPUP_ID} .x:hover{background:rgba(148,163,184,.15);color:#fff}
.${POPUP_ID} .opt{display:block;width:100%;text-align:left;margin:6px 0;padding:10px 12px;border-radius:10px;
  border:1px solid rgba(148,163,184,.22);background:rgba(30,41,59,.7);color:#e2e8f0;font-size:13px;line-height:1.45;
  cursor:pointer;transition:background .15s,border-color .15s}
.${POPUP_ID} .opt:hover{background:rgba(79,70,229,.28);border-color:rgba(129,140,248,.7)}
.${POPUP_ID} .opt b{color:#818cf8;margin-right:6px}
.${POPUP_ID} .foot{display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:11px;color:#64748b}
.${POPUP_ID} .again{cursor:pointer;color:#a5b4fc;padding:3px 8px;border-radius:6px}
.${POPUP_ID} .again:hover{background:rgba(129,140,248,.15)}
.${POPUP_ID} .sk{height:38px;margin:6px 0;border-radius:10px;background:linear-gradient(90deg,rgba(148,163,184,.12),rgba(148,163,184,.24),rgba(148,163,184,.12));background-size:200% 100%;animation:dshpetSk 1.2s infinite}
@keyframes dshpetSk{0%{background-position:200% 0}100%{background-position:-200% 0}}
`;
  document.head.appendChild(style);
}

function closePopup(): void {
  document.getElementById(POPUP_ID)?.remove();
}

async function fetchOptions(refresh: boolean): Promise<{ options: string[]; source: string }> {
  const res = await fetch('/dsh-pet-plus/suggest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });
  const raw = (await res.json().catch(() => null)) as
    | { ok?: boolean; options?: string[]; source?: string; reason?: string }
    | null;
  if (!raw?.ok || !Array.isArray(raw.options) || raw.options.length === 0) {
    throw new Error(raw?.reason ?? '没有拿到候选');
  }
  return { options: raw.options, source: raw.source ?? 'llm' };
}

export function installSuggest(ctx: Context): () => void {
  let busy = false;

  const insertText = (text: string): boolean => insertIntoLatestSession(text);

  const show = async (refresh = false): Promise<void> => {
    if (busy) return;
    busy = true;
    closePopup();
    ensureStyle();
    const popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.className = POPUP_ID;
    popup.innerHTML =
      '<div class="h"><span>大肥鱼的三条建议</span><span class="x" title="关闭 (Esc)">✕</span></div>' +
      '<div class="body"><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>' +
      '<div class="foot"><span>1 / 2 / 3 选择 · Esc 关闭</span><span class="again">换一批</span></div>';
    document.body.appendChild(popup);
    const close = (): void => {
      closePopup();
      busy = false;
    };
    popup.querySelector('.x')?.addEventListener('click', close);
    popup.querySelector('.again')?.addEventListener('click', () => {
      busy = false;
      void show(true);
    });
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        window.removeEventListener('keydown', onKey, true);
        close();
        return;
      }
      const index = Number(event.key);
      if (index >= 1 && index <= 3) {
        const buttons = popup.querySelectorAll<HTMLButtonElement>('.opt');
        const button = buttons[index - 1];
        if (button) {
          event.preventDefault();
          button.click();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);

    try {
      const { options } = await fetchOptions(refresh);
      const body = popup.querySelector('.body');
      if (!body) return;
      body.innerHTML = '';
      options.slice(0, 3).forEach((text, index) => {
        const button = document.createElement('button');
        button.className = 'opt';
        button.type = 'button';
        button.innerHTML = `<b>${index + 1}</b>${text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] as string)}`;
        button.addEventListener('click', () => {
          const ok = insertText(text);
          if (!ok) {
            const foot = popup.querySelector('.foot span');
            if (foot) foot.textContent = '已复制到剪贴板（没找到当前会话）';
            window.setTimeout(close, 1200);
            return;
          }
          close();
        });
        body.appendChild(button);
      });
    } catch (error) {
      const body = popup.querySelector('.body');
      if (body) body.textContent = '生成失败：' + (error instanceof Error ? error.message : String(error));
      busy = false;
    }
  };

  // 会话探针：捕获当前会话的 scoped ctx（用于 setDraft）
  const disposeProbe = ctx.effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- slots 无静态类型
    const anyCtx = ctx as any;
    if (!anyCtx.slots?.inject) return () => {};
    return anyCtx.slots.inject('conversation.input.overlay', function* () {
      yield anyCtx.slots.register(
        {
          name: 'conversation.input.overlay',
          id: 'dsh-pet-plus-session-probe',
          order: 999,
          inject: (sessionId: string) => {
            try {
              latestSessionCtx = anyCtx.sessions?.scope?.(sessionId) ?? latestSessionCtx;
            } catch {
              /* ignore */
            }
            return {};
          },
        },
        () => null,
      );
    });
  }, 'dsh-pet-plus: session probe');

  const disposeShortcut = ctx.effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shortcuts 无静态类型
    const shortcuts = (ctx as any).get?.('shortcuts') ?? (ctx as any).shortcuts;
    if (!shortcuts || typeof shortcuts.register !== 'function') {
      console.warn('[dsh-pet-plus] shortcuts 服务不可用，快捷键三候选未注册');
      return () => {};
    }
    const binding = { code: 'KeyK', modifiers: ['primary', 'alt'] };
    return shortcuts.register({
      id: 'dsh-pet-plus.suggest',
      label: () => '大肥鱼：三条建议',
      aliases: ['suggest', 'pet suggest'],
      defaults: {
        'web:macos': binding,
        'web:windows': binding,
        'web:linux': binding,
        'desktop:macos': binding,
        'desktop:windows': binding,
        'desktop:linux': binding,
      },
      regions: ['page', 'editable'],
      modals: [],
      resolve: () => ({
        status: 'handled',
        run: () => {
          void show(false);
        },
      }),
    });
  }, 'dsh-pet-plus: suggest shortcut');

  return () => {
    disposeShortcut?.();
    disposeProbe?.();
    closePopup();
  };
}
