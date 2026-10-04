// Postmark inbound webhook: an email forwarded to <token>@<INBOUND_EMAIL_DOMAIN> becomes an
// inbox item and is organized into a proposal. Authenticated with HTTP basic auth (the
// password is INBOUND_WEBHOOK_SECRET, set in Postmark's webhook URL).
import {
  PostmarkInbound,
  extractInboundToken,
  inboundEmailText,
  isAutomated,
} from '../../../packages/shared/src/index.ts';
import { json, logMetrics } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { processInboxItem } from '../_shared/inbox.ts';
import { sendPush, userTokens } from '../_shared/push.ts';

const EMAILS_PER_HOUR = Number(Deno.env.get('INBOUND_EMAILS_PER_HOUR') ?? 50);

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function authorized(req: Request): boolean {
  const secret = Deno.env.get('INBOUND_WEBHOOK_SECRET');
  const header = req.headers.get('Authorization') ?? '';
  if (!secret || !header.startsWith('Basic ')) return false;
  const decoded = atob(header.slice(6));
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return timingSafeEqual(password, secret);
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!authorized(req)) return json({ error: 'unauthorized' }, 401);
  const domain = Deno.env.get('INBOUND_EMAIL_DOMAIN') ?? '';

  const parsed = PostmarkInbound.safeParse(await req.json().catch(() => null));
  // Always 200 for well-authenticated but unusable mail, so Postmark doesn't retry it.
  if (!parsed.success) return json({ ok: true, skipped: 'invalid_payload' });
  const payload = parsed.data;
  if (isAutomated(payload)) return json({ ok: true, skipped: 'automated' });
  const token = extractInboundToken(payload, domain);
  if (!token) return json({ ok: true, skipped: 'no_token' });

  const db = serviceClient();
  const { data: workspace } = await db
    .from('workspaces')
    .select('id, owner_id')
    .eq('inbound_token', token)
    .maybeSingle();
  if (!workspace) return json({ ok: true, skipped: 'unknown_address' });

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await db
    .from('inbox_items')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspace.id)
    .eq('kind', 'email')
    .gte('created_at', since);
  if ((count ?? 0) >= EMAILS_PER_HOUR) {
    logMetrics({ fn: 'inbound-email', workspace_id: workspace.id, skipped: 'flood_cap' });
    return json({ ok: true, skipped: 'flood_cap' });
  }

  const { data: item, error } = await db
    .from('inbox_items')
    .insert({ workspace_id: workspace.id, kind: 'email', raw_content: inboundEmailText(payload) })
    .select('*')
    .single();
  if (error) return json({ error: 'save_failed' }, 500); // Postmark retries

  // Organize after responding (Postmark expects a quick answer). If it fails, the email
  // stays in the Inbox for the user to organize.
  const work = (async () => {
    const outcome = await processInboxItem(db, item, {
      timezoneUserId: workspace.owner_id,
      source: 'email',
    });
    if (!outcome.ok) return;
    const tokens = await userTokens(db, workspace.owner_id);
    if (tokens.length) {
      await sendPush(
        db,
        tokens.map((to) => ({
          to,
          title: 'Forwarded email organized',
          body: 'A proposal is ready for you to review.',
          url: `/review/${outcome.action.id}`,
        })),
      );
    }
  })().catch((e) =>
    logMetrics({ fn: 'inbound-email', error: e instanceof Error ? e.name : 'error' }),
  );
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else await work;

  logMetrics({ fn: 'inbound-email', workspace_id: workspace.id, inbox_item_id: item.id });
  return json({ ok: true, inbox_item_id: item.id });
});
