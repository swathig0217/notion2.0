import { useMemo } from 'react';
import type { Task } from './api';

/** parent id -> { done, total } for rendering "2/5" on task rows. */
export function useSubtaskProgress(tasks: readonly Task[] | undefined) {
  return useMemo(() => {
    const map = new Map<string, { done: number; total: number }>();
    for (const t of tasks ?? []) {
      if (!t.parent_task_id) continue;
      const p = map.get(t.parent_task_id) ?? { done: 0, total: 0 };
      p.total += 1;
      if (t.status === 'done') p.done += 1;
      map.set(t.parent_task_id, p);
    }
    return map;
  }, [tasks]);
}
