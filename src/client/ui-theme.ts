/**
 * 插件 UI 的统一视觉层：圆角、磨砂、半透明、统一尺寸。
 *
 * 只注入 CSS 变量与少量工具类，前缀 --dpp- / .dpp-，不与 DSH 主题变量冲突。
 * 面板/设置页/快捷键弹层共用同一套变量，避免各写一份颜色。
 */
const STYLE_ID = 'dsh-pet-plus/ui-theme';

export const THEME_CSS = `
:root{
  --dpp-radius-lg:20px;
  --dpp-radius-md:14px;
  --dpp-radius-sm:10px;
  --dpp-radius-pill:999px;
  --dpp-glass:rgba(22,27,38,.72);
  --dpp-glass-strong:rgba(18,22,31,.86);
  --dpp-glass-soft:rgba(255,255,255,.055);
  --dpp-border:rgba(148,163,184,.20);
  --dpp-border-strong:rgba(148,163,184,.32);
  --dpp-text:#e8edf7;
  --dpp-muted:#9aa7bd;
  --dpp-accent:#8b95ff;
  --dpp-accent-soft:rgba(99,102,241,.28);
  --dpp-shadow:0 24px 70px rgba(0,0,0,.48),0 2px 8px rgba(0,0,0,.28);
  --dpp-blur:blur(20px) saturate(140%);
  --dpp-control-h:34px;
}
.dpp-glass{
  background:linear-gradient(160deg,var(--dpp-glass-strong),var(--dpp-glass));
  border:1px solid var(--dpp-border);
  box-shadow:var(--dpp-shadow);
  backdrop-filter:var(--dpp-blur);
  -webkit-backdrop-filter:var(--dpp-blur);
}
.dpp-control{
  height:var(--dpp-control-h);
  border-radius:var(--dpp-radius-sm);
  border:1px solid var(--dpp-border);
  background:rgba(15,20,30,.42);
  color:var(--dpp-text);
  font-size:12px;
  padding:0 10px;
  outline:none;
}
.dpp-control:focus{border-color:var(--dpp-accent);box-shadow:0 0 0 3px rgba(139,149,255,.15)}
.dpp-button{
  height:var(--dpp-control-h);
  padding:0 14px;
  border-radius:var(--dpp-radius-sm);
  border:1px solid var(--dpp-border);
  background:var(--dpp-glass-soft);
  color:var(--dpp-text);
  font-size:12px;
  cursor:pointer;
  transition:background .16s ease,border-color .16s ease,transform .16s ease;
}
.dpp-button:hover{background:rgba(255,255,255,.10);border-color:var(--dpp-border-strong)}
.dpp-button:active{transform:translateY(1px)}
.dpp-button--primary{
  background:linear-gradient(180deg,rgba(99,102,241,.55),rgba(79,70,229,.42));
  border-color:rgba(139,149,255,.55);
}
`;

export function installTheme(): void {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`)) return;
  const style = document.createElement('style');
  style.dataset.pluginCss = STYLE_ID;
  style.textContent = THEME_CSS;
  document.head.appendChild(style);
}
