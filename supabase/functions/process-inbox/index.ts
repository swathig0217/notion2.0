// Turns one inbox dump into a reviewable proposal (ai_actions row, status "proposed").
// Nothing in the workspace changes here: the user applies it via apply_ai_action.
import {
  ProcessInboxRequest,
  fallbackProposal,
  mockInboxProposal,
  renderInboxMessage,
  runProposal,
} from '../../../packages/shared/src/ai/index.ts';
import { INBOX_MAX_CHARS } from '../../../packages/shared/src/schemas/entities.ts';
import { error, json, logMetrics, corsHeaders } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';
import {
  isMock,
  loadPrompt,
  loadTimeZone,
  loadWorkspaceContext,
  mockModel,
  modelCall,
  overRateLimit,
} from '../_shared/ai.ts';

const PROMPT = 'process-inbox.v1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);
  const started = Date.now();

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return error('unauthorized', 401);

  const body = ProcessInboxRequest.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('invalid_request', 400);

  // RLS: only returns the item if the caller is a member of its workspace.
  const { data: item } = await db
    .from('inbox_items')
    .select('*')
    .eq('id', body.data.inbox_item_id)
    .maybeSingle();
  if (!item) return error('not_found', 404);
  if (item.raw_content.length > INBOX_MAX_CHARS) return error('input_too_large', 413);
  if (await overRateLimit(db, item.workspace_id)) return error('rate_limited', 429);

  const timeZone = await loadTimeZone(db, auth.user.id);
  const context = await loadWorkspaceContext(db, item.workspace_id, timeZone);
  const kind = item.kind === 'image' ? 'text' : item.kind;

  const call = isMock()
    ? mockModel(() => mockInboxProposal(item.raw_content, context))
    : modelCall({ timeoutMs: 60_000, maxRetries: 2 });
  if (!call) return error('ai_not_configured', 503);

  const result = await runProposal({
    call,
    system: await loadPrompt(PROMPT),
    user: renderInboxMessage(context, { kind, text: item.raw_content }, body.data.clarification),
    effort: 'medium',
    sanitize: { context, rawInput: item.raw_content, newClients: 'if_mentioned' },
    fallback: () => fallbackProposal(item.raw_content),
  });

  const { data: action, error: insertError } = await db
    .from('ai_actions')
    .insert({
      workspace_id: item.workspace_id,
      inbox_item_id: item.id,
      type: 'process_inbox',
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
    fn: 'process-inbox',
    action_id: action.id,
    kind: item.kind,
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
