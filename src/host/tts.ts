/** macOS say 朗读（按需触发，默认关）。 */
import { spawn } from 'node:child_process';

export function speak(text: string, options: { voice?: string; rate?: number } = {}): { ok: boolean; message?: string } {
  if (process.platform !== 'darwin') return { ok: false, message: 'TTS 目前仅支持 macOS' };
  const clean = String(text ?? '').trim().slice(0, 800);
  if (!clean) return { ok: false, message: '文本为空' };
  const args: string[] = [];
  if (options.voice) args.push('-v', options.voice);
  const rate = Number(options.rate);
  if (Number.isFinite(rate) && rate >= 80 && rate <= 400) args.push('-r', String(Math.floor(rate)));
  args.push(clean);
  const child = spawn('say', args, { stdio: 'ignore', detached: true });
  child.unref();
  return { ok: true };
}
