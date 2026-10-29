/** 记忆子系统门面：拼装路径、指令层、预算，并给 host 一个 render/stats 入口。 */
import type { BudgetSnapshot, InstructionSnapshot, MemorySettings } from './types';
import { memoryPaths, type MemoryPaths } from './paths.ts';
import { memorySettingsOf } from './settings.ts';
import { InstructionsStore } from './instructions.ts';
import { BudgetStore } from './budget.ts';
import { renderMemoryBlock } from './render.ts';
import { ProfileStore } from './profile.ts';
import { existsSync } from 'node:fs';

export interface MemoryService {
  paths: MemoryPaths;
  instructions: InstructionsStore;
  profile: ProfileStore;
  budget: BudgetStore;
  settings(conf: Record<string, unknown>): MemorySettings;
  /** 生成注入段；关闭/空记忆返回空串。 */
  render(conf: Record<string, unknown>): string;
  stats(conf: Record<string, unknown>): {
    instructions: { version: number; chars: number; exists: boolean };
    budget: BudgetSnapshot;
    files: { profile: boolean; episodes: boolean };
    profile: { active: number; archived: number; tombstoned: number };
  };
}

export function createMemoryService(
  userRoot: string,
  clock: () => Date = () => new Date(),
): MemoryService {
  const paths = memoryPaths(userRoot);
  const instructions = new InstructionsStore(paths.instructions, paths.backupsDir, clock);
  const profile = new ProfileStore(paths.profile, paths.backupsDir, clock);
  const budget = new BudgetStore(paths.budget, clock);

  return {
    paths,
    instructions,
    profile,
    budget,
    settings: memorySettingsOf,
    render(conf) {
      const settings = memorySettingsOf(conf);
      return renderMemoryBlock({
        settings,
        instructions: instructions.read().text,
        l2Index: profile.renderIndex(settings.l2IndexChars),
      });
    },
    stats(conf) {
      const settings = memorySettingsOf(conf);
      const snap: InstructionSnapshot = instructions.read();
      return {
        instructions: {
          version: snap.version,
          chars: Array.from(snap.text).length,
          exists: instructions.exists(),
        },
        budget: budget.snapshot({ calls: settings.dailyCalls, tokens: settings.dailyTokens }),
        files: {
          profile: existsSync(paths.profile),
          episodes: existsSync(paths.episodes),
        },
        profile: profile.count(),
      };
    },
  };
}
