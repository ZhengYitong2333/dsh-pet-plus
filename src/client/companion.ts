/**
 * 伴侣面板（浏览器半侧，纯 DOM，不依赖 React）：
 *  - 待办（含倒计时）/ 天气 / 正在播放 / 记忆时间线 / 快捷启动 / 内容副驾 / 朗读；
 *  - 拖拽或剪贴板「即问」：总结 / 翻译 / 解释 / 写成评论；
 *  - 截图：抓一帧复制到剪贴板，粘贴进对话即可让模型看图。
 *
 * 为什么不用 React：DSH 的 overlay 槽位只保证 React 运行时，面板是纯展示 + fetch，
 * 用原生 DOM 可以独立安装/卸载，也不会和桌宠页面（pet.ts）的渲染状态互相影响。
 * 所有网络请求都走宿主 /dsh-pet-plus/* 路由；任何一段失败只影响当前 tab。
 */
import type { Context } from '@deepseek-ai/cordis';
import { insertIntoLatestSession } from './suggest';

const ROOT_ID = 'dsh-pet-plus-companion';
const STYLE_ID = 'dsh-pet-plus/companion.css';

type Tab = 'settings' | 'display' | 'chat';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'settings', label: '设置' },
  { id: 'display', label: '显示位置' },
  { id: 'chat', label: '聊天' },
];

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  dueAt?: number;
}

interface PetLite {
  id: string;
  name?: string;
  display?: string;
}

function css(): string {
  return `
#${ROOT_ID}{position:fixed;left:18px;top:calc(50% - 23px);right:auto;bottom:auto;z-index:2147483002;pointer-events:auto;display:flex;gap:6px;align-items:center;
  font-family:var(--dsh-pet-font-family,'PingFang SC','Microsoft YaHei',sans-serif);color:var(--dpp-text,#e8edf7);font-size:13px}
#${ROOT_ID} [hidden]{display:none !important}
#${ROOT_ID} .dpp-btn{width:46px;height:46px;border-radius:50%;border:1px solid var(--dpp-border,rgba(148,163,184,.2));
  background:var(--dpp-glass-strong,rgba(18,22,31,.86));color:#c7d2fe;font-size:20px;cursor:pointer;
  box-shadow:0 12px 34px rgba(0,0,0,.38);backdrop-filter:var(--dpp-blur,blur(20px));
  -webkit-backdrop-filter:var(--dpp-blur,blur(20px));transition:transform .16s ease,background .16s ease}
#${ROOT_ID} .dpp-btn:hover{transform:translateY(-2px);background:rgba(79,70,229,.55);border-color:rgba(139,149,255,.55)}
#${ROOT_ID} .dpp-btn{cursor:grab;touch-action:none}
#${ROOT_ID} .dpp-btn:active{cursor:grabbing}
#${ROOT_ID} .dpp-panel{position:fixed;left:78px;right:auto;bottom:96px;width:min(380px,86vw);max-height:min(560px,72vh);pointer-events:auto;
  display:flex;flex-direction:column;overflow:hidden;border-radius:var(--dpp-radius-lg,20px);
  background:linear-gradient(160deg,var(--dpp-glass-strong,rgba(18,22,31,.86)),var(--dpp-glass,rgba(22,27,38,.72)));
  border:1px solid var(--dpp-border,rgba(148,163,184,.2));box-shadow:var(--dpp-shadow,0 24px 70px rgba(0,0,0,.48));
  backdrop-filter:var(--dpp-blur,blur(20px) saturate(140%));-webkit-backdrop-filter:var(--dpp-blur,blur(20px) saturate(140%))}
#${ROOT_ID} .dpp-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;cursor:move;user-select:none}
#${ROOT_ID} .dpp-title{font-size:12.5px;letter-spacing:.3px;color:#b9c0ff;font-weight:600}
#${ROOT_ID} .dpp-head-actions{display:flex;align-items:center;gap:4px}
#${ROOT_ID} .dpp-x,#${ROOT_ID} .dpp-refresh{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;
  cursor:pointer;color:var(--dpp-muted,#9aa7bd);border-radius:8px;font-size:14px;line-height:1;transition:background .15s ease,color .15s ease}
#${ROOT_ID} .dpp-x:hover,#${ROOT_ID} .dpp-refresh:hover{background:rgba(255,255,255,.10);color:#fff}
#${ROOT_ID} .dpp-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 12px 10px}
#${ROOT_ID} .dpp-tab{height:30px;padding:0 6px;border-radius:10px;border:1px solid transparent;background:transparent;
  color:var(--dpp-muted,#9aa7bd);cursor:pointer;font-size:11.5px;text-align:center;white-space:nowrap;overflow:hidden;
  text-overflow:ellipsis;transition:background .15s ease,color .15s ease,border-color .15s ease}
#${ROOT_ID} .dpp-tab:hover{color:#e8edf7;background:rgba(255,255,255,.07)}
#${ROOT_ID} .dpp-tab.on{color:#fff;background:linear-gradient(180deg,rgba(99,102,241,.52),rgba(79,70,229,.36));
  border-color:rgba(139,149,255,.48);box-shadow:0 4px 14px rgba(79,70,229,.22)}
#${ROOT_ID} .dpp-body{padding:2px 14px 14px;overflow:auto;flex:1;min-height:120px}
#${ROOT_ID} .dpp-row{display:flex;align-items:flex-start;gap:9px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.10)}
#${ROOT_ID} .dpp-row:last-child{border-bottom:0}
#${ROOT_ID} .dpp-grow{flex:1;min-width:0;word-break:break-word;line-height:1.5;cursor:text;font-size:12.5px}
#${ROOT_ID} .dpp-dim{color:var(--dpp-muted,#9aa7bd);font-size:12px;line-height:1.5}
#${ROOT_ID} .dpp-due{color:#fbbf24;font-size:11px;margin-left:6px}
#${ROOT_ID} .dpp-over{color:#f87171;font-size:11px;margin-left:6px}
#${ROOT_ID} .dpp-done{text-decoration:line-through;opacity:.45}
#${ROOT_ID} .dpp-mini{width:24px;height:24px;border:0;background:transparent;color:#7c8aa3;cursor:pointer;font-size:14px;
  padding:0;border-radius:6px;line-height:1}
#${ROOT_ID} .dpp-mini:hover{color:#f87171;background:rgba(248,113,113,.10)}
#${ROOT_ID} input[type=text],#${ROOT_ID} input[type=datetime-local],#${ROOT_ID} textarea{width:100%;box-sizing:border-box;
  height:var(--dpp-control-h,34px);padding:0 10px;border-radius:var(--dpp-radius-sm,10px);
  border:1px solid var(--dpp-border,rgba(148,163,184,.2));background:rgba(12,17,26,.45);color:var(--dpp-text,#e8edf7);
  font-size:12px;font-family:inherit;outline:none;transition:border-color .15s ease,box-shadow .15s ease}
#${ROOT_ID} input:focus,#${ROOT_ID} textarea:focus{border-color:var(--dpp-accent,#8b95ff);box-shadow:0 0 0 3px rgba(139,149,255,.15)}
#${ROOT_ID} textarea{height:auto;min-height:64px;padding:9px 10px;resize:vertical}
#${ROOT_ID} .dpp-add{display:flex;gap:8px;margin-top:10px;align-items:center}
#${ROOT_ID} .dpp-add input[type=text]{flex:1;min-width:0}
#${ROOT_ID} .dpp-primary{height:var(--dpp-control-h,34px);padding:0 14px;border-radius:var(--dpp-radius-sm,10px);
  border:1px solid rgba(139,149,255,.55);background:linear-gradient(180deg,rgba(99,102,241,.58),rgba(79,70,229,.42));
  color:#f2f4ff;cursor:pointer;font-size:12px;white-space:nowrap;transition:filter .15s ease}
#${ROOT_ID} .dpp-primary:hover{filter:brightness(1.12)}
#${ROOT_ID} .dpp-primary:disabled{opacity:.5;cursor:default}
#${ROOT_ID} .dpp-card{padding:11px 12px;border-radius:var(--dpp-radius-md,14px);background:rgba(255,255,255,.045);
  border:1px solid rgba(148,163,184,.14);margin:7px 0;backdrop-filter:blur(8px)}
#${ROOT_ID} .dpp-card b{color:#c7d2fe;font-weight:600}
#${ROOT_ID} .dpp-actions{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap;align-items:center}
#${ROOT_ID} .dpp-chip{height:30px;padding:0 12px;border-radius:var(--dpp-radius-pill,999px);
  border:1px solid var(--dpp-border,rgba(148,163,184,.2));background:rgba(255,255,255,.055);color:#d7deeb;
  cursor:pointer;font-size:12px;transition:background .15s ease,border-color .15s ease}
#${ROOT_ID} .dpp-chip:hover{background:rgba(139,149,255,.16);border-color:rgba(139,149,255,.55);color:#fff}
#${ROOT_ID} .dpp-seg{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:4px;border-radius:12px;
  background:rgba(12,17,26,.38);border:1px solid rgba(148,163,184,.14);margin:2px 0 8px}
#${ROOT_ID} .dpp-seg button{height:30px;border:0;border-radius:9px;background:transparent;color:var(--dpp-muted,#9aa7bd);
  font-size:11.5px;cursor:pointer;transition:background .15s ease,color .15s ease}
#${ROOT_ID} .dpp-seg button:hover{background:rgba(255,255,255,.07);color:#e8edf7}
#${ROOT_ID} .dpp-seg button.on{background:linear-gradient(180deg,rgba(99,102,241,.55),rgba(79,70,229,.38));
  color:#fff;border:1px solid rgba(139,149,255,.45)}
#${ROOT_ID} .dpp-chat{display:flex;flex-direction:column;gap:8px;min-height:200px}
#${ROOT_ID} .dpp-msgs{display:flex;flex-direction:column;gap:7px;max-height:300px;overflow:auto;padding:2px 1px 4px}
#${ROOT_ID} .dpp-msg{max-width:86%;padding:8px 11px;border-radius:13px;font-size:12.5px;line-height:1.5;
  white-space:pre-wrap;word-break:break-word;border:1px solid rgba(148,163,184,.14)}
#${ROOT_ID} .dpp-msg.user{align-self:flex-end;background:rgba(99,102,241,.34);border-color:rgba(139,149,255,.42);color:#f2f4ff}
#${ROOT_ID} .dpp-msg.pet{align-self:flex-start;background:rgba(255,255,255,.05);color:#e6ebf5}
#${ROOT_ID} .dpp-msg.typing{opacity:.65;font-style:italic}
#${ROOT_ID} .dpp-err{color:#fca5a5;font-size:12px;margin:6px 0;line-height:1.5}
#${ROOT_ID} .dpp-ok{color:#86efac;font-size:12px;margin:6px 0}
#dsh-pet-plus-ask{position:fixed;z-index:2147483003;width:min(360px,84vw);padding:14px;border-radius:var(--dpp-radius-md,14px);
  background:linear-gradient(160deg,var(--dpp-glass-strong,rgba(18,22,31,.86)),var(--dpp-glass,rgba(22,27,38,.72)));
  border:1px solid var(--dpp-border,rgba(148,163,184,.2));box-shadow:var(--dpp-shadow,0 24px 70px rgba(0,0,0,.48));
  color:var(--dpp-text,#e8edf7);font-family:var(--dsh-pet-font-family,'PingFang SC',sans-serif);font-size:12px;
  backdrop-filter:var(--dpp-blur,blur(20px));-webkit-backdrop-filter:var(--dpp-blur,blur(20px))}
#dsh-pet-plus-ask .dpp-ask-head{display:flex;justify-content:space-between;align-items:center;color:#b9c0ff;margin-bottom:9px;font-weight:600}
#dsh-pet-plus-ask .dpp-ask-text{max-height:76px;overflow:auto;color:var(--dpp-muted,#9aa7bd);line-height:1.5;margin-bottom:9px;white-space:pre-wrap;word-break:break-word}
#dsh-pet-plus-ask .dpp-ask-out{margin-top:9px;padding:10px;border-radius:10px;background:rgba(255,255,255,.05);
  border:1px solid rgba(148,163,184,.12);line-height:1.55;white-space:pre-wrap;word-break:break-word}
`;
}

