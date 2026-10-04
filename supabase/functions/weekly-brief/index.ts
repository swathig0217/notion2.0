// Weekly Brief: returns this week's brief (generating it on the first request of the
// week, or when `force` is set). Read-only for the workspace: it never changes data.
import {
  StoredBrief,
  WeeklyBrief,
  WeeklyBriefRequest,
  buildBriefData,
  fallbackBrief,
  renderBriefMessage,
  runStructured,
  sanitizeBrief,
  weekStart,
} from '../../../packages/shared/src/ai/index.ts';
import { todayInTimeZone } from '../../../packages/shared/src/dates/dates.ts';
import { corsHeaders, error, json, logMetrics } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';
import {
  isMock,
  loadPrompt,
  loadTimeZone,
  mockModel,
  modelCall,
  overRateLimit,
} from '../_shared/ai.ts';

const PROMPT = 'weekly-brief.v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  const started = Date.now();

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return error('unauthorized', 401);
  const body = WeeklyBriefRequest.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return error('invalid_request', 400);

  const { data: workspace } = await db
    .from('workspaces')
    .select('id')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!workspace) return error('not_found', 404);
  const timeZone = await loadTimeZone(db, auth.user.id);
  const today = todayInTimeZone(timeZone);
  const week = weekStart(today);

  if (!body.data.force) {
    const { data: existing } = await db
      .from('ai_actions')
      .select('*')
      .eq('workspace_id', workspace.id)
      .eq('type', 'weekly_brief')
      .eq('proposed_changes->>week_start', week)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && StoredBrief.safeParse(existing.proposed_changes).success)
      return json({ action: existing, cached: true });
  }
  if (await overRateLimit(db, workspace.id)) return error('rate_limited', 429);

  const since = new Date(Date.now() - 8 * 86_400_000).toISOString();
  const [tasks, clients] = await Promise.all([
    db
      .from('tasks')
      .select(
        'id, title, status, due_date, priority, client_id, parent_task_id, created_at, updated_at, completed_at',
      )
      .eq('workspace_id', workspace.id)
      .or(`status.neq.done,completed_at.gte.${since}`)
      .limit(500),
    db
      .from('clients')
      .select('id, name, status, last_contacted_at, created_at')
      .eq('workspace_id', workspace.id),
  ]);
  if (tasks.error || clients.error) return error('load_failed', 500);

  const data = buildBriefData({ today, tasks: tasks.data ?? [], clients: clients.data ?? [] });
  const fallback = () => fallbackBrief(data);
  const call = isMock()
    ? mockModel(fallback)
    : (modelCall({ timeoutMs: 45_000, maxRetries: 2 }) ?? mockModel(fallback));

  const result = await runStructured({
    call,
    schema: WeeklyBrief,
    system: await loadPrompt(PROMPT),
    user: renderBriefMessage(data),
    effort: 'low',
    maxTokens: 2000,
    postProcess: (brief, issues) => sanitizeBrief(brief, data, issues),
    fallback,
  });

  const { data: action, error: insertError } = await db
    .from('ai_actions')
    .insert({
      workspace_id: workspace.id,
      type: 'weekly_brief',
      // BriefData is plain JSON (strings, numbers, arrays); the interface just isn't typed as Json.
      proposed_changes: JSON.parse(
        JSON.stringify({ week_start: week, data, brief: result.value, fallback: result.fallback }),
      ),
      model: result.model,
      prompt_version: PROMPT,
      tokens_in: result.usage.input_tokens,
      tokens_out: result.usage.output_tokens,
    })
    .select('*')
    .single();
  if (insertError) return error('save_failed', 500);

  logMetrics({
    fn: 'weekly-brief',
    action_id: action.id,
    candidates: data.candidates.length,
    attempts: result.attempts,
    fallback: result.fallback,
    tokens_in: result.usage.input_tokens,
    tokens_out: result.usage.output_tokens,
    issues: result.issues,
    ms: Date.now() - started,
  });
  return json({ action, cached: false });
});
