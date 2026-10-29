/**
 * 点击音效（浏览器半侧）：Web Audio 预加载 + 音量 + 最小间隔。
 * 音源由 host `/sound/<pack>/<file>` 提供；失败静默，绝不用系统提示音替代。
 */
interface SoundConfig {
  enabled: boolean;
  pack: { kind: string; id?: string; path?: string };
  volume: number;
  minIntervalMs: number;
}

let cache: { at: number; cfg: SoundConfig } | undefined;
let audio: AudioContext | undefined;
const buffers = new Map<string, AudioBuffer>();
let lastPlay = 0;

function cfgOf(raw: Record<string, unknown>): SoundConfig {
  const pack = (raw.clickSoundPack ?? {}) as Record<string, unknown>;
  return {
    enabled: raw.clickSoundEnabled !== false,
    pack: {
      kind: typeof pack.kind === 'string' ? pack.kind : 'builtin',
      id: typeof pack.id === 'string' ? pack.id : 'default',
      path: typeof pack.path === 'string' ? pack.path : '',
    },
    volume: Math.max(0, Math.min(1, Number(raw.clickSoundVolume ?? 0.7))),
    minIntervalMs: Math.max(0, Number(raw.clickSoundMinIntervalMs ?? 80)),
  };
}

async function config(): Promise<SoundConfig> {
  if (cache && Date.now() - cache.at < 60_000) return cache.cfg;
  const raw = (await fetch('/dsh-pet-plus/config', { cache: 'no-store' }).then((r) => r.json())) as Record<
    string,
    unknown
  >;
  const cfg = cfgOf(raw);
  cache = { at: Date.now(), cfg };
  return cfg;
}

function sourceUrl(pack: SoundConfig['pack']): string {
  if (pack.kind === 'builtin' && pack.id === 'duck') {
    return '/dsh-pet-plus/sound/duck/' + (Math.random() < 0.5 ? 'Ya1.mp3' : 'Ya2.mp3');
  }
  return '/dsh-pet-plus/sound/default/click.wav';
}

async function play(url: string, volume: number): Promise<void> {
  audio ??= new AudioContext();
  if (audio.state === 'suspended') await audio.resume();
  let buffer = buffers.get(url);
  if (!buffer) {
    const res = await fetch(url);
    if (!res.ok) return;
    buffer = await audio.decodeAudioData(await res.arrayBuffer());
    buffers.set(url, buffer);
  }
  const source = audio.createBufferSource();
  const gain = audio.createGain();
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(gain).connect(audio.destination);
  source.start();
}

export async function playClickSound(): Promise<void> {
  try {
    const cfg = await config();
    if (!cfg.enabled) return;
    const now = Date.now();
    if (now - lastPlay < cfg.minIntervalMs) return;
    lastPlay = now;
    await play(sourceUrl(cfg.pack), cfg.volume);
  } catch {
    /* 静默降级 */
  }
}