function ensureStyle(): void {
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return;
  const style = document.createElement('style');
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

function esc(value: string): string {
  return String(value).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string);
}

const API_TIMEOUT_MS = 8000;

/** 统一请求：显式 AbortController + 定时器，兼容没有 AbortSignal.timeout 的旧内核；
 *  超时/断线/非 JSON 都给出可读错误，调用方据此渲染错误态而不是永远停在「加载中」。 */
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const outer = init?.signal;
  const forwardAbort = (): void => controller.abort();
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', forwardAbort, { once: true });
  }
  try {
    const res = await fetch('/dsh-pet-plus' + path, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
    const raw = (await res.json().catch(() => null)) as T | null;
    if (raw === null) throw new Error(`服务返回 ${res.status}，响应不是 JSON`);
    if (res.status >= 500) {
      const message = (raw as { message?: string } | null)?.message;
      throw new Error(message ?? `服务返回 ${res.status}`);
    }
    return raw;
  } catch (error) {
    if (controller.signal.aborted && !(outer?.aborted ?? false)) {
      throw new Error(`请求超时（${API_TIMEOUT_MS / 1000} 秒），请稍后重试`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener('abort', forwardAbort);
  }
}


function toast(text: string, kind: 'ok' | 'err' = 'ok'): void {
  ensureStyle();
  const node = document.createElement('div');
  node.textContent = text;
  node.style.cssText =
    'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:2147483004;padding:8px 14px;border-radius:10px;' +
    'font-size:12px;color:#e2e8f0;background:rgba(20,24,34,.96);border:1px solid ' +
    (kind === 'ok' ? 'rgba(74,222,128,.45)' : 'rgba(248,113,113,.5)') +
    ';box-shadow:0 8px 30px rgba(0,0,0,.4);pointer-events:none';
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 2600);
}

function fmtDue(dueAt?: number): { text: string; overdue: boolean } | undefined {
  if (!dueAt || !Number.isFinite(dueAt)) return undefined;
  const diff = dueAt - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const text =
    mins < 1 ? '就在此刻' : mins < 60 ? `${mins} 分钟` : mins < 1440 ? `${Math.round(mins / 60)} 小时` : `${Math.round(mins / 1440)} 天`;
  return diff >= 0 ? { text: '还有 ' + text, overdue: false } : { text: '已超时 ' + text, overdue: true };
}

function nowHHMM(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface CompanionOptions {
  /** 打开内容副驾时预填的链接（例如从聊天里复制后按快捷键） */
  initialLink?: string;
}

export function installCompanion(ctx: Context): () => void {
  ensureStyle();
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.dataset.build = '0.1.2';
  root.innerHTML =
    '<button class="dpp-btn dpp-pet" type="button" title="展示桌宠（双击打开伴侣面板）">🐟</button>' +
    '<div class="dpp-panel" hidden>' +
    '<div class="dpp-head"><span class="dpp-title">大肥鱼 · 伴侣面板</span><span class="dpp-head-actions">' +
    '<span class="dpp-refresh" title="重新加载当前 tab">↻</span><span class="dpp-x" title="关闭 (Esc)">✕</span></span></div>' +
    '<div class="dpp-tabs">' +
    TABS.map((t) => `<button class="dpp-tab" data-tab="${t.id}" type="button">${t.label}</button>`).join('') +
    '</div><div class="dpp-body"><div class="dpp-dim">加载中…</div></div></div>';
  document.body.appendChild(root);

  const panel = root.querySelector<HTMLDivElement>('.dpp-panel');
  const body = root.querySelector<HTMLDivElement>('.dpp-body');
  const button = root.querySelector<HTMLButtonElement>('.dpp-btn');
  const head = root.querySelector<HTMLDivElement>('.dpp-head');
  let current: Tab | undefined;
  let timer: number | undefined;
  /** 每次切 tab 自增：过期请求的错误/看门狗不再覆盖当前 tab。 */
  let renderSeq = 0;
  let renderWatchdog: number | undefined;

  // 面板可拖动：位置存 localStorage；双击标题栏回到默认位置。
  const POS_KEY = 'dsh-pet-plus:panel-pos';
  const applyPos = (left: number, top: number): void => {
    if (!panel) return;
    const w = panel.getBoundingClientRect().width;
    const h = panel.getBoundingClientRect().height;
    panel.style.position = 'fixed';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = Math.max(4, Math.min(left, window.innerWidth - w - 4)) + 'px';
    panel.style.top = Math.max(4, Math.min(top, window.innerHeight - h - 4)) + 'px';
  };
  let savedPos: { left: number; top: number } | undefined;
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { left?: number; top?: number } | null;
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
      savedPos = { left: saved.left as number, top: saved.top as number };
    }
  } catch {
    /* 位置坏了就用默认 */
  }
  head?.addEventListener('dblclick', (event) => {
    if ((event.target as HTMLElement).closest('.dpp-x')) return;
    if (!panel) return;
    panel.style.position = '';
    panel.style.right = '';
    panel.style.bottom = '';
    panel.style.left = '';
    panel.style.top = '';
    localStorage.removeItem(POS_KEY);
  });
  head?.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.dpp-x')) return;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (e: MouseEvent): void => {
      applyPos(rect.left + e.clientX - startX, rect.top + e.clientY - startY);
    };
    const up = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const final = panel.getBoundingClientRect();
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ left: final.left, top: final.top }));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    event.preventDefault();
  });

  const stopTimer = (): void => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };

  const setTab = (tab: Tab): void => {
    current = tab;
    stopTimer();
    if (renderWatchdog !== undefined) window.clearTimeout(renderWatchdog);
    renderWatchdog = undefined;
    const seq = ++renderSeq;
    root.querySelectorAll<HTMLButtonElement>('.dpp-tab').forEach((el) => {
      el.classList.toggle('on', el.dataset.tab === tab);
    });
    if (!body) return;
    body.innerHTML = '<div class="dpp-dim">加载中…</div>';
    const fail = (error: unknown): void => {
      if (!body || seq !== renderSeq) return;
      if (renderWatchdog !== undefined) window.clearTimeout(renderWatchdog);
      renderWatchdog = undefined;
      const message = error instanceof Error ? error.message : String(error);
      body.innerHTML =
        `<div class="dpp-err">${esc(message)}</div>` +
        `<div class="dpp-actions"><button class="dpp-chip" type="button" id="dpp-retry">重试</button></div>`;
      body.querySelector('#dpp-retry')?.addEventListener('click', () => setTab(tab));
    };
    // renderX 既可能是同步抛错，也可能返回一个永不 settle 的 Promise：
    // 统一 catch + 看门狗，保证「加载中…」不会成为终态。
    const run = (render: () => void | Promise<void>): void => {
      try {
        void Promise.resolve(render()).catch(fail);
      } catch (error) {
        fail(error);
      }
    };
    renderWatchdog = window.setTimeout(() => {
      if (seq !== renderSeq) return;
      if (body.querySelector('.dpp-dim')?.textContent?.includes('加载中')) {
        fail(new Error('加载超时（服务没有响应），点重试或切个 tab'));
      }
    }, API_TIMEOUT_MS + 1500);
    if (tab === 'settings') run(() => renderSettings(body, fail));
    if (tab === 'display') run(() => renderDisplay(body, fail));
    if (tab === 'chat') run(() => renderChat(body, fail));
  };

  // ---- 番茄钟：状态挂在面板实例上，切 tab / 关面板都不丢 ----
  const pomo = { minutes: 25, remaining: 25 * 60, running: false, endAt: 0, timer: undefined as number | undefined };
  const beep = (): void => {
    try {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;
      const audio = new AudioCtor();
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + 0.35);
      window.setTimeout(() => void audio.close().catch(() => {}), 600);
    } catch {
      /* 不能响就算了 */
    }
  };
  const stopPomoTimer = (): void => {
    if (pomo.timer !== undefined) window.clearInterval(pomo.timer);
    pomo.timer = undefined;
  };
  const focusText = (): string => {
    const m = Math.floor(pomo.remaining / 60);
    const sec = pomo.remaining % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };
  const refreshFocus = (): void => {
    const node = document.getElementById('dpp-focus-time');
    if (node) node.textContent = focusText();
    const state = document.getElementById('dpp-focus-state');
    if (state) state.textContent = pomo.running ? '专注中' : pomo.remaining === 0 ? '已结束' : '待开始';
    const start = document.getElementById('dpp-focus-start') as HTMLButtonElement | null;
    if (start) start.textContent = pomo.running ? '暂停' : '开始';
  };
  const tickPomo = (): void => {
    if (!pomo.running) return;
    pomo.remaining = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
    if (pomo.remaining <= 0) {
      pomo.running = false;
      stopPomoTimer();
      beep();
      toast('专注结束，起来走走 ☕');
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('大肥鱼 · 专注结束', { body: '这一轮完成了，休息五分钟吧。' });
      }
    }
    refreshFocus();
  };
  const startPomo = (minutes: number): void => {
    stopPomoTimer();
    pomo.minutes = minutes;
    pomo.remaining = minutes * 60;
    pomo.running = false;
    refreshFocus();
  };
  const togglePomo = (): void => {
    if (pomo.running) {
      pomo.remaining = Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000));
      pomo.running = false;
      stopPomoTimer();
    } else {
      if (pomo.remaining <= 0) pomo.remaining = pomo.minutes * 60;
      pomo.endAt = Date.now() + pomo.remaining * 1000;
      pomo.running = true;
      stopPomoTimer();
      pomo.timer = window.setInterval(tickPomo, 1000);
    }
    refreshFocus();
  };
  const renderFocus = (target: HTMLDivElement, fail: Fail): void => {
    target.innerHTML =
      `<div class="dpp-card" style="text-align:center"><div id="dpp-focus-time" style="font-size:34px;font-variant-numeric:tabular-nums;letter-spacing:2px">${focusText()}</div>` +
      `<div class="dpp-dim" id="dpp-focus-state">${pomo.running ? '专注中' : pomo.remaining === 0 ? '已结束' : '待开始'}</div></div>` +
      '<div class="dpp-actions">' +
      '<button class="dpp-chip" data-min="25" type="button">25 分钟</button>' +
      '<button class="dpp-chip" data-min="45" type="button">45 分钟</button>' +
      '<button class="dpp-chip" data-min="5" type="button">5 分钟休息</button>' +
      '</div><div class="dpp-actions">' +
      '<button class="dpp-primary" id="dpp-focus-start" type="button">开始</button>' +
      '<button class="dpp-chip" id="dpp-focus-reset" type="button">重置</button></div>';
    target.querySelector('#dpp-focus-start')?.addEventListener('click', () => togglePomo());
    target.querySelector('#dpp-focus-reset')?.addEventListener('click', () => {
      stopPomoTimer();
      pomo.running = false;
      pomo.remaining = pomo.minutes * 60;
      refreshFocus();
    });
    target.querySelectorAll<HTMLButtonElement>('[data-min]').forEach((button) => {
      button.addEventListener('click', () => startPomo(Number(button.dataset.min ?? 25)));
    });
    refreshFocus();
    if (pomo.running) {
      stopPomoTimer();
      pomo.timer = window.setInterval(tickPomo, 1000);
    }
    void fail;
  };

  const toggle = (tab: Tab = current ?? 'settings'): void => {
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      if (savedPos) {
        // 面板隐藏时 rect 是 0，不能在那时夹取位置；显示后补一次。
        applyPos(savedPos.left, savedPos.top);
        savedPos = undefined;
      }
      setTab(tab);
    } else stopTimer();
  };

  // 展示按钮：把桌宠从「隐藏 / 仅桌面」拉回网页（display=both），不需要进设置页。
  async function showPet(): Promise<void> {
    try {
      const cfg = await api<{ main?: { pets?: Array<{ id?: string; display?: string }> } }>('/config');
      const pet = (cfg.main?.pets ?? []).find((p) => p?.id);
      if (!pet?.id) {
        toast('配置里没有桌宠，先到设置里添加一只', 'err');
        return;
      }
      // 已经开着（网页 / 桌面 / 两者）就沿用原状态，绝不因为点一下按钮就改 display。
      if (pet.display === 'web' || pet.display === 'both' || pet.display === 'desktop') {
        const where = pet.display === 'both' ? '网页 + 桌面' : pet.display === 'web' ? '网页' : '桌面';
        toast('桌宠已经在' + where + '展示了');
        return;
      }
      // 只有「完全隐藏」才重新打开；默认按桌面打开（用户明确要求默认桌面）。
      const res = await api<{ ok?: boolean; reason?: string; message?: string }>('/pet-display', {
        method: 'POST',
        body: JSON.stringify({ id: pet.id, display: 'desktop' }),
      });
      if (res.ok) toast('已展示桌宠（桌面）');
      else toast('展示失败：' + (res.message ?? res.reason ?? '未知原因'), 'err');
    } catch (error) {
      toast('展示失败：' + (error instanceof Error ? error.message : String(error)), 'err');
    }
  }

  // 鱼按钮可拖动：换位置后记住；拖动结束的那次 click 不触发展示。
  const FISH_KEY = 'dsh-pet-plus:fish-pos';
  const applyFishPos = (left: number, top: number): void => {
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.left = Math.max(4, Math.min(left, window.innerWidth - 52)) + 'px';
    root.style.top = Math.max(4, Math.min(top, window.innerHeight - 52)) + 'px';
  };
  try {
    const saved = JSON.parse(localStorage.getItem(FISH_KEY) ?? 'null') as { left?: number; top?: number } | null;
    if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) applyFishPos(saved.left as number, saved.top as number);
  } catch {
    /* 用默认位置 */
  }
  let suppressFishClick = false;
  button?.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const start = root.getBoundingClientRect();
    const sx = event.clientX;
    const sy = event.clientY;
    let moved = false;
    const move = (e: MouseEvent): void => {
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      applyFishPos(start.left + dx, start.top + dy);
    };
    const up = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) return;
      suppressFishClick = true;
      window.setTimeout(() => (suppressFishClick = false), 260);
      const final = root.getBoundingClientRect();
      try {
        localStorage.setItem(FISH_KEY, JSON.stringify({ left: final.left, top: final.top }));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    event.preventDefault();
  });
  button?.addEventListener('click', (event) => {
    if (suppressFishClick) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    void showPet();
  });
  button?.addEventListener('dblclick', () => toggle());
  const hidePanel = (): void => {
    if (panel) panel.hidden = true;
    stopTimer();
    if (renderWatchdog !== undefined) window.clearTimeout(renderWatchdog);
    renderWatchdog = undefined;
  };
  window.addEventListener('dsh-pet-plus:close-panel', hidePanel);
  // 事件委托：X 里以后加图标/子元素也不会点不到；再兜一层，防止元素级监听丢失。
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.dpp-x')) {
      event.preventDefault();
      event.stopPropagation();
      hidePanel();
      return;
    }
    if (target?.closest('.dpp-refresh')) {
      event.preventDefault();
      event.stopPropagation();
      setTab(current ?? 'settings');
    }
  });
  panel?.addEventListener('mousedown', (event) => event.stopPropagation());
  root.querySelectorAll<HTMLButtonElement>('.dpp-tab').forEach((el) => {
    el.addEventListener('click', () => {
      const tab = el.dataset.tab as Tab | undefined;
      if (tab) setTab(tab);
    });
  });

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && panel && !panel.hidden) {
      panel.hidden = true;
      stopTimer();
      const ask = document.getElementById('dsh-pet-plus-ask');
      ask?.remove();
    }
  };
  window.addEventListener('keydown', onKey, true);
  const onOpenCompanion = (): void => {
    if (!panel) return;
    if (panel.hidden) {
      toggle('settings');
      return;
    }
    // 已经开着：快捷键再按一次 = 重新加载当前 tab（卡在「加载中」时的逃生口）。
    setTab(current ?? 'settings');
  };
  window.addEventListener('dsh-pet-plus:open-companion', onOpenCompanion);

  // ---- 截图：抓一帧并复制到剪贴板；解释由 DSH 对话里的多模态模型完成 ----
  // ---- 拖拽 / 剪贴板「即问」 ----
  let askNode: HTMLDivElement | undefined;
  function closeAsk(): void {
    askNode?.remove();
    askNode = undefined;
  }

  function showAsk(text: string, at?: { x: number; y: number }): void {
    closeAsk();
    ensureStyle();
    const node = document.createElement('div');
    node.id = 'dsh-pet-plus-ask';
    const x = Math.min(Math.max(12, (at?.x ?? window.innerWidth / 2) - 170), window.innerWidth - 372);
    const y = Math.min(Math.max(12, (at?.y ?? window.innerHeight / 2) - 80), window.innerHeight - 280);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    const preview = text.trim().slice(0, 300);
    node.innerHTML =
      '<div class="dpp-ask-head"><span>问大肥鱼</span><span class="dpp-x" title="关闭">✕</span></div>' +
      `<div class="dpp-ask-text">${esc(preview)}${text.length > 300 ? '…' : ''}</div>` +
      '<div class="dpp-actions">' +
      '<button class="dpp-chip" data-kind="summary" type="button">总结</button>' +
      '<button class="dpp-chip" data-kind="translate" type="button">翻译</button>' +
      '<button class="dpp-chip" data-kind="explain" type="button">解释</button>' +
      '<button class="dpp-chip" data-kind="comment" type="button">写成评论</button>' +
      '</div><div class="dpp-ask-out" hidden></div>';
    document.body.appendChild(node);
    askNode = node;
    node.querySelector('.dpp-x')?.addEventListener('click', closeAsk);
    const out = node.querySelector<HTMLDivElement>('.dpp-ask-out');
    node.querySelectorAll<HTMLButtonElement>('.dpp-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (!out) return;
        out.hidden = false;
        out.textContent = '想一想…';
        void (async () => {
          try {
            const res = await api<{ ok?: boolean; text?: string; message?: string }>('/assist', {
              method: 'POST',
              body: JSON.stringify({ kind: chip.dataset.kind, text }),
            });
            if (!res.ok || !res.text) throw new Error(res.message ?? '没有结果');
            out.textContent = res.text;
            const actions = document.createElement('div');
            actions.className = 'dpp-actions';
            const refill = document.createElement('button');
            refill.className = 'dpp-chip';
            refill.type = 'button';
            refill.textContent = '填入输入框';
            refill.addEventListener('click', () => {
              const ok = insertIntoLatestSession(res.text as string);
              toast(ok ? '已填入输入框' : '已复制到剪贴板');
            });
            actions.appendChild(refill);
            out.appendChild(actions);
          } catch (error) {
            out.textContent = '失败：' + (error instanceof Error ? error.message : String(error));
          }
        })();
      });
    });
  }

  const isEditable = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el || !el.closest) return false;
    return Boolean(el.closest('input,textarea,[contenteditable="true"],[contenteditable=""]'));
  };

  const onDrop = (event: DragEvent): void => {
    if (isEditable(event.target)) return;
    if (!event.dataTransfer) return;
    const file = Array.from(event.dataTransfer.files ?? []).find((f) => f.type.startsWith('image/'));
    const text = event.dataTransfer.getData('text/plain');
    if (!text && !file) return;
    event.preventDefault();
    event.stopPropagation();
    if (text) showAsk(text, { x: event.clientX, y: event.clientY });
    else if (file) {
      toast('图片请直接粘贴进对话输入框，我就能看到它');
    }
  };
  const onPaste = (event: ClipboardEvent): void => {
    if (isEditable(event.target)) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (text.trim().length < 12) return;
    showAsk(text, { x: window.innerWidth / 2, y: window.innerHeight * 0.62 });
  };
  document.addEventListener('drop', onDrop, true);
  document.addEventListener('paste', onPaste, true);

  // ---- 快捷键：Mod+Alt+J 打开伴侣面板 ----
  const disposeShortcut = ctx.effect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- DSH shortcuts 服务无静态类型
    const shortcuts = (ctx as any).get?.('shortcuts') ?? (ctx as any).shortcuts;
    if (!shortcuts || typeof shortcuts.register !== 'function') return () => {};
    const binding = { code: 'KeyJ', modifiers: ['primary', 'alt'] };
    return shortcuts.register({
      id: 'dsh-pet-plus.companion',
      label: () => '大肥鱼：伴侣面板',
      aliases: ['companion', 'pet panel'],
      defaults: {
        'web:macos': binding,
        'web:windows': binding,
        'desktop:macos': binding,
        'desktop:windows': binding,
        'desktop:linux': binding,
      },
      regions: ['page'],
      modals: [],
      resolve: () => ({
        status: 'handled',
        run: () => toggle(),
      }),
    });
  }, 'dsh-pet-plus: companion shortcut');

  return () => {
    stopTimer();
    stopPomoTimer();
    disposeShortcut?.();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('dsh-pet-plus:close-panel', hidePanel);
    window.removeEventListener('dsh-pet-plus:open-companion', onOpenCompanion);
    document.removeEventListener('drop', onDrop, true);
    document.removeEventListener('paste', onPaste, true);
    closeAsk();
    root.remove();
  };
}

