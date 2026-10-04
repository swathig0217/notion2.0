import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TaskInsert,
  addDays,
  positionsAfter,
  todayInTimeZone,
  type ChecklistItem,
  type TaskUpdate,
  type Tables,
} from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useTrack } from '@/lib/analytics';
import { useTimeZone, useWorkspaceId } from '@/features/auth/useMe';

export type Task = Tables<'tasks'>;

/** Completed tasks older than this are not loaded into the local cache. */
const DONE_WINDOW_DAYS = 30;

export const byPosition = (a: Task, b: Task) => a.position - b.position;

export function useTasks() {
  return useQuery({
    queryKey: keys.tasks,
    queryFn: async () => {
      const since = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .or(`status.neq.done,completed_at.gte.${since}`)
        .order('position');
      if (error) throw error;
      return data;
    },
  });
}

export function useTask(id: string | undefined) {
  const { data, ...rest } = useTasks();
  return { ...rest, data: data?.find((t) => t.id === id) };
}

export function useSubtasks(parentId: string | undefined) {
  const { data } = useTasks();
  return (data ?? []).filter((t) => t.parent_task_id === parentId).sort(byPosition);
}

function buildRow(input: Omit<TaskInsert, 'id' | 'workspace_id'>, workspaceId: string): Task {
  const parsed = TaskInsert.parse({ id: newId(), workspace_id: workspaceId, ...input });
  const now = new Date().toISOString();
  return {
    project_id: null,
    client_id: null,
    parent_task_id: null,
    notes: null,
    due_date: null,
    ai_action_id: null,
    ...parsed,
    created_at: now,
    updated_at: now,
    completed_at: parsed.status === 'done' ? now : null,
  };
}

function lastPosition(tasks: Task[] | undefined, parentId: string | null): number | null {
  const siblings = (tasks ?? []).filter((t) => t.parent_task_id === parentId);
  return siblings.length ? Math.max(...siblings.map((t) => t.position)) : null;
}

export function useCreateTask() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (input: Omit<TaskInsert, 'id' | 'workspace_id' | 'position'>): Task | null => {
      if (!workspaceId) return null;
      const tasks = qc.getQueryData<Task[]>(keys.tasks);
      const [position] = positionsAfter(lastPosition(tasks, input.parent_task_id ?? null), 1);
      const row = buildRow({ ...input, position: position ?? 1024 }, workspaceId);
      updateList<Task>(qc, keys.tasks, (rows) => [...rows, row]);
      write({ op: 'insert', table: 'tasks', rows: [row] });
      track('task_created', { subtask: row.parent_task_id != null });
      return row;
    },
    [qc, write, track, workspaceId],
  );
}

/** Bulk-creates subtasks (one request) — the checklist fast path for Smart Paste. */
export function useCreateSubtasks() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (parent: Task, items: readonly ChecklistItem[]): Task[] => {
      if (!workspaceId || items.length === 0) return [];
      const tasks = qc.getQueryData<Task[]>(keys.tasks);
      const positions = positionsAfter(lastPosition(tasks, parent.id), items.length);
      const rows = items.map((item, i) =>
        buildRow(
          {
            title: item.title,
            status: item.checked ? 'done' : 'todo',
            parent_task_id: parent.id,
            client_id: parent.client_id,
            project_id: parent.project_id,
            position: positions[i] ?? 0,
          },
          workspaceId,
        ),
      );
      updateList<Task>(qc, keys.tasks, (existing) => [...existing, ...rows]);
      write({ op: 'insert', table: 'tasks', rows });
      return rows;
    },
    [qc, write, workspaceId],
  );
}

export function useUpdateTask() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string, patch: TaskUpdate) => {
      const next: TaskUpdate = { ...patch };
      if (patch.status !== undefined) {
        next.completed_at = patch.status === 'done' ? new Date().toISOString() : null;
      }
      updateList<Task>(qc, keys.tasks, (rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...next } : r)),
      );
      write({ op: 'update', table: 'tasks', id, patch: next });
    },
    [qc, write],
  );
}

export function useToggleTask() {
  const update = useUpdateTask();
  const track = useTrack();
  return useCallback(
    (task: Task) => {
      const done = task.status !== 'done';
      update(task.id, { status: done ? 'done' : 'todo' });
      if (done) {
        haptics.success();
        track('task_completed', { subtask: task.parent_task_id != null, source: task.source });
      }
    },
    [update, track],
  );
}

export function useSnoozeTask() {
  const update = useUpdateTask();
  const timeZone = useTimeZone();
  return useCallback(
    (task: Task) => {
      const tomorrow = addDays(todayInTimeZone(timeZone), 1);
      update(task.id, { due_date: tomorrow });
      haptics.tap();
      toast.show('Moved to tomorrow', {
        label: 'Undo',
        onPress: () => update(task.id, { due_date: task.due_date }),
      });
    },
    [update, timeZone],
  );
}

/** Deletes a task and its subtasks, with an Undo toast that restores them exactly. */
export function useDeleteTask() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string) => {
      const all = qc.getQueryData<Task[]>(keys.tasks) ?? [];
      const removedIds = new Set([id]);
      // Collect descendants (subtasks cascade on the server).
      let grew = true;
      while (grew) {
        grew = false;
        for (const t of all) {
          if (t.parent_task_id && removedIds.has(t.parent_task_id) && !removedIds.has(t.id)) {
            removedIds.add(t.id);
            grew = true;
          }
        }
      }
      const removed = all.filter((t) => removedIds.has(t.id));
      updateList<Task>(qc, keys.tasks, (rows) => rows.filter((r) => !removedIds.has(r.id)));
      write({ op: 'delete', table: 'tasks', ids: [id] });
      haptics.tap();
      toast.show(
        removed.length > 1 ? `Deleted task and ${removed.length - 1} subtasks` : 'Task deleted',
        {
          label: 'Undo',
          onPress: () => {
            updateList<Task>(qc, keys.tasks, (rows) => [...rows, ...removed]);
            // Parents first so subtasks' foreign keys resolve.
            const ordered = [...removed].sort(
              (a, b) => Number(a.parent_task_id != null) - Number(b.parent_task_id != null),
            );
            write({ op: 'insert', table: 'tasks', rows: ordered });
          },
        },
      );
    },
    [qc, write],
  );
}
