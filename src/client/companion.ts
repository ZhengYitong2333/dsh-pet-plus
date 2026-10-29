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

type Tab = 'todo' | 'weather' | 'music' | 'memory' | 'quick' | 'content' | 'speak';

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  dueAt?: number;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'todo', label: '待办' },
  { id: 'weather', label: '天气' },
  { id: 'music', label: '音乐' },
  { id: 'memory', label: '记忆' },
  { id: 'quick', label: '快捷' },
  { id: 'content', label: '内容' },
  { id: 'speak', label: '朗读' },
];

function css(): string {
  return `
#${ROOT_ID}{position:fixed;right:18px;bottom:96px;z-index:2147483002;
  font-family:var(--dsh-pet-font-family,'PingFang SC','Microsoft YaHei',sans-serif);color:#e2e8f0;font-size:13px}
#${ROOT_ID} .dpp-btn{width:44px;height:44px;border-radius:50%;border:1px solid rgba(129,140,248,.35);
  background:rgba(24,28,38,.92);color:#c7d2fe;font-size:20px;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.35);
  backdrop-filter:blur(10px);transition:transform .15s ease,background .15s ease}
#${ROOT_ID} .dpp-btn:hover{transform:translateY(-2px);background:rgba(49,46,129,.92)}
#${ROOT_ID} .dpp-panel{position:absolute;right:0;bottom:54px;width:min(380px,86vw);max-height:min(560px,72vh);
  display:flex;flex-direction:column;background:rgba(20,24,34,.97);border:1px solid rgba(129,140,248,.28);
  border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.5);backdrop-filter:blur(16px);overflow:hidden}
#${ROOT_ID} .dpp-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 6px}
#${ROOT_ID} .dpp-title{font-size:12px;letter-spacing:.4px;color:#a5b4fc}
#${ROOT_ID} .dpp-x{cursor:pointer;color:#94a3b8;padding:2px 6px;border-radius:6px}
#${ROOT_ID} .dpp-x:hover{background:rgba(148,163,184,.15);color:#fff}
#${ROOT_ID} .dpp-tabs{display:flex;gap:4px;padding:0 8px 8px;flex-wrap:wrap}
#${ROOT_ID} .dpp-tab{padding:4px 9px;border-radius:999px;border:1px solid transparent;background:transparent;
  color:#94a3b8;cursor:pointer;font-size:12px}
#${ROOT_ID} .dpp-tab:hover{color:#e2e8f0;background:rgba(148,163,184,.12)}
#${ROOT_ID} .dpp-tab.on{color:#fff;background:rgba(79,70,229,.35);border-color:rgba(129,140,248,.5)}
#${ROOT_ID} .dpp-body{padding:4px 12px 12px;overflow:auto;flex:1;min-height:120px}
#${ROOT_ID} .dpp-row{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border-bottom:1px solid rgba(148,163,184,.12)}
#${ROOT_ID} .dpp-row:last-child{border-bottom:0}
#${ROOT_ID} .dpp-grow{flex:1;min-width:0;word-break:break-word;line-height:1.45}
#${ROOT_ID} .dpp-dim{color:#94a3b8;font-size:12px}
#${ROOT_ID} .dpp-due{color:#fbbf24;font-size:11px;margin-left:4px}
#${ROOT_ID} .dpp-over{color:#f87171;font-size:11px;margin-left:4px}
#${ROOT_ID} .dpp-done{text-decoration:line-through;opacity:.45}
#${ROOT_ID} .dpp-mini{border:0;background:transparent;color:#64748b;cursor:pointer;font-size:14px;padding:0 2px}
#${ROOT_ID} .dpp-mini:hover{color:#f87171}
#${ROOT_ID} input[type=text],#${ROOT_ID} input[type=datetime-local],#${ROOT_ID} textarea{width:100%;box-sizing:border-box;
  padding:7px 9px;border-radius:8px;border:1px solid rgba(148,163,184,.25);background:rgba(15,23,42,.9);
  color:#e2e8f0;font-size:12px;font-family:inherit}
#${ROOT_ID} textarea{resize:vertical;min-height:64px}
#${ROOT_ID} .dpp-add{display:flex;gap:6px;margin-top:8px}
#${ROOT_ID} .dpp-add input[type=text]{flex:1}
#${ROOT_ID} .dpp-primary{padding:6px 12px;border-radius:8px;border:1px solid rgba(129,140,248,.5);
  background:rgba(79,70,229,.4);color:#eef2ff;cursor:pointer;font-size:12px;white-space:nowrap}
#${ROOT_ID} .dpp-primary:hover{background:rgba(79,70,229,.6)}
#${ROOT_ID} .dpp-primary:disabled{opacity:.5;cursor:default}
#${ROOT_ID} .dpp-card{padding:10px;border-radius:10px;background:rgba(30,41,59,.65);
  border:1px solid rgba(148,163,184,.16);margin:6px 0}
#${ROOT_ID} .dpp-card b{color:#c7d2fe}
#${ROOT_ID} .dpp-actions{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
#${ROOT_ID} .dpp-chip{padding:5px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.3);
  background:rgba(30,41,59,.8);color:#cbd5e1;cursor:pointer;font-size:12px}
#${ROOT_ID} .dpp-chip:hover{border-color:rgba(129,140,248,.7);color:#fff}
#${ROOT_ID} .dpp-err{color:#fca5a5;font-size:12px;margin:6px 0}
#${ROOT_ID} .dpp-ok{color:#86efac;font-size:12px;margin:6px 0}
#dsh-pet-plus-ask{position:fixed;z-index:2147483003;width:min(360px,84vw);padding:12px;border-radius:14px;
  background:rgba(20,24,34,.98);border:1px solid rgba(129,140,248,.35);box-shadow:0 18px 60px rgba(0,0,0,.5);
  color:#e2e8f0;font-family:var(--dsh-pet-font-family,'PingFang SC',sans-serif);font-size:12px;backdrop-filter:blur(14px)}
#dsh-pet-plus-ask .dpp-ask-head{display:flex;justify-content:space-between;align-items:center;color:#a5b4fc;margin-bottom:8px}
#dsh-pet-plus-ask .dpp-ask-text{max-height:76px;overflow:auto;color:#94a3b8;line-height:1.45;margin-bottom:8px;white-space:pre-wrap;word-break:break-word}
#dsh-pet-plus-ask .dpp-ask-out{margin-top:8px;padding:9px;border-radius:8px;background:rgba(30,41,59,.75);line-height:1.55;white-space:pre-wrap;word-break:break-word}
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/dsh-pet-plus' + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const raw = (await res.json().catch(() => null)) as T | null;
  if (raw === null) throw new Error('服务没有返回 JSON');
  return raw;
}


/** 把图片和一句提示直接“粘贴”进 DSH 当前输入框；找不到输入框返回 false。 */
function pasteScreenshotIntoComposer(blob: Blob): boolean {
  try {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [contenteditable=""]'),
    ).filter((el) => !el.closest(`#${ROOT_ID}`) && el.getClientRects().length > 0);
    const target = candidates[candidates.length - 1];
    if (!target) return false;
    target.focus();
    const data = new DataTransfer();
    data.setData('text/plain', '解释这张截图');
    data.items.add(new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' }));
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
    target.dispatchEvent(event);
    return true;
  } catch {
    return false;
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
  root.innerHTML =
    '<button class="dpp-btn" type="button" title="伴侣面板（Mod+Alt+J）">✦</button>' +
    '<button class="dpp-btn dpp-cam" type="button" title="截图并复制，粘贴到对话里让我看" style="margin-right:6px;font-size:16px">📷</button>' +
    '<div class="dpp-panel" hidden>' +
    '<div class="dpp-head"><span class="dpp-title">大肥鱼 · 伴侣面板</span><span class="dpp-x" title="关闭 (Esc)">✕</span></div>' +
    '<div class="dpp-tabs">' +
    TABS.map((t) => `<button class="dpp-tab" data-tab="${t.id}" type="button">${t.label}</button>`).join('') +
    '</div><div class="dpp-body"><div class="dpp-dim">加载中…</div></div></div>';
  document.body.appendChild(root);

  const panel = root.querySelector<HTMLDivElement>('.dpp-panel');
  const body = root.querySelector<HTMLDivElement>('.dpp-body');
  const button = root.querySelector<HTMLButtonElement>('.dpp-btn');
  let current: Tab | undefined;
  let timer: number | undefined;

  const stopTimer = (): void => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };

  const setTab = (tab: Tab): void => {
    current = tab;
    stopTimer();
    root.querySelectorAll<HTMLButtonElement>('.dpp-tab').forEach((el) => {
      el.classList.toggle('on', el.dataset.tab === tab);
    });
    if (!body) return;
    body.innerHTML = '<div class="dpp-dim">加载中…</div>';
    const fail = (error: unknown): void => {
      if (!body) return;
      body.innerHTML = `<div class="dpp-err">${esc(error instanceof Error ? error.message : String(error))}</div>`;
    };
    if (tab === 'todo') void renderTodo(body, fail);
    if (tab === 'weather') void renderWeather(body, fail);
    if (tab === 'music') {
      void renderMusic(body, fail);
      timer = window.setInterval(() => void renderMusic(body, fail), 5000);
    }
    if (tab === 'memory') void renderMemory(body, fail);
    if (tab === 'quick') void renderQuick(body, fail);
    if (tab === 'content') void renderContent(body, fail);
    if (tab === 'speak') void renderSpeak(body, fail);
  };

  const toggle = (tab: Tab = current ?? 'todo'): void => {
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) setTab(tab);
    else stopTimer();
  };

  button?.addEventListener('click', () => toggle());
  root.querySelector<HTMLButtonElement>('.dpp-cam')?.addEventListener('click', () => void captureScreenshot());
  root.querySelector('.dpp-x')?.addEventListener('click', () => {
    if (panel) panel.hidden = true;
    stopTimer();
  });
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

  // ---- 截图：抓一帧并复制到剪贴板；解释由 DSH 对话里的多模态模型完成 ----
  async function captureScreenshot(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => window.setTimeout(r, 220));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      track.stop();
      stream.getTracks().forEach((t) => t.stop());
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
      if (!blob) throw new Error('截图编码失败');
      // 先复制，保证失败时还有退路
      if (navigator.clipboard && 'write' in navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      }
      // 再尝试直接粘进 DSH 输入框：DSH 自己会把图片交给多模态模型，等于一键“截图解释”。
      if (pasteScreenshotIntoComposer(blob)) {
        toast('截图已放进输入框，按回车我就开始看图解释。');
        return;
      }
      toast('截图已复制。在对话输入框粘贴并回车，我就能看图解释。');
    } catch (error) {
      toast('截图失败：' + (error instanceof Error ? error.message : String(error)), 'err');
    }
  }

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
        'web:linux': binding,
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
    disposeShortcut?.();
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('drop', onDrop, true);
    document.removeEventListener('paste', onPaste, true);
    closeAsk();
    root.remove();
  };
}

