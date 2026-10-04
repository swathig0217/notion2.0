// Turns one inbox dump into a reviewable proposal (ai_actions row, status "proposed").
// Nothing in the workspace changes here: the user applies it via apply_ai_action.
import { ProcessInboxRequest } from '../../../packages/shared/src/ai/index.ts';
import { corsHeaders, error, json } from '../_shared/http.ts';
import { userClient } from '../_shared/supabase.ts';
import { processInboxItem } from '../_shared/inbox.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);

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

  const outcome = await processInboxItem(db, item, {
    timezoneUserId: auth.user.id,
    clarification: body.data.clarification,
    source: 'app',
  });
  return outcome.ok ? json({ action: outcome.action }) : error(outcome.code, outcome.status);
});