// ======================= tab 渲染 =======================

type Fail = (error: unknown) => void;

/** 当前主宠物 + display（三个新视图共用）。 */
async function currentPet(): Promise<PetLite | undefined> {
  const cfg = await api<{ main?: { pets?: PetLite[] } }>('/config');
  return (cfg.main?.pets ?? []).find((p) => p?.id);
}

async function renderDisplay(body: HTMLDivElement, fail: Fail): Promise<void> {
  const pet = await currentPet().catch((e) => {
    fail(e);
    return undefined;
  });
  if (!pet) return;
  const options: Array<[string, string]> = [
    ['desktop', '仅桌面'],
    ['web', '仅网页'],
    ['both', '两者'],
    ['none', '隐藏'],
  ];
  body.innerHTML =
    '<div class="dpp-dim">桌宠显示在哪里？切换后立即生效。</div>' +
    `<div class="dpp-seg">${options
      .map(
        ([value, label]) =>
          `<button type="button" data-display="${value}" class="${pet.display === value ? 'on' : ''}">${label}</button>`,
      )
      .join('')}</div>` +
    '<div class="dpp-dim" id="dpp-display-hint"></div>';
  body.querySelectorAll<HTMLButtonElement>('[data-display]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.display ?? 'desktop';
      if (value === pet.display) return;
      body.querySelectorAll('[data-display]').forEach((el) => el.classList.toggle('on', el === button));
      const hint = body.querySelector<HTMLDivElement>('#dpp-display-hint');
      if (hint) hint.textContent = '正在切换…';
      void api<{ ok?: boolean; reason?: string; message?: string }>('/pet-display', {
        method: 'POST',
        body: JSON.stringify({ id: pet.id, display: value }),
      })
        .then((res) => {
          if (!res.ok) throw new Error(res.message ?? res.reason ?? '切换失败');
          pet.display = value;
          if (hint) hint.textContent = '已切换到「' + (options.find(([v]) => v === value)?.[1] ?? value) + '」';
        })
        .catch((error) => {
          if (hint) hint.textContent = '切换失败：' + (error instanceof Error ? error.message : String(error));
        });
    });
  });
}

