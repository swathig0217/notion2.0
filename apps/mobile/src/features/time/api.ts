import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { manualFields, runningEntry, stopFields, type Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useWorkspaceId } from '@/features/auth/useMe';
import type { Task } from '@/features/tasks/api';

export type TimeEntry = Tables<'time_entries'>;

/** Entries loaded locally: the last 90 days plus any running timer. */
const WINDOW_DAYS = 90;

export function useTimeEntries() {
  return useQuery({
    queryKey: keys.time,
    queryFn: async () => {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .or(`started_at.gte.${since},ended_at.is.null`)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useRunningEntry(): TimeEntry | undefined {
  const { data } = useTimeEntries();
  return useMemo(() => runningEntry(data ?? []), [data]);
}

function useStopRunning() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(() => {
    const running = runningEntry(qc.getQueryData<TimeEntry[]>(keys.time) ?? []);
    if (!running) return null;
    const patch = stopFields(running);
    updateList<TimeEntry>(qc, keys.time, (rows) =>
      rows.map((r) => (r.id === running.id ? { ...r, ...patch } : r)),
    );
    write({ op: 'update', table: 'time_entries', id: running.id, patch });
    return { ...running, ...patch };
  }, [qc, write]);
}

/** Starts a timer on a task; any running timer is stopped first (one at a time). */
export function useStartTimer() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const stop = useStopRunning();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (task: Pick<Task, 'id' | 'project_id'>) => {
      if (!workspaceId) return;
      stop();
      const now = new Date().toISOString();
      const row: TimeEntry = {
        id: newId(),
        workspace_id: workspaceId,
        task_id: task.id,
        project_id: task.project_id,
        started_at: now,
        ended_at: null,
        minutes: null,
        billable: true,
        invoice_id: null,
        created_at: now,
        updated_at: now,
      };
      updateList<TimeEntry>(qc, keys.time, (rows) => [row, ...rows]);
      write({ op: 'insert', table: 'time_entries', rows: [row] });
      haptics.tap();
    },
    [qc, write, stop, workspaceId],
  );
}

export function useStopTimer() {
  const stop = useStopRunning();
  return useCallback(() => {
    const stopped = stop();
    if (stopped) haptics.success();
    return stopped;
  }, [stop]);
}

export function useAddManualEntry() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (task: Pick<Task, 'id' | 'project_id'>, minutes: number, billable: boolean) => {
      if (!workspaceId) return;
      const now = new Date().toISOString();
      const row: TimeEntry = {
        id: newId(),
        workspace_id: workspaceId,
        task_id: task.id,
        project_id: task.project_id,
        billable,
        invoice_id: null,
        created_at: now,
        updated_at: now,
        ...manualFields(minutes),
      };
      updateList<TimeEntry>(qc, keys.time, (rows) => [row, ...rows]);
      write({ op: 'insert', table: 'time_entries', rows: [row] });
    },
    [qc, write, workspaceId],
  );
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (entry: TimeEntry) => {
      updateList<TimeEntry>(qc, keys.time, (rows) => rows.filter((r) => r.id !== entry.id));
      write({ op: 'delete', table: 'time_entries', ids: [entry.id] });
      toast.show('Time entry deleted', {
        label: 'Undo',
        onPress: () => {
          updateList<TimeEntry>(qc, keys.time, (rows) => [entry, ...rows]);
          write({ op: 'insert', table: 'time_entries', rows: [entry] });
        },
      });
    },
    [qc, write],
  );
}
