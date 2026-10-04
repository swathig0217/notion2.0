// Delivers queued webhook events (webhook_deliveries), signed with each endpoint's secret.
// Run every minute by pg_cron with CRON_SECRET. Service client: every query is scoped by
// delivery id / webhook id. Never follows redirects; re-checks every URL before sending.
import {
  DELIVERY_TIMEOUT_MS,
  SIGNATURE_HEADER,
  retryDelaySeconds,
  signWebhook,
  webhookUrlProblem,
} from '../../../packages/shared/src/webhooks/webhooks.ts';
import { json, error, logMetrics } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

const BATCH = 100;
const LEASE_SECONDS = 300;
const KEEP_DAYS = 30;
const allowInsecure = () => Deno.env.get('WEBHOOKS_ALLOW_INSECURE') === '1';

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/** A public hostname must not resolve to a private address (DNS rebinding/SSRF). */
async function resolvesPrivate(hostname: string): Promise<boolean> {
  if (allowInsecure()) return false;
  try {
    const [v4, v6] = await Promise.all([
      Deno.resolveDns(hostname, 'A').catch(() => [] as string[]),
      Deno.resolveDns(hostname, 'AAAA').catch(() => [] as string[]),
    ]);
    return v4.some((ip) => PRIVATE_V4.test(ip)) || v6.some((ip) => /^(::1$|fc|fd|fe80)/i.test(ip));
  } catch {
    return false; // resolver unavailable in this runtime: the hostname check still applies
  }
}

type Outcome = { status: 'sent' | 'retry' | 'failed'; code: number | null };

async function send(
  delivery: { id: string; event: string; payload: unknown },
  hook: { url: string; secret: string; enabled: boolean },
): Promise<Outcome> {
  if (!hook.enabled) return { status: 'failed', code: null };
  if (webhookUrlProblem(hook.url, { allowInsecure: allowInsecure() }))
    return { status: 'failed', code: null };
  const url = new URL(hook.url);
  if (await resolvesPrivate(url.hostname)) return { status: 'failed', code: null };

  const body = JSON.stringify({
    id: delivery.id,
    ...(delivery.payload as Record<string, unknown>),
  });
  const signature = await signWebhook(hook.secret, Math.floor(Date.now() / 1000), body);
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Notion2-Webhooks/1',
        [SIGNATURE_HEADER]: signature,
        'Notion2-Event': delivery.event,
        'Notion2-Delivery': delivery.id,
      },
      body,
    });
    await res.body?.cancel();
    return { status: res.status >= 200 && res.status < 300 ? 'sent' : 'retry', code: res.status };
  } catch {
    return { status: 'retry', code: null };
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`)
    return error('unauthorized', 401);
  const started = Date.now();
  const db = serviceClient();
  const now = new Date();

  // Claim a batch: push next_attempt_at forward so an overlapping run skips these rows.
  const { data: due } = await db
    .from('webhook_deliveries')
    .select('id')
    .eq('status', 'pending')
    .lte('next_attempt_at', now.toISOString())
    .order('next_attempt_at')
    .limit(BATCH);
  const ids = (due ?? []).map((d) => d.id);
  const { data: claimed } = ids.length
    ? await db
        .from('webhook_deliveries')
        .update({ next_attempt_at: new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString() })
        .in('id', ids)
        .eq('status', 'pending')
        .lte('next_attempt_at', now.toISOString())
        .select('id, webhook_id, event, payload, attempts')
    : { data: [] };

  const hookIds = [...new Set((claimed ?? []).map((d) => d.webhook_id))];
  const { data: hooks } = hookIds.length
    ? await db.from('webhooks').select('id, url, secret, enabled').in('id', hookIds)
    : { data: [] };
  const hookById = new Map((hooks ?? []).map((h) => [h.id, h]));

  const counts = { sent: 0, retry: 0, failed: 0 };
  for (const d of claimed ?? []) {
    const hook = hookById.get(d.webhook_id);
    const outcome = hook ? await send(d, hook) : ({ status: 'failed', code: null } as Outcome);
    const attempts = d.attempts + 1;
    const delay = outcome.status === 'retry' ? retryDelaySeconds(attempts) : null;
    const status = outcome.status === 'sent' ? 'sent' : delay == null ? 'failed' : 'pending';
    counts[status === 'pending' ? 'retry' : status]++;
    await db
      .from('webhook_deliveries')
      .update({
        status,
        attempts,
        response_status: outcome.code,
        next_attempt_at: new Date(Date.now() + (delay ?? 0) * 1000).toISOString(),
      })
      .eq('id', d.id);
  }

  await db
    .from('webhook_deliveries')
    .delete()
    .lt('created_at', new Date(now.getTime() - KEEP_DAYS * 86_400_000).toISOString());

  logMetrics({ fn: 'deliver-webhooks', ...counts, ms: Date.now() - started });
  return json(counts);
});