function renderMessage(role: 'user' | 'pet', text: string): HTMLDivElement {
  const node = document.createElement('div');
  node.className = 'dpp-msg ' + role;
  node.textContent = text;
  return node;
}

async function renderChat(body: HTMLDivElement, fail: Fail): Promise<void> {
  const pet = await currentPet().catch((e) => {
    fail(e);
    return undefined;
  });
  if (!pet) return;
  body.innerHTML =
    '<div class="dpp-chat"><div class="dpp-msgs"><div class="dpp-dim">正在读取对话…</div></div>' +
    '<div class="dpp-add"><input type="text" id="dpp-chat-input" placeholder="和桌宠说点什么…" />' +
    '<button class="dpp-primary" type="button" id="dpp-chat-send">发送</button></div></div>';
  const msgs = body.querySelector<HTMLDivElement>('.dpp-msgs');
  const input = body.querySelector<HTMLInputElement>('#dpp-chat-input');
  const sendBtn = body.querySelector<HTMLButtonElement>('#dpp-chat-send');
  if (!msgs || !input || !sendBtn) return;
  // surface 必须和 display 对齐：桌面宠物只能用 desktop，两者/网页用 web，完全隐藏则无法发送。
  const surface = pet.display === 'desktop' ? 'desktop' : 'web';
  if (pet.display === 'none') {
    msgs.innerHTML = '<div class="dpp-err">桌宠当前是「隐藏」状态，先在「显示位置」里打开再聊天。</div>';
    input.disabled = true;
    sendBtn.disabled = true;
  }
  const stick = (): void => {
    msgs.scrollTop = msgs.scrollHeight;
  };
  try {
    const history = await api<{ messages?: Array<{ role: string; content: string }> }>(
      '/chat?pet=' + encodeURIComponent(pet.id) + '&rounds=20',
    );
    msgs.innerHTML = '';
    for (const message of history.messages ?? []) {
      msgs.appendChild(renderMessage(message.role === 'user' ? 'user' : 'pet', message.content));
    }
    if ((history.messages ?? []).length === 0) {
      msgs.innerHTML = '<div class="dpp-dim">还没有对话，说第一句吧。</div>';
    }
    stick();
  } catch (error) {
    msgs.innerHTML = `<div class="dpp-err">${esc(error instanceof Error ? error.message : String(error))}</div>`;
  }
  const send = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text || sendBtn.disabled) return;
    input.value = '';
    sendBtn.disabled = true;
    msgs.appendChild(renderMessage('user', text));
    const typing = renderMessage('pet', '正在想…');
    typing.classList.add('typing');
    msgs.appendChild(typing);
    stick();
    try {
      const res = await api<{ ok?: boolean; text?: string; message?: string; reason?: string }>(
        '/chat?pet=' + encodeURIComponent(pet.id) + '&surface=' + surface,
        { method: 'POST', body: JSON.stringify({ text }) },
      );
      if (!res.ok || !res.text) throw new Error(res.message ?? res.reason ?? '生成失败');
      typing.classList.remove('typing');
      typing.textContent = res.text;
    } catch (error) {
      typing.classList.remove('typing');
      typing.textContent = '（失败：' + (error instanceof Error ? error.message : String(error)) + '）';
    } finally {
      sendBtn.disabled = false;
      stick();
      input.focus();
    }
  };
  sendBtn.addEventListener('click', () => void send());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void send();
    }
  });
}

