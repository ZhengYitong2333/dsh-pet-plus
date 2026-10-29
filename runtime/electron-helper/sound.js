// 桌面 helper 的点击音效：与浏览器端同一套音源/音量/最小间隔。
// 由 index.html 在 constants.js 之后、sprite.js 之前加载（需要全局 BASE）。
(function () {
  'use strict';
  let ctx;
  const buffers = new Map();
  let cache;
  let last = 0;

  function cfgOf(raw) {
    const pack = (raw && raw.clickSoundPack) || {};
    return {
      enabled: !raw || raw.clickSoundEnabled !== false,
      pack: {
        kind: typeof pack.kind === 'string' ? pack.kind : 'builtin',
        id: typeof pack.id === 'string' ? pack.id : 'default',
      },
      volume: Math.max(0, Math.min(1, Number((raw && raw.clickSoundVolume) ?? 0.7))),
      minIntervalMs: Math.max(0, Number((raw && raw.clickSoundMinIntervalMs) ?? 80)),
    };
  }

  async function config() {
    if (cache && Date.now() - cache.at < 60000) return cache.cfg;
    try {
      const raw = await fetch(BASE + '/config', { cache: 'no-store' }).then((r) => r.json());
      const cfg = cfgOf(raw);
      cache = { at: Date.now(), cfg };
      return cfg;
    } catch {
      return cfgOf({});
    }
  }

  function urlOf(pack) {
    if (pack.kind === 'builtin' && pack.id === 'duck') {
      return BASE + '/sound/duck/' + (Math.random() < 0.5 ? 'Ya1.mp3' : 'Ya2.mp3');
    }
    return BASE + '/sound/default/click.wav';
  }

  async function play(url, volume) {
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    let buf = buffers.get(url);
    if (!buf) {
      const res = await fetch(url);
      if (!res.ok) return;
      buf = await ctx.decodeAudioData(await res.arrayBuffer());
      buffers.set(url, buf);
    }
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  window.PetSound = {
    async playClick() {
      try {
        const cfg = await config();
        if (!cfg.enabled) return;
        const now = Date.now();
        if (now - last < cfg.minIntervalMs) return;
        last = now;
        await play(urlOf(cfg.pack), cfg.volume);
      } catch {
        /* 静默 */
      }
    },
  };
})();
