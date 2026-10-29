/** macOS Now Playing（Music / Spotify / nowplaying-cli），缓存 3 秒。 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
let cache: { at: number; data: MusicState } | undefined;

export interface MusicState {
  ok: boolean;
  title?: string;
  artist?: string;
  album?: string;
  playing?: boolean;
  message?: string;
}

async function osascript(script: string): Promise<string> {
  const { stdout } = await run('osascript', ['-e', script], { timeout: 3000 });
  return stdout.trim();
}

export async function nowPlaying(): Promise<MusicState> {
  if (cache && Date.now() - cache.at < 3000) return cache.data;
  try {
    const music = await osascript(
      'tell application "System Events" to (name of processes) contains "Music"',
    ).catch(() => 'false');
    if (music === 'true') {
      const title = await osascript('tell application "Music" to if it is running then get name of current track').catch(() => '');
      const artist = await osascript('tell application "Music" to if it is running then get artist of current track').catch(() => '');
      const state = await osascript('tell application "Music" to if it is running then get player state as text').catch(() => '');
      if (title) {
        const data: MusicState = { ok: true, title, artist, playing: /playing/i.test(state) };
        cache = { at: Date.now(), data };
        return data;
      }
    }
    const spotify = await osascript(
      'tell application "System Events" to (name of processes) contains "Spotify"',
    ).catch(() => 'false');
    if (spotify === 'true') {
      const title = await osascript('tell application "Spotify" to if it is running then get name of current track').catch(() => '');
      const artist = await osascript('tell application "Spotify" to if it is running then get artist of current track').catch(() => '');
      if (title) {
        const data: MusicState = { ok: true, title, artist };
        cache = { at: Date.now(), data };
        return data;
      }
    }
    const data: MusicState = { ok: false, message: '没有正在播放的音乐' };
    cache = { at: Date.now(), data };
    return data;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
