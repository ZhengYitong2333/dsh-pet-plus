/**
 * 灵动岛（P2）：页面顶部的常驻胶囊，把桌宠的「现在」压成一行。
 *
 *  - 收起：工作状态点 + 当前时间 + 最近待办倒计时；
 *  - 悬停展开：工作文案、天气、正在播放、记忆条数、打开伴侣面板；
 *  - 默认关闭（p2.island.enabled=false），开启后才挂载；
 *  - 只读 /state 与 /todo，不触发模型，不写任何状态。
 */
import type { Context } from '@deepseek-ai/cordis';

const ID = 'dsh-pet-plus-island';
const STYLE_ID = 'dsh-pet-plus/island.css';

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  dueAt?: number;
}

const STATE_LABEL: Record<string, string> = {
  thinking: '思考中',
  working: '工作中',
  result: '整理结果',
  waiting: '等你确认',
  success: '完成',
  error: '出错了',
};

function css(): string {
  return `
#${ID}{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483001;
  font-family:var(--dsh-pet-font-family,'PingFang SC','Microsoft YaHei',sans-serif);color:#e2e8f0}
#${ID} .isl{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:999px;
  background:rgba(17,20,28,.9);border:1px solid rgba(148,163,184,.22);box-shadow:0 8px 28px rgba(0,0,0,.28);
  backdrop-filter:blur(12px);font-size:12px;cursor:default;transition:border-color .15s ease}
#${ID} .isl:hover{border-color:rgba(129,140,248,.5)}
#${ID} .dot{width:7px;height:7px;border-radius:50%;background:#64748b;flex:none}
#${ID} .dot.working,#${ID} .dot.thinking{background:#60a5fa;animation:islPulse 1.4s infinite}
#${ID} .dot.waiting{background:#fbbf24}
#${ID} .dot.success{background:#4ade80}
#${ID} .dot.error{background:#f87171}
@keyframes islPulse{0%,100%{opacity:1}50%{opacity:.35}}
#${ID} .time{font-variant-numeric:tabular-nums;color:#cbd5e1}
#${ID} .sep{width:1px;height:12px;background:rgba(148,163,184,.25)}
#${ID} .due{color:#fbbf24;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${ID} .due.over{color:#f87171}
#${ID} .more{display:none;flex-direction:column;gap:6px;position:absolute;top:36px;left:50%;transform:translateX(-50%);
  width:min(340px,86vw);padding:12px;border-radius:14px;background:rgba(20,24,34,.98);
  border:1px solid rgba(129,140,248,.3);box-shadow:0 18px 60px rgba(0,0,0,.5);backdrop-filter:blur(16px);font-size:12px}
#${ID} .isl:hover+.more,#${ID} .more:hover{display:flex}
#${ID} .more .row{display:flex;justify-content:space-between;gap:10px;line-height:1.45}
#${ID} .more .k{color:#94a3b8;flex:none}
#${ID} .more .v{text-align:right;word-break:break-word}
#${ID} .more .act{margin-top:4px;padding:6px 10px;border-radius:8px;border:1px solid rgba(129,140,248,.5);
  background:rgba(79,70,229,.35);color:#eef2ff;cursor:pointer;font-size:12px}
#${ID} .more .act:hover{background:rgba(79,70,229,.55)}
`;
}