function openDshSettings(): boolean {
  const row = document.querySelector<HTMLElement>('[class*="triggerRow"]');
  if (!row) return false;
  try {
    // triggerRow 本身是容器，真正带 onClick 的通常是里面的按钮/头像。
    const target = row.querySelector<HTMLElement>('button, [role="button"], img') ?? row;
    const pointer = { bubbles: true, button: 0, buttons: 1, pointerId: 1, isPrimary: true } as const;
    target.dispatchEvent(new PointerEvent('pointerdown', pointer));
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    target.dispatchEvent(new PointerEvent('pointerup', { ...pointer, buttons: 0 }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    target.click();
    window.setTimeout(() => {
      const items = [...document.querySelectorAll<HTMLElement>('*')].filter(
        (el) =>
          el.offsetParent !== null &&
          !el.closest('#dsh-pet-plus-companion') &&
          /^(设置|Settings)$/i.test((el.textContent || '').trim()),
      );
      // 取最内层那个（外层容器 textContent 也等于“设置”）；再按坐标点一次，
      // 兼容用 pointerdown 而不是 click 打开菜单项的实现。
      const hit = items.sort((a, b) => a.children.length - b.children.length)[0];
      if (hit) {
        const rect = hit.getBoundingClientRect();
        const at = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        (at as HTMLElement | null)?.click();
        hit.click();
        return;
      }
      // 兜底：DSH 设置快捷键（通常是 Mod+,）
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: ',', code: 'Comma', metaKey: true, ctrlKey: true, bubbles: true }),
      );
    }, 420);
    return true;
  } catch {
    return false;
  }
}

