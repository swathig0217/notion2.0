// Onboarding: proposes a starter workspace from the "3 questions". Must answer within
// ~10 seconds, so the model call has a tight timeout and a deterministic template fallback.
import {
  GenerateWorkspaceRequest,
  renderOnboardingMessage,
  runProposal,
  starterTemplate,
} from '../../../packages/shared/src/ai/index.ts';
import { error, json, logMetrics, corsHeaders } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';
import {
  isMock,
  loadPrompt,
  loadTimeZone,
  mockModel,
  modelCall,
  overRateLimit,
} from '../_shared/ai.ts';
import { todayInTimeZone } from '../../../packages/shared/src/dates/dates.ts';

const PROMPT = 'generate-workspace.v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  const started = Date.now();

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return error('unauthorized', 401);

  const parsed = GenerateWorkspaceRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error('invalid_request', 400);
  const answers = parsed.data;

  const { data: workspace } = await db
    .from('workspaces')
    .select('id')
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!workspace) return error('not_found', 404);
  if (await overRateLimit(db, workspace.id)) return error('rate_limited', 429);

  const timeZone = await loadTimeZone(db, auth.user.id);
  const today = todayInTimeZone(timeZone);
  const template = () => starterTemplate(answers, today);
  // No key configured still yields a working workspace (the template).
  const call =
    (isMock() ? mockModel(template) : modelCall({ timeoutMs: 9_000, maxRetries: 0 })) ??
    mockModel(template);

  const result = await runProposal({
    call,
    system: await loadPrompt(PROMPT),
    user: renderOnboardingMessage(answers, today, timeZone),
    effort: 'low',
    maxTokens: 4000,
    sanitize: {
      context: { today, timezone: timeZone, clients: [], projects: [], recent_tasks: [] },
      rawInput: '',
      newClients: 'always',
    },
    fallback: template,
  });

  const { data: action, error: insertError } = await db
    .from('ai_actions')
    .insert({
      workspace_id: workspace.id,
      type: 'generate_workspace',
      proposed_changes: result.proposal,
      model: result.model,
      prompt_version: PROMPT,
      tokens_in: result.usage.input_tokens,
      tokens_out: result.usage.output_tokens,
    })
    .select('*')
    .single();
  if (insertError) return error('save_failed', 500);

  logMetrics({
    fn: 'generate-workspace',
    action_id: action.id,
    attempts: result.attempts,
    fallback: result.proposal.fallback,
    changes: result.proposal.proposed_changes.length,
    tokens_in: result.usage.input_tokens,
    tokens_out: result.usage.output_tokens,
    issues: result.issues,
    ms: Date.now() - started,
  });
  return json({ action });
});
