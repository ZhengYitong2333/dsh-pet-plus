/**
 * 记忆文件的原子读写与跨进程锁。
 *
 * 纪律（沿用 dsh-pet 的存储约定）：
 *  - 写临时文件 + fsync + rename，绝不原地写；
 *  - 读失败 ≠ 空数据：调用方拿到 error 时必须放弃本次写；
 *  - 损坏文件先备份 `<file>.bak-<ts>` 再返回空态，绝不静默丢失；
 *  - 同一个文件用 `<file>.lock` 做跨进程互斥，持锁超过 30s 视为陈旧锁。
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname } from 'node:path';

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 300;

export class MemoryLockError extends Error {
  constructor(file: string) {
    super('memory lock busy: ' + file);
    this.name = 'MemoryLockError';
  }
}

function sleepSync(ms: number): void {
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

/** 原子写文本；失败时清理临时文件并抛出。 */
export function writeTextAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  let fd: number | undefined;
  try {
    fd = openSync(tmp, 'w');
    writeSync(fd, text);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, file);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/** 原子写 JSON（2 空格缩进，末尾换行）。 */
export function writeJsonAtomic(file: string, value: unknown): void {
  writeTextAtomic(file, JSON.stringify(value, null, 2) + '\n');
}

export interface JsonReadResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  backup?: string;
}

/**
 * 读 JSON：不存在 → ok + fallback；损坏 → 备份 + ok + fallback（并标记 backup）；
 * 其它 IO 失败 → ok=false（调用方必须放弃写）。
 */
export function readJsonFile<T>(file: string, fallback: T): JsonReadResult<T> {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, value: fallback };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  try {
    const parsed = JSON.parse(raw) as T;
    if (parsed === null || typeof parsed !== 'object') throw new Error('not an object');
    return { ok: true, value: parsed };
  } catch (error) {
    const backup = `${file}.bak-${Date.now()}`;
    try {
      renameSync(file, backup);
    } catch {
      /* 备份失败不阻断：至少返回空态 */
    }
    return {
      ok: true,
      value: fallback,
      backup,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** 读文本；不存在返回空串，其它错误抛出（调用方区分“没有”与“读不到”）。 */
export function readTextFile(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

/** 同一文件的进程内串行队列（避免同进程两处同时进入跨进程锁）。 */
const queues = new Map<string, Promise<void>>();

async function acquireFileLock(file: string): Promise<() => void> {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx');
      writeSync(fd, String(process.pid) + '\n' + String(Date.now()) + '\n');
      closeSync(fd);
      return () => {
        try {
          unlinkSync(lock);
        } catch {
          /* ignore */
        }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const st = statSync(lock);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          unlinkSync(lock);
          continue;
        }
      } catch {
        /* 锁刚被释放，重试 */
      }
      if (Date.now() >= deadline) throw new MemoryLockError(file);
      sleepSync(20);
    }
  }
}

/**
 * 在进程内队列 + 跨进程锁里执行一段同步读改写。
 * 拿不到锁时抛 MemoryLockError；调用方应放弃本次修改（绝不无锁写）。
 */
export async function withFileLock<T>(file: string, fn: () => T | Promise<T>): Promise<T> {
  const previous = queues.get(file) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  queues.set(file, tail);
  await previous;
  const unlock = await acquireFileLock(file);
  try {
    return await fn();
  } finally {
    unlock();
    release();
    if (queues.get(file) === tail) queues.delete(file);
  }
}

/** 同步版本：调用方已在同步路径（如 prompt 拼装）且只读时使用。 */
export function withFileLockSync<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx');
      writeSync(fd, String(process.pid) + '\n' + String(Date.now()) + '\n');
      closeSync(fd);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const st = statSync(lock);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          unlinkSync(lock);
          continue;
        }
      } catch {
        /* retry */
      }
      if (Date.now() >= deadline) throw new MemoryLockError(file);
      sleepSync(20);
    }
  }
  try {
    return fn();
  } finally {
    try {
      unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
}

/** 备份任意文件（破坏性操作前调用）。返回备份路径；源文件不存在返回 undefined。 */
export function backupFile(file: string, backupsDir: string): string | undefined {
  if (!existsSync(file)) return undefined;
  mkdirSync(backupsDir, { recursive: true });
  const target = `${backupsDir}/${basename(file)}.bak-${Date.now()}`;
  try {
    writeFileSync(target, readFileSync(file));
    return target;
  } catch {
    return undefined;
  }
}
