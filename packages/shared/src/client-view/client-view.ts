import { z } from 'zod';
import { ProjectStatus, TaskStatus } from '../schemas/enums.ts';

/**
 * Read-only client view: what a client sees at `/p/<token>`. Built on the server from a
 * fixed allowlist of fields (title, status, dates). Never notes, time, money, task
 * notes or anything about other projects.
 */

export const SHARE_TOKEN = /^[a-f0-9]{32}$/;

export function isShareToken(value: unknown): value is string {
  return typeof value === 'string' && SHARE_TOKEN.test(value);
}

/** 16 random bytes → 32 hex chars. The caller supplies a CSPRNG (expo-crypto, WebCrypto). */
export function shareTokenFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 16) throw new Error('A share token needs 16 random bytes');
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function shareUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/p/${token}`;
}

/** Completed work stays visible this long, so the client sees recent progress. */
export const DONE_VISIBLE_DAYS = 30;
export const MAX_VIEW_TASKS = 100;

export const ClientViewTask = z.object({
  title: z.string(),
  status: TaskStatus,
  due_date: z.string().nullable(),
});

export const ClientView = z.object({
  project: z.object({
    title: z.string(),
    status: ProjectStatus,
    due_date: z.string().nullable(),
  }),
  client_name: z.string().nullable(),
  /** The freelancer's display name (or workspace name). */
  from: z.string().nullable(),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  tasks: z.array(ClientViewTask),
  updated_at: z.string(),
});
export type ClientView = z.infer<typeof ClientView>;

export interface ViewTaskRow {
  id: string;
  title: string;
  status: z.infer<typeof TaskStatus>;
  due_date: string | null;
  parent_task_id: string | null;
  completed_at: string | null;
  updated_at: string;
}

const RANK = { doing: 0, todo: 1, done: 2 } as const;

/** Visible tasks: top-level, not hidden, done ones only if recent; open first by due date. */
export function visibleTasks(
  tasks: readonly ViewTaskRow[],
  hidden: readonly string[],
  now: Date,
): ViewTaskRow[] {
  const hide = new Set(hidden);
  const cutoff = new Date(now.getTime() - DONE_VISIBLE_DAYS * 86_400_000).toISOString();
  return tasks
    .filter((t) => t.parent_task_id == null && !hide.has(t.id))
    .filter((t) => t.status !== 'done' || (t.completed_at ?? t.updated_at) >= cutoff)
    .sort(
      (a, b) =>
        RANK[a.status] - RANK[b.status] ||
        (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
        a.title.localeCompare(b.title),
    )
    .slice(0, MAX_VIEW_TASKS);
}

export function buildClientView(args: {
  project: { title: string; status: z.infer<typeof ProjectStatus>; due_date: string | null };
  clientName: string | null;
  from: string | null;
  tasks: readonly ViewTaskRow[];
  hiddenTaskIds: readonly string[];
  now?: Date;
}): ClientView {
  const now = args.now ?? new Date();
  const shown = visibleTasks(args.tasks, args.hiddenTaskIds, now);
  const latest = [...args.tasks]
    .map((t) => t.updated_at)
    .sort()
    .at(-1);
  return {
    project: {
      title: args.project.title,
      status: args.project.status,
      due_date: args.project.due_date,
    },
    client_name: args.clientName,
    from: args.from,
    progress: {
      done: shown.filter((t) => t.status === 'done').length,
      total: shown.length,
    },
    tasks: shown.map((t) => ({ title: t.title, status: t.status, due_date: t.due_date })),
    updated_at: latest ?? now.toISOString(),
  };
}