async function renderSettings(body: HTMLDivElement, fail: Fail): Promise<void> {
  const cfg = await api<{
    main?: { memory?: { enabled?: boolean }; p1?: { weather?: { city?: string } } };
  }>('/config').catch((e) => {
    fail(e);
    return undefined;
  });
  if (!cfg) return;
  const memoryOn = cfg.main?.memory?.enabled !== false;
  const city = cfg.main?.p1?.weather?.city ?? '';
  body.innerHTML =
    '<div class="dpp-dim">体验设置（完整配置在 DSH 设置 → 桌宠 / 桌宠 Plus）</div>' +
    '<label class="dpp-row" style="cursor:pointer"><span class="dpp-grow">长期记忆注入</span>' +
    '<input type="checkbox" id="dpp-set-memory" ' + (memoryOn ? 'checked' : '') + ' /></label>' +
    '<div class="dpp-add"><input type="text" id="dpp-set-city" placeholder="天气城市，例如：北京" value="' +
    esc(city) +
    '" /></div>' +
    '<div class="dpp-actions"><button class="dpp-primary" type="button" id="dpp-set-save">保存</button>' +
    '<button class="dpp-chip" type="button" id="dpp-set-open">打开 DSH 设置</button></div>' +
    '<div class="dpp-dim" id="dpp-set-msg"></div>';
  const msg = body.querySelector<HTMLDivElement>('#dpp-set-msg');
  body.querySelector('#dpp-set-save')?.addEventListener('click', () => {
    const memory = body.querySelector<HTMLInputElement>('#dpp-set-memory')?.checked ?? true;
    const cityValue = body.querySelector<HTMLInputElement>('#dpp-set-city')?.value ?? '';
    if (msg) msg.textContent = '正在保存…';
    void api<{ ok?: boolean }>('/settings/extras', {
      method: 'PUT',
      body: JSON.stringify({ memory: { enabled: memory }, p1: { weather: { city: cityValue } } }),
    })
      .then((res) => {
        if (msg) msg.textContent = res.ok ? '已保存' : '保存失败';
      })
      .catch((error) => {
        if (msg) msg.textContent = '保存失败：' + (error instanceof Error ? error.message : String(error));
      });
  });
  body.querySelector('#dpp-set-open')?.addEventListener('click', () => {
    if (!openDshSettings()) {
      if (msg) msg.textContent = '没找到设置入口，请点左下角头像 → 设置';
      return;
    }
    // 设置弹窗是 DSH 自己的模态层，面板留在上面会挡视线；打开后自动收起。
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('dsh-pet-plus:close-panel')), 500);
  });
}