// ======================= tab 渲染 =======================

type Fail = (error: unknown) => void;

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
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'dpp-mini';
      del.title = '删除';
      del.textContent = '✕';
      del.addEventListener('click', () => {
        void api(`/todo/${encodeURIComponent(task.id)}`, { method: 'DELETE' }).then(() => void renderTodo(body, fail));
      });
      row.append(check, text, del);
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
  const res = await api<{
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
  });
  if (!res) return;
  if (!res.ok) {
    body.innerHTML = `<div class="dpp-err">${esc(res.message ?? '天气获取失败')}</div>
      <div class="dpp-dim">在设置 → 桌宠 Plus 里填一个城市名即可。</div>`;
    return;
  }
  body.innerHTML =
    `<div class="dpp-card"><b>${esc(res.city ?? '')}</b> · ${esc(res.description ?? '')} ${res.temperature}°C</div>` +
    `<div class="dpp-dim">体感 ${res.apparent}°C · 今日 ${res.min}~${res.max}°C</div>` +
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
  if (items.length === 0) {
    body.innerHTML = '<div class="dpp-dim">还没有记忆。多聊几句，我会自己记下来。</div>';
    return;
  }
  body.innerHTML = items
    .slice(0, 60)
    .map(
      (item) =>
        `<div class="dpp-row"><span>${item.type === 'episode' ? '·' : '★'}</span><div class="dpp-grow">${esc(
          item.text,
        )}<div class="dpp-dim">${nowHHMM(item.ts)}${item.status === 'archived' || item.status === 'forgotten' ? ' · 已淡出' : ''}</div></div></div>`,
    )
    .join('');
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
