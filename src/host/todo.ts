/** 待办：本地 JSON，原子写；路由与桌宠气泡共用。 */
import { randomBytes } from 'node:crypto';
import { readJsonFile, writeJsonAtomic, withFileLock } from './memory/store.ts';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  dueAt?: number;
}

interface TodoState {
  version: 1;
  tasks: TodoItem[];
}

function empty(): TodoState {
  return { version: 1, tasks: [] };
}

export class TodoStore {
  private readonly file: string;
  private readonly clock: () => Date;

  constructor(file: string, clock: () => Date = () => new Date()) {
    this.file = file;
    this.clock = clock;
  }

  private load(): TodoState {
    const read = readJsonFile<TodoState>(this.file, empty());
    if (!read.ok || !read.value) throw new Error(read.error ?? 'todo 读取失败');
    return { version: 1, tasks: Array.isArray(read.value.tasks) ? read.value.tasks : [] };
  }

  list(): TodoItem[] {
    return this.load().tasks.sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt - b.createdAt);
  }

  async add(text: string, dueAt?: number): Promise<TodoItem | undefined> {
    const clean = String(text ?? '').trim().slice(0, 200);
    if (!clean) return undefined;
    return withFileLock(this.file, () => {
      const state = this.load();
      const item: TodoItem = {
        id: 't_' + randomBytes(4).toString('hex'),
        text: clean,
        done: false,
        createdAt: this.clock().getTime(),
        ...(Number.isFinite(dueAt) ? { dueAt: Number(dueAt) } : {}),
      };
      state.tasks.push(item);
      writeJsonAtomic(this.file, state);
      return item;
    });
  }

  async update(id: string, patch: { text?: string; done?: boolean; dueAt?: number }): Promise<TodoItem | undefined> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const item = state.tasks.find((t) => t.id === id);
      if (!item) return undefined;
      if (typeof patch.text === 'string' && patch.text.trim()) item.text = patch.text.trim().slice(0, 200);
      if (typeof patch.done === 'boolean') item.done = patch.done;
      if (Number.isFinite(patch.dueAt)) item.dueAt = Number(patch.dueAt);
      writeJsonAtomic(this.file, state);
      return item;
    });
  }

  async remove(id: string): Promise<boolean> {
    return withFileLock(this.file, () => {
      const state = this.load();
      const before = state.tasks.length;
      state.tasks = state.tasks.filter((t) => t.id !== id);
      if (state.tasks.length === before) return false;
      writeJsonAtomic(this.file, state);
      return true;
    });
  }
}
