import {
  buildDraftContext,
  type DraftContext,
  type DraftKind,
} from '../../../packages/shared/src/ai/index.ts';
import { todayInTimeZone } from '../../../packages/shared/src/dates/dates.ts';
import { totalMinutes } from '../../../packages/shared/src/time/time.ts';
import type { Db } from './supabase.ts';

const WINDOW_DAYS = 14;

/** Loads (via RLS) everything the writer may mention for one client or project. */
export async function loadDraftContext(
  db: Db,
  args: { userId: string; clientId: string; projectId: string | null; kind: DraftKind },
): Promise<{ context: DraftContext; workspaceId: string } | null> {
  const [{ data: client }, { data: profile }] = await Promise.all([
    db
      .from('clients')
      .select('id, workspace_id, name, email, last_contacted_at')
      .eq('id', args.clientId)
      .maybeSingle(),
    db.from('profiles').select('display_name, tone, timezone').eq('id', args.userId).maybeSingle(),
  ]);
  if (!client) return null;
  const project = args.projectId
    ? (
        await db
          .from('projects')
          .select('id, title, due_date, client_id')
          .eq('id', args.projectId)
          .maybeSingle()
      ).data
    : null;
  if (args.projectId && (!project || project.client_id !== client.id)) return null;

  const timeZone = profile?.timezone ?? 'UTC';
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();
  // News = since the last contact, but never older than the window.
  const since =
    client.last_contacted_at && client.last_contacted_at > windowStart
      ? client.last_contacted_at
      : windowStart;

  let taskQuery = db
    .from('tasks')
    .select('id, title, status, due_date, completed_at, parent_task_id')
    .or(`status.neq.done,completed_at.gte.${windowStart}`)
    .limit(200);
  taskQuery = project
    ? taskQuery.eq('project_id', project.id)
    : taskQuery.eq('client_id', client.id);
  let noteQuery = db
    .from('notes')
    .select('title, content_text')
    .order('updated_at', { ascending: false })
    .limit(5);
  noteQuery = project
    ? noteQuery.eq('project_id', project.id)
    : noteQuery.eq('client_id', client.id);
  const [tasks, notes] = await Promise.all([taskQuery, noteQuery]);
  if (tasks.error) throw tasks.error;
  if (notes.error) throw notes.error;

  const taskIds = (tasks.data ?? []).map((t) => t.id);
  const entries = taskIds.length
    ? ((await db.from('time_entries').select('*').in('task_id', taskIds).gte('started_at', since))
        .data ?? [])
    : [];

  return {
    workspaceId: client.workspace_id,
    context: buildDraftContext({
      today: todayInTimeZone(timeZone),
      senderName: profile?.display_name ?? null,
      tone: profile?.tone ?? null,
      client,
      project: project ? { title: project.title, due_date: project.due_date } : null,
      tasks: tasks.data ?? [],
      notes: notes.data ?? [],
      minutesLogged: totalMinutes(entries).minutes,
      since,
    }),
  };
}
