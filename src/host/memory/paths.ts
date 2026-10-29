/** 记忆子系统在用户数据根下的固定路径。 */
import { join } from 'node:path';

export interface MemoryPaths {
  root: string;
  instructions: string;
  profile: string;
  episodes: string;
  budget: string;
  metrics: string;
  tracesDir: string;
  backupsDir: string;
  soundsDir: string;
}

export function memoryPaths(root: string): MemoryPaths {
  return {
    root,
    instructions: join(root, 'instructions.md'),
    profile: join(root, 'profile.json'),
    episodes: join(root, 'episodes.jsonl'),
    budget: join(root, 'budget.json'),
    metrics: join(root, 'metrics.json'),
    tracesDir: join(root, 'traces'),
    backupsDir: join(root, 'backups'),
    soundsDir: join(root, 'sounds'),
  };
}
