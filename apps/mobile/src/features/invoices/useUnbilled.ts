import { useMemo } from 'react';
import { totalMinutes, unbilledEntries } from '@notion2/shared';
import { useProjects } from '@/features/projects/api';
import { useTasks } from '@/features/tasks/api';
import { useTimeEntries } from '@/features/time/api';

/** Billable, uninvoiced time for a client (from the locally loaded 90 days). */
export function useUnbilled(clientId: string | undefined) {
  const entries = useTimeEntries().data;
  const tasks = useTasks().data;
  const projects = useProjects().data;
  return useMemo(() => {
    if (!clientId) return { entries: [], minutes: 0, tasks: tasks ?? [], projects: projects ?? [] };
    const list = unbilledEntries(entries ?? [], clientId, tasks ?? [], projects ?? []);
    return {
      entries: list,
      minutes: totalMinutes(list).minutes,
      tasks: tasks ?? [],
      projects: projects ?? [],
    };
  }, [entries, tasks, projects, clientId]);
}