async function renderTodo(body: HTMLDivElement, fail: Fail): Promise<void> {
  const data = await api<{ ok?: boolean; tasks?: TodoItem[] }>('/todo').catch((e) => {
    fail(e);
    return undefined;
  });
  if (!data) return;
  const tasks = data.tasks ?? [];
  body.innerHTML = '';
  if (tasks.length === 0) {
    body.innerHTML = '<div class="dpp-dim">还没有待办。加一条，到点我会提醒你。</div>';
  }
  const paint = (): void => {
    if (tasks.length === 0) return;
    body.innerHTML = '';
    for (const task of tasks) {
      const row = document.createElement('div');
      row.className = 'dpp-row';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = task.done;
      check.addEventListener('change', () => {
        void api(`/todo/${encodeURIComponent(task.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ done: check.checked }),
        }).then(() => void renderTodo(body, fail));
      });
      const text = document.createElement('div');
      text.className = 'dpp-grow' + (task.done ? ' dpp-done' : '');
      const due = fmtDue(task.dueAt);
      text.innerHTML =
        esc(task.text) +
        (due ? `<span class="${due.overdue ? 'dpp-over' : 'dpp-due'}">${esc(due.text)}</span>` : '');
      text.title = '双击编辑';
      const startEdit = (): void => {
        if (text.querySelector('input')) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = task.text;
        input.style.width = '100%';
        let finished = false;
        const commit = (save: boolean): void => {
          if (finished) return;
          finished = true;
          const value = input.value.trim();
          if (!save || !value || value === task.text) {
            void renderTodo(body, fail);
            return;
          }
          void api(`/todo/${encodeURIComponent(task.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ text: value }),
          }).then(() => void renderTodo(body, fail));
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') commit(true);
          if (e.key === 'Escape') commit(false);
        });
        input.addEventListener('blur', () => commit(true));
        text.replaceWith(input);
        input.focus();
        input.select();
      };
      text.addEventListener('dblclick', startEdit);
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'dpp-mini';
      edit.title = '编辑';
      edit.textContent = '✎';
      edit.addEventListener('click', startEdit);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'dpp-mini';
      del.title = '删除';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        void api(`/todo/${encodeURIComponent(task.id)}`, { method: 'DELETE' }).then(() => void renderTodo(body, fail));
      });
      row.append(check, text, edit, del);
      body.appendChild(row);
    }
  };
  paint();

  const add = document.createElement('div');
  add.className = 'dpp-add';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = '要做什么？回车添加';
  const dueInput = document.createElement('input');
  dueInput.type = 'datetime-local';
  dueInput.title = '可选：截止时间';
  dueInput.style.width = '150px';
  const submit = async (): Promise<void> => {
    const text = input.value.trim();
    if (!text) return;
    const dueAt = dueInput.value ? new Date(dueInput.value).getTime() : undefined;
    input.value = '';
    await api('/todo', { method: 'POST', body: JSON.stringify({ text, dueAt }) });
    await renderTodo(body, fail);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });
  add.append(input, dueInput);
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'dpp-primary';
  addBtn.textContent = '添加';
  addBtn.addEventListener('click', () => void submit());
  add.append(addBtn);
  body.appendChild(add);
}

async function renderWeather(body: HTMLDivElement, fail: Fail): Promise<void> {
  const [res, festival] = await Promise.all([
    api<{
      ok?: boolean;
      city?: string;
      description?: string;
      temperature?: number;
      apparent?: number;
      min?: number;
      max?: number;
      message?: string;
    }>('/weather').catch((e) => {
      fail(e);
      return undefined;
    }),
    api<{ date?: string; name?: string; note?: string; weekday?: string }>('/festival').catch(() => undefined),
  ]);
  if (!res) return;
  const day = festival
    ? `<div class="dpp-dim">${esc(festival.date ?? '')} ${esc(festival.weekday ?? '')}${
        festival.name ? ' · ' + esc(festival.name) + (festival.note ? '：' + esc(festival.note) : '') : ''
      }</div>`
    : '';
  if (!res.ok) {
    body.innerHTML = `<div class="dpp-err">${esc(res.message ?? '天气获取失败')}</div>
      <div class="dpp-dim">在设置 → 桌宠 Plus 里填一个城市名即可。</div>${day}`;
    return;
  }
  body.innerHTML =
    `<div class="dpp-card"><b>${esc(res.city ?? '')}</b> · ${esc(res.description ?? '')} ${res.temperature}°C</div>` +
    `<div class="dpp-dim">体感 ${res.apparent}°C · 今日 ${res.min}~${res.max}°C</div>` +
    day +
    '<div class="dpp-actions"><button class="dpp-chip" type="button" id="dpp-w-refresh">刷新</button></div>';
  body.querySelector('#dpp-w-refresh')?.addEventListener('click', () => void renderWeather(body, fail));
}

async function renderMusic(body: HTMLDivElement, fail: Fail): Promise<void> {
  const res = await api<{ ok?: boolean; title?: string; artist?: string; playing?: boolean; message?: string }>('/music/now').catch(
    (e) => {
      fail(e);
      return undefined;
    },
  );
  if (!res) return;
  if (!res.ok) {
    body.innerHTML = `<div class="dpp-dim">${esc(res.message ?? '没有正在播放的音乐')}</div>`;
    return;
  }
  body.innerHTML =
    `<div class="dpp-card"><b>${esc(res.title ?? '')}</b><div class="dpp-dim">${esc(res.artist ?? '')} · ${
      res.playing === false ? '已暂停' : '播放中'
    }</div></div>` + '<div class="dpp-dim">每 5 秒刷新一次</div>';
}

