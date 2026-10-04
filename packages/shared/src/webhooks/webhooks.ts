/**
 * Outgoing webhooks. Each delivery is signed:
 *   Notion2-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>
 * Receivers recompute the HMAC and reject timestamps older than 5 minutes.
 */

export const WEBHOOK_EVENTS = [
  'task.created',
  'task.completed',
  'client.created',
  'invoice.sent',
  'invoice.paid',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'task.created': 'Task created',
  'task.completed': 'Task completed',
  'client.created': 'Client added',
  'invoice.sent': 'Invoice sent',
  'invoice.paid': 'Invoice paid',
};

export const MAX_WEBHOOKS = 5;
export const MAX_DELIVERY_ATTEMPTS = 5;
export const DELIVERY_TIMEOUT_MS = 10_000;
export const SIGNATURE_HEADER = 'Notion2-Signature';

/** Backoff after a failed attempt (1-based): 1m, 5m, 30m, 2h; then it gives up. */
export function retryDelaySeconds(attempt: number): number | null {
  const delays = [60, 300, 1800, 7200];
  return attempt < MAX_DELIVERY_ATTEMPTS ? (delays[attempt - 1] ?? 7200) : null;
}

const PRIVATE_HOST =
  /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[.*\]|metadata\.google\.internal)$/i;

/**
 * Only public https endpoints (no credentials in the URL, no private or link-local
 * addresses, no IP-literal IPv6). `allowInsecure` permits http and local hosts for
 * local development and e2e only.
 */
export function webhookUrlProblem(
  raw: string,
  opts: { allowInsecure?: boolean } = {},
): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return 'Enter a full URL, like https://hooks.zapier.com/…';
  }
  if (raw.length > 2000) return 'That URL is too long.';
  if (url.username || url.password) return 'Remove the username and password from the URL.';
  if (opts.allowInsecure)
    return url.protocol === 'https:' || url.protocol === 'http:' ? null : 'Use an https URL.';
  if (url.protocol !== 'https:') return 'Use an https URL.';
  if (PRIVATE_HOST.test(url.hostname)) return 'Use a public address, not a local or private one.';
  return null;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** HMAC-SHA256 over "<timestamp>.<body>" with WebCrypto (Deno, browsers, Node 20+). */
export async function signWebhook(
  secret: string,
  timestamp: number,
  body: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
  return `t=${timestamp},v1=${toHex(mac)}`;
}

/** 32 random bytes → 64 hex chars (caller supplies a CSPRNG). */
export function webhookSecretFromBytes(bytes: Uint8Array): string {
  if (bytes.length !== 32) throw new Error('A webhook secret needs 32 random bytes');
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
