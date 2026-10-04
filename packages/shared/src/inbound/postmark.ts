import { z } from 'zod';
import { INBOX_MAX_CHARS } from '../schemas/entities.ts';

/** The parts of Postmark's inbound webhook payload we use (extra fields are ignored). */
const Address = z.object({ Email: z.string(), Name: z.string().optional().default('') });
export const PostmarkInbound = z.object({
  From: z.string().optional().default(''),
  FromFull: Address.optional(),
  To: z.string().optional().default(''),
  ToFull: z.array(Address).optional().default([]),
  CcFull: z.array(Address).optional().default([]),
  BccFull: z.array(Address).optional().default([]),
  OriginalRecipient: z.string().optional().default(''),
  Subject: z.string().optional().default(''),
  Date: z.string().optional().default(''),
  TextBody: z.string().optional().default(''),
  HtmlBody: z.string().optional().default(''),
  Headers: z
    .array(z.object({ Name: z.string(), Value: z.string() }))
    .optional()
    .default([]),
});
export type PostmarkInbound = z.infer<typeof PostmarkInbound>;

const TOKEN = /^[a-z0-9]{12,64}$/;

/** Finds our workspace token in any recipient at the inbound domain. */
export function extractInboundToken(payload: PostmarkInbound, domain: string): string | null {
  const suffix = `@${domain.toLowerCase()}`;
  const candidates = [
    payload.OriginalRecipient,
    ...payload.ToFull.map((a) => a.Email),
    ...payload.CcFull.map((a) => a.Email),
    ...payload.BccFull.map((a) => a.Email),
  ];
  for (const raw of candidates) {
    const email = raw.trim().toLowerCase();
    if (!email.endsWith(suffix)) continue;
    // Allow plus-addressing: token+anything@domain
    const local = email.slice(0, -suffix.length).split('+')[0] ?? '';
    if (TOKEN.test(local)) return local;
  }
  return null;
}

/** Auto-replies and bounces must not create inbox items (and must never loop). */
export function isAutomated(payload: PostmarkInbound): boolean {
  const header = (name: string) =>
    payload.Headers.find((h) => h.Name.toLowerCase() === name)?.Value.toLowerCase();
  const autoSubmitted = header('auto-submitted');
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (header('x-autoreply') || header('x-autorespond')) return true;
  const precedence = header('precedence');
  if (precedence && ['bulk', 'auto_reply', 'junk'].includes(precedence)) return true;
  return /^(mailer-daemon|postmaster)@/i.test(payload.FromFull?.Email ?? payload.From);
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n');
}

/** The inbox text for an email: a small header block, then the plain-text body. */
export function inboundEmailText(payload: PostmarkInbound): string {
  const from = payload.FromFull
    ? payload.FromFull.Name
      ? `${payload.FromFull.Name} <${payload.FromFull.Email}>`
      : payload.FromFull.Email
    : payload.From;
  const body = (payload.TextBody.trim() || htmlToText(payload.HtmlBody)).trim();
  const header = [
    `From: ${from}`,
    payload.Subject ? `Subject: ${payload.Subject}` : null,
    payload.Date ? `Date: ${payload.Date}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const text = `${header}\n\n${body || '(no text)'}`;
  return text.length > INBOX_MAX_CHARS
    ? `${text.slice(0, INBOX_MAX_CHARS - 13)}\n[truncated]`
    : text;
}
