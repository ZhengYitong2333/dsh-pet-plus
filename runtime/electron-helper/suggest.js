// 全局热键三候选小窗：只负责展示、复制、关闭。
// 候选由宠物窗口拉到宿主 /suggest 后经 petBridge.showSuggest → 主进程 IPC 推来。
'use strict';

(function () {
  const bridge = window.petBridge;
  const list = document.getElementById('list');
  const close = document.getElementById('close');
  let options = [];

  function closeSelf() {
    if (bridge && bridge.closeSuggest) bridge.closeSuggest();
    else window.close();
  }

  function pick(text) {
    if (bridge && bridge.copyText) bridge.copyText(text);
    closeSelf();
  }

  function render(items) {
    options = Array.isArray(items) ? items.filter((x) => typeof x === 'string' && x.trim()).slice(0, 3) : [];
    list.textContent = '';
    if (options.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = '这次没想出来，再按一次试试。';
      list.appendChild(empty);
      return;
    }
    options.forEach((text, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      const badge = document.createElement('b');
      badge.textContent = String(index + 1);
      const body = document.createElement('span');
      body.textContent = text;
      button.append(badge, body);
      button.addEventListener('click', () => pick(text));
      list.appendChild(button);
    });
  }

  const demo = new URLSearchParams(location.search).has('demo');
  if (demo) {
    render([
      '帮我把今天的会议纪要整理成三点',
      '根据我最近在做的记忆模块，列一个回归测试清单',
      '用更轻松的语气给团队发个进度更新',
    ]);
  } else if (bridge && bridge.onSuggestData) {
    bridge.onSuggestData(render);
  }
  if (close) close.addEventListener('click', closeSelf);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSelf();
      return;
    }
    const index = Number(event.key);
    if (index >= 1 && index <= options.length) {
      event.preventDefault();
      pick(options[index - 1]);
    }
  });
})();
