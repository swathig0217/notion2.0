// Billing (stub until RevenueCat / Stripe accounts exist; see LAUNCH.md).
//
//   POST { action: "checkout", interval: "month" | "year" }  → upgrade the caller's workspace
//   POST { action: "cancel" }                                → back to free
//
// With BILLING_MODE=stub (local dev, e2e, internal testing) these change the plan
// directly. Otherwise they answer 503 `billing_unavailable` and the app says upgrades
// open soon. Only the workspace owner can change the plan. Subscriptions are written
// with the service client, scoped to the owner's workspace; the app can only read them.
import { z } from 'zod';
import { corsHeaders, error, json, logMetrics } from '../_shared/http.ts';
import type { TablesInsert } from '../../../packages/shared/src/db.types.ts';
import { serviceClient, userClient } from '../_shared/supabase.ts';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('checkout'), interval: z.enum(['month', 'year']) }),
  z.object({ action: z.literal('cancel') }),
]);

function periodEnd(interval: 'month' | 'year', from = new Date()): string {
  const d = new Date(from);
  if (interval === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return error('method_not_allowed', 405);

  const db = userClient(req);
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return error('unauthorized', 401);

  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return error('invalid_request', 400);

  if (Deno.env.get('BILLING_MODE') !== 'stub') return error('billing_unavailable', 503);

  // RLS: the caller only sees workspaces they belong to; require ownership.
  const { data: workspace } = await db
    .from('workspaces')
    .select('id')
    .eq('owner_id', auth.user.id)
    .limit(1)
    .maybeSingle();
  if (!workspace) return error('not_owner', 403);

  const admin = serviceClient();
  const row: TablesInsert<'subscriptions'> =
    body.data.action === 'checkout'
      ? {
          workspace_id: workspace.id,
          plan: 'pro',
          status: 'active',
          provider: 'stub',
          billing_interval: body.data.interval,
          current_period_end: periodEnd(body.data.interval),
        }
      : {
          workspace_id: workspace.id,
          plan: 'free',
          status: 'canceled',
          provider: 'stub',
          billing_interval: null,
          current_period_end: null,
        };
  const { error: upsertError } = await admin
    .from('subscriptions')
    .upsert(row, { onConflict: 'workspace_id' });
  if (upsertError) return error('save_failed', 500);

  logMetrics({ fn: 'billing', action: body.data.action, provider: 'stub' });
  return json({ plan: row.plan });
});