async function renderMemory(body: HTMLDivElement, fail: Fail): Promise<void> {
  const res = await api<{ ok?: boolean; items?: Array<{ type: string; ts: number; text: string; status?: string }> }>(
    '/memory/timeline',
  ).catch((e) => {
    fail(e);
    return undefined;
  });
  if (!res) return;
  const items = res.items ?? [];
  body.innerHTML =
    '<div class="dpp-add"><input type="text" id="dpp-mem-q" placeholder="搜索历史会话（L0）" />' +
    '<button class="dpp-primary" type="button" id="dpp-mem-go">搜索</button></div>' +
    '<div id="dpp-mem-hits"></div>' +
    (items.length === 0
      ? '<div class="dpp-dim">还没有记忆。多聊几句，我会自己记下来。</div>'
      : items
          .slice(0, 60)
          .map(
            (item) =>
              `<div class="dpp-row"><span>${item.type === 'episode' ? '·' : '★'}</span><div class="dpp-grow">${esc(
                item.text,
              )}<div class="dpp-dim">${nowHHMM(item.ts)}${item.status === 'archived' || item.status === 'forgotten' ? ' · 已淡出' : ''}</div></div></div>`,
          )
          .join(''));
  const q = body.querySelector<HTMLInputElement>('#dpp-mem-q');
  const hits = body.querySelector<HTMLDivElement>('#dpp-mem-hits');
  const search = async (): Promise<void> => {
    if (!hits) return;
    const value = q?.value.trim() ?? '';
    if (!value) return;
    hits.innerHTML = '<div class="dpp-dim">回忆中…</div>';
    try {
      const r = await api<{ ok?: boolean; hits?: Array<{ sessionId: string; time: number; snippet: string }>; message?: string }>(
        '/memory/sessions?q=' + encodeURIComponent(value) + '&limit=5',
      );
      if (!r.ok) throw new Error(r.message ?? '会话检索不可用');
      const list = r.hits ?? [];
      hits.innerHTML = list.length
        ? list
            .map(
              (hit) =>
                `<div class="dpp-card"><b>${nowHHMM(hit.time)}</b><div>${esc(hit.snippet)}</div><div class="dpp-dim">${esc(hit.sessionId)}</div></div>`,
            )
            .join('')
        : '<div class="dpp-dim">没有找到相关会话。</div>';
    } catch (error) {
      hits.innerHTML = `<div class="dpp-err">${esc(error instanceof Error ? error.message : String(error))}</div>`;
    }
  };
  body.querySelector('#dpp-mem-go')?.addEventListener('click', () => void search());
  q?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void search();
  });
}

async function renderQuick(body: HTMLDivElement, fail: Fail): Promise<void> {
  const res = await api<{ ok?: boolean; items?: Array<{ id: string; label: string; type: string }> }>('/quick-launch').catch((e) => {
    fail(e);
    return undefined;
  });
  if (!res) return;
  const items = res.items ?? [];
  if (items.length === 0) {
    body.innerHTML = '<div class="dpp-dim">在设置里添加常用 App 或网址，就能从这里一键打开。</div>';
    return;
  }
  body.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'dpp-row';
    const label = document.createElement('div');
    label.className = 'dpp-grow';
    label.textContent = item.label;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'dpp-chip';
    open.textContent = '打开';
    open.addEventListener('click', () => {
      void api('/quick-launch/open', { method: 'POST', body: JSON.stringify({ id: item.id }) }).then((r) => {
        const result = r as { ok?: boolean; message?: string };
        toast(result.ok ? '已打开 ' + item.label : result.message ?? '打开失败', result.ok ? 'ok' : 'err');
      });
    });
    row.append(label, open);
    body.appendChild(row);
  }
}

async function renderContent(body: HTMLDivElement, fail: Fail): Promise<void> {
  body.innerHTML =
    '<div class="dpp-dim">粘贴一条抖音/小红书链接，我读完给你摘要、要点和 3 条评论候选。</div>' +
    '<div class="dpp-add"><input type="text" id="dpp-link" placeholder="https://..." /><button class="dpp-primary" type="button" id="dpp-digest">读一下</button></div>' +
    '<div id="dpp-digest-out"></div>' +
    '<div class="dpp-dim" id="dpp-auto"></div>';
  const out = body.querySelector<HTMLDivElement>('#dpp-digest-out');
  const link = body.querySelector<HTMLInputElement>('#dpp-link');
  const digest = async (): Promise<void> => {
    const value = link?.value.trim() ?? '';
    if (!value || !out) return;
    out.innerHTML = '<div class="dpp-dim">正在读…</div>';
    try {
      const res = await api<{
        ok?: boolean;
        reason?: string;
        message?: string;
        result?: { summary: string; points: string[]; comments: Array<{ tone: string; text: string }>; risk?: string };
      }>('/content/digest', { method: 'POST', body: JSON.stringify({ link: value }) });
      if (!res.ok || !res.result) throw new Error(res.message ?? res.reason ?? '生成失败');
      const r = res.result;
      out.innerHTML =
        `<div class="dpp-card"><b>摘要</b><div>${esc(r.summary)}</div>` +
        `<div style="margin-top:8px"><b>要点</b><ol>${r.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></div>` +
        `<div><b>评论候选</b>${r.comments
          .map((c) => `<div style="margin-top:4px">[${esc(c.tone)}] ${esc(c.text)}</div>`)
          .join('')}</div>` +
        (r.risk ? `<div class="dpp-err">${esc(r.risk)}</div>` : '') +
        '</div>';
      const actions = document.createElement('div');
      actions.className = 'dpp-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'dpp-chip';
      copy.textContent = '复制摘要';
      copy.addEventListener('click', () => {
        void navigator.clipboard?.writeText(`${r.summary}\n${r.points.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
        toast('已复制');
      });
      actions.appendChild(copy);
      out.appendChild(actions);
    } catch (error) {
      out.innerHTML = `<div class="dpp-err">${esc(error instanceof Error ? error.message : String(error))}</div>`;
    }
  };
  body.querySelector('#dpp-digest')?.addEventListener('click', () => void digest());
  link?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void digest();
  });
  try {
    const status = await api<Record<string, unknown>>('/content/status');
    const auto = body.querySelector('#dpp-auto');
    if (auto) auto.textContent = '自动模式：' + JSON.stringify(status.status ?? {});
  } catch {
    /* 状态拿不到不影响手动 digest */
  }
}

async function renderSpeak(body: HTMLDivElement, fail: Fail): Promise<void> {
  body.innerHTML =
    '<div class="dpp-dim">用系统语音把一段话读出来（需要在设置里启用 TTS）。</div>' +
    '<textarea id="dpp-speak" placeholder="要读的内容…"></textarea>' +
    '<div class="dpp-actions"><button class="dpp-primary" type="button" id="dpp-speak-go">朗读</button></div>';
  body.querySelector('#dpp-speak-go')?.addEventListener('click', () => {
    const text = body.querySelector<HTMLTextAreaElement>('#dpp-speak')?.value ?? '';
    void api<{ ok?: boolean; message?: string }>('/tts', { method: 'POST', body: JSON.stringify({ text }) })
      .then((res) => toast(res.ok ? '开始朗读' : res.message ?? 'TTS 未启用', res.ok ? 'ok' : 'err'))
      .catch((e) => fail(e));
  });
}
