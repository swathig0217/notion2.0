import { useMemo } from 'react';
import { View } from 'react-native';
import { entriesForClient, formatDuration, totalMinutes } from '@notion2/shared';
import { Icon, Text } from '@/components/ui';
import { useTasks } from '@/features/tasks/api';
import { useProjects } from '@/features/projects/api';
import { useTimeEntries } from './api';

/** "Time logged: 6h 30m · 4h this month" for a client or project. */
export function TimeTotal({ clientId, projectId }: { clientId?: string; projectId?: string }) {
  const entries = useTimeEntries().data;
  const tasks = useTasks().data;
  const projects = useProjects().data;

  const scoped = useMemo(() => {
    const all = entries ?? [];
    if (projectId) {
      const taskIds = new Set(
        (tasks ?? []).filter((t) => t.project_id === projectId).map((t) => t.id),
      );
      return all.filter(
        (e) => e.project_id === projectId || (e.task_id != null && taskIds.has(e.task_id)),
      );
    }
    if (clientId) {
      return entriesForClient(
        all,
        clientId,
        new Map((tasks ?? []).map((t) => [t.id, t.client_id])),
        new Map((projects ?? []).map((p) => [p.id, p.client_id])),
      );
    }
    return [];
  }, [entries, tasks, projects, clientId, projectId]);

  if (scoped.length === 0) return null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const all = totalMinutes(scoped);
  const month = totalMinutes(scoped, new Date(), monthStart.toISOString());
  return (
    <View
      className="flex-row items-center gap-2"
      accessibilityLabel={`Time logged ${formatDuration(all.minutes)}`}
    >
      <Icon name="clock" size={14} />
      <Text variant="caption">
        Time logged: {formatDuration(all.minutes)}
        {month.minutes !== all.minutes ? ` · ${formatDuration(month.minutes)} this month` : ''}
      </Text>
    </View>
  );
}
