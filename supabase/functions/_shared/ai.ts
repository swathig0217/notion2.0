import type { ModelCall, WorkspaceContext } from '../../../packages/shared/src/ai/index.ts';
import { mockModel } from '../../../packages/shared/src/ai/index.ts';
import { isValidTimeZone, todayInTimeZone } from '../../../packages/shared/src/dates/dates.ts';
import { Usage, aiActionsLeft } from '../../../packages/shared/src/plans/plans.ts';
import { createClaudeCall } from './claude.ts';
import type { Db } from './supabase.ts';

const HOURLY_LIMIT = Number(Deno.env.get('AI_HOURLY_LIMIT') ?? 30);

/** Loads a versioned prompt shipped with the function (see config.toml static_files). */
export async function loadPrompt(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(`./prompts/${name}.md`, import.meta.url));
}

export function isMock(): boolean {
  return Deno.env.get('AI_MOCK') === '1';
}

export function modelCall(opts: { timeoutMs: number; maxRetries: number }): ModelCall | null {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return null;
  return createClaudeCall({
    apiKey,
    model: Deno.env.get('ANTHROPIC_MODEL') ?? undefined,
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
  });
}

export { mockModel };

/**
 * Free plan: monthly AI action limit (see `workspace_usage()` in the Phase 4 migration).
 * Fails open if usage can't be read, so a billing hiccup never blocks paying users.
 */
export async function overPlanLimit(db: Db, workspaceId: string): Promise<boolean> {
  const { data, error } = await db.rpc('workspace_usage', { ws: workspaceId });
  if (error || !data) return false;
  const usage = Usage.safeParse(data);
  if (!usage.success) return false;
  return aiActionsLeft(usage.data) === 0;
}

/** Per-workspace hourly cap on AI actions. */
export async function overRateLimit(db: Db, workspaceId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await db
    .from('ai_actions')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .gte('created_at', since);
  if (error) throw error;
  return (count ?? 0) >= HOURLY_LIMIT;
}

export async function loadTimeZone(db: Db, userId: string): Promise<string> {
  const { data } = await db.from('profiles').select('timezone').eq('id', userId).single();
  const tz = data?.timezone ?? 'UTC';
  return isValidTimeZone(tz) ? tz : 'UTC';
}

/** Names and ids the model can link to. No notes or task bodies are sent. */
export async function loadWorkspaceContext(
  db: Db,
  workspaceId: string,
  timeZone: string,
): Promise<WorkspaceContext> {
  const [clients, projects, tasks] = await Promise.all([
    db
      .from('clients')
      .select('id, name, email, status')
      .eq('workspace_id', workspaceId)
      .neq('status', 'archived')
      .order('name')
      .limit(100),
    db
      .from('projects')
      .select('id, title, client_id')
      .eq('workspace_id', workspaceId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(100),
    db
      .from('tasks')
      .select('title, client_id, due_date')
      .eq('workspace_id', workspaceId)
      .neq('status', 'done')
      .is('parent_task_id', null)
      .order('created_at', { ascending: false })
      .limit(40),
  ]);
  for (const r of [clients, projects, tasks]) if (r.error) throw r.error;
  return {
    today: todayInTimeZone(timeZone),
    timezone: timeZone,
    clients: clients.data ?? [],
    projects: projects.data ?? [],
    recent_tasks: tasks.data ?? [],
  };
}
