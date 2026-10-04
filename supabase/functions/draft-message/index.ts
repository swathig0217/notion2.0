// Writes a client status update or a follow-up for the user to edit and send. Stored as
// an ai_actions row (audit); nothing is sent and no workspace data changes here.
import {
  DraftMessage,
  DraftMessageRequest,
  fallbackDraft,
  renderDraftMessage,
  runStructured,
  sanitizeDraft,
} from '../../../packages/shared/src/ai/index.ts';
import { corsHeaders, error, json, logMetrics } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';
import { isMock, loadPrompt, mockModel, modelCall, overRateLimit } from '../_shared/ai.ts';
import { loadDraftContext } from '../_shared/drafts.ts';

const PROMPTS = { client_update: 'client-update.v1', follow_up: 'follow-up.v1' } as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  const started = Date.now();

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return error('unauthorized', 401);

  const body = DraftMessageRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('invalid_request', 400);
  const { kind, client_id, project_id } = body.data;

  const loaded = await loadDraftContext(db, {
    userId: auth.user.id,
    clientId: client_id,
    projectId: project_id ?? null,
    kind,
  });
  if (!loaded) return error('not_found', 404);
  const { context, workspaceId } = loaded;
  if (await overRateLimit(db, workspaceId)) return error('rate_limited', 429);

  const fallback = () => fallbackDraft(kind, context);
  const call = isMock() ? mockModel(fallback) : modelCall({ timeoutMs: 45_000, maxRetries: 2 });
  if (!call) return error('ai_not_configured', 503);

  const prompt = PROMPTS[kind];
  const result = await runStructured({
    call,
    schema: DraftMessage,
    system: await loadPrompt(prompt),
    user: renderDraftMessage(kind, context),
    effort: 'low',
    maxTokens: 2000,
    postProcess: (draft, issues) => sanitizeDraft(draft, context, issues),
    fallback,
  });

  const { data: action, error: insertError } = await db
    .from('ai_actions')
    .insert({
      workspace_id: workspaceId,
      type: kind,
      proposed_changes: {
        draft: result.value,
        kind,
        client_id,
        project_id: project_id ?? null,
        fallback: result.fallback,
      },
      model: result.model,
      prompt_version: prompt,
      tokens_in: result.usage.input_tokens,
      tokens_out: result.usage.output_tokens,
    })
    .select('*')
    .single();
  if (insertError) return error('save_failed', 500);

  logMetrics({
    fn: 'draft-message',
    kind,
    action_id: action.id,
    attempts: result.attempts,
    fallback: result.fallback,
    tokens_in: result.usage.input_tokens,
    tokens_out: result.usage.output_tokens,
    issues: result.issues,
    ms: Date.now() - started,
  });
  return json({ action });
});
