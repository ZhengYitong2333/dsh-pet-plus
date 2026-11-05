/**
 * 客户端构建热更新：轮询宿主 /build 的 lib/client.js 指纹，变化时自动刷新页面。
 *
 * 为什么不是 HMR：本插件以 link 方式装进 profile，DSH 的 HMR 只覆盖它自己的开发树；
 * 一个 8s 的轻量轮询足以做到「改完 build，页面自己刷新」，不用反复重启 DSH。
 * 只在页面可见且用户没在输入框里时刷新，避免打断打字。
 */
const REV_KEY = 'dsh-pet-plus:client-rev';

export function installAutoReload(intervalMs = 8000): () => void {
  if (typeof window === 'undefined') return () => {};
  let timer: number | undefined;
  let stopped = false;

  const busy = (): boolean => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return Boolean(el.closest('input,textarea,[contenteditable="true"],[contenteditable=""]'));
  };

  const check = async (): Promise<void> => {
    if (stopped || document.hidden) return;
    try {
      const res = await fetch('/dsh-pet-plus/build', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const data = (await res.json()) as { rev?: string };
      const rev = typeof data.rev === 'string' ? data.rev : '';
      if (!rev || rev === '0:0') return;
      const saved = sessionStorage.getItem(REV_KEY);
      if (!saved) {
        sessionStorage.setItem(REV_KEY, rev);
        return;
      }
      if (saved === rev) return;
      // 正在输入就下次再说，绝不把半句话刷掉
      if (busy()) return;
      sessionStorage.setItem(REV_KEY, rev);
      console.info('[dsh-pet-plus] client build changed, reloading…');
      window.location.reload();
    } catch {
      /* 网络抖动/服务重启：下一轮再试 */
    }
  };

  void check();
  timer = window.setInterval(() => void check(), Math.max(3000, intervalMs));
  return () => {
    stopped = true;
    if (timer !== undefined) window.clearInterval(timer);
  };
}