function ensureStyle(): void {
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return;
  const style = document.createElement('style');
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function nextTodo(tasks: TodoItem[]): TodoItem | undefined {
  const list = tasks.filter((t) => !t.done && t.dueAt && Number.isFinite(t.dueAt));
  list.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
  return list[0];
}

function dueText(dueAt: number): string {
  const diff = dueAt - Date.now();
  const mins = Math.round(Math.abs(diff) / 60000);
  const span = mins < 60 ? `${mins} 分钟` : mins < 1440 ? `${Math.round(mins / 60)} 小时` : `${Math.round(mins / 1440)} 天`;
  return diff >= 0 ? `还有 ${span}` : `超时 ${span}`;
}

export function installIsland(ctx: Context): () => void {
  let root: HTMLDivElement | undefined;
  let timer: number | undefined;
  let enabled = false;
  let disposeOpen: (() => void) | undefined;

  const readConf = async (): Promise<void> => {
    try {
      const cfg = (await fetch('/dsh-pet-plus/config').then((r) => r.json())) as {
        main?: { p2?: { island?: { enabled?: boolean } } };
      };
      const want = cfg.main?.p2?.island?.enabled === true;
      if (want === enabled) return;
      enabled = want;
      if (!want) {
        root?.remove();
        root = undefined;
        disposeOpen?.();
        disposeOpen = undefined;
        return;
      }
      ensureStyle();
      root = document.createElement('div');
      root.id = ID;
      root.innerHTML =
        '<div class="isl"><span class="dot"></span><span class="time"></span>' +
        '<span class="sep"></span><span class="due">还没有待办</span></div>' +
        '<div class="more"></div>';
      document.body.appendChild(root);
      const open = root.querySelector<HTMLButtonElement>('.more .act');
      open?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('dsh-pet-plus:open-companion'));
      });
      void refresh();
    } catch {
      /* 配置拿不到就维持现状 */
    }
  };

  const refresh = async (): Promise<void> => {
    if (!root) return;
    const time = root.querySelector('.time');
    const dot = root.querySelector('.dot');
    const due = root.querySelector('.due');
    const more = root.querySelector('.more');
    if (!time || !dot || !due || !more) return;
    const now = new Date();
    time.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    try {
      const state = (await fetch('/dsh-pet-plus/state').then((r) => r.json())) as {
        sections?: { workStatus?: { data?: { state?: string; task?: string | null } } };
      };
      const work = state.sections?.workStatus?.data;
      const status = work?.state ?? '';
      dot.className = 'dot ' + status;
      const detail = STATE_LABEL[status] ?? '待机';
      const [todos, music, stats] = await Promise.all([
        fetch('/dsh-pet-plus/todo').then((r) => r.json()).catch(() => ({ tasks: [] })),
        fetch('/dsh-pet-plus/music/now').then((r) => r.json()).catch(() => ({ ok: false })),
        fetch('/dsh-pet-plus/memory/stats').then((r) => r.json()).catch(() => ({})),
      ]);
      const tasks = ((todos as { tasks?: TodoItem[] }).tasks ?? []).filter((t) => !t.done);
      const next = nextTodo(tasks);
      due.textContent = next?.dueAt ? `${next.text} · ${dueText(next.dueAt)}` : tasks.length ? `待办 ${tasks.length}` : '今天没事';
      due.classList.toggle('over', Boolean(next?.dueAt && next.dueAt < Date.now()));
      more.innerHTML =
        `<div class="row"><span class="k">状态</span><span class="v">${detail}${work?.task ? ' · ' + work.task : ''}</span></div>` +
        `<div class="row"><span class="k">待办</span><span class="v">${tasks.length ? `${tasks.length} 条` : '无'}</span></div>` +
        `<div class="row"><span class="k">音乐</span><span class="v">${(music as { ok?: boolean; title?: string }).ok ? (music as { title?: string }).title ?? '播放中' : '未在播放'}</span></div>` +
        `<div class="row"><span class="k">记忆</span><span class="v">${Number((stats as { profile?: { active?: number } }).profile?.active ?? 0)} 条画像</span></div>` +
        '<button class="act" type="button">打开伴侣面板</button>';
    } catch {
      /* 单次失败不影响下一轮 */
    }
  };

  // 每 15 秒刷新内容；每 60 秒重读配置，开关即时生效（不必刷新页面）
  const start = (): void => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = window.setInterval(() => void refresh(), 15_000);
  };
  const confTimer = window.setInterval(() => void readConf(), 60_000);
  void readConf().then(start);

  return () => {
    if (timer !== undefined) window.clearInterval(timer);
    window.clearInterval(confTimer);
    root?.remove();
    disposeOpen?.();
  };
}
