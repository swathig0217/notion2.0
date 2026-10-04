import { z } from 'zod';
import { daysBetween } from '../dates/dates.ts';
import { escapeUntrusted } from './context.ts';
import { PROPOSAL_LIMITS } from './guardrails.ts';

/** A message for the user to edit and send themselves. Never sent automatically. */
export const DraftMessage = z.object({
  subject: z.string().describe('Short email subject line'),
  body: z.string().describe('Plain-text message body, ready to send'),
});
export type DraftMessage = z.infer<typeof DraftMessage>;

export const DraftKind = z.enum(['client_update', 'follow_up']);
export type DraftKind = z.infer<typeof DraftKind>;

export const DraftMessageRequest = z.object({
  kind: DraftKind,
  client_id: z.uuid(),
  project_id: z.uuid().nullable().optional(),
});
export type DraftMessageRequest = z.infer<typeof DraftMessageRequest>;

export const StoredDraft = z.object({
  draft: DraftMessage,
  kind: DraftKind,
  client_id: z.string(),
  project_id: z.string().nullable(),
  fallback: z.boolean(),
});
export type StoredDraft = z.infer<typeof StoredDraft>;

/** Everything the writer may mention. Facts outside this must not appear in the draft. */
export interface DraftContext {
  today: string;
  sender_name: string | null;
  tone: string | null;
  client: { name: string; contact_first_name: string | null; last_contacted_on: string | null };
  project: { title: string; due_date: string | null } | null;
  completed: { title: string; completed_on: string }[];
  in_progress: { title: string; due_date: string | null }[];
  upcoming: { title: string; due_date: string | null }[];
  notes: { title: string; excerpt: string }[];
  minutes_logged: number;
}

interface TaskInput {
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  parent_task_id: string | null;
}

/**
 * Builds the writer's context from workspace rows. `since` is the last contact (or a
 * 14-day window): only work completed after it counts as news.
 */
export function buildDraftContext(args: {
  today: string;
  senderName: string | null;
  tone: string | null;
  client: { name: string; email: string | null; last_contacted_at: string | null };
  project: { title: string; due_date: string | null } | null;
  tasks: readonly TaskInput[];
  notes: readonly { title: string; content_text: string }[];
  minutesLogged: number;
  since: string;
}): DraftContext {
  const top = args.tasks.filter((t) => t.parent_task_id == null);
  const completed = top
    .filter((t) => t.status === 'done' && t.completed_at != null && t.completed_at >= args.since)
    .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''))
    .slice(-15)
    .map((t) => ({ title: t.title, completed_on: (t.completed_at ?? '').slice(0, 10) }));
  const open = top.filter((t) => t.status !== 'done');
  const byDue = (a: TaskInput, b: TaskInput) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  const emailName = args.client.email?.split('@')[0]?.split(/[._-]/)[0] ?? null;
  const contact =
    emailName && /^[a-z]{2,}$/i.test(emailName)
      ? emailName[0]?.toUpperCase() + emailName.slice(1)
      : null;

  return {
    today: args.today,
    sender_name: args.senderName,
    tone: args.tone,
    client: {
      name: args.client.name,
      contact_first_name: contact,
      last_contacted_on: args.client.last_contacted_at?.slice(0, 10) ?? null,
    },
    project: args.project,
    completed,
    in_progress: open
      .filter((t) => t.status === 'doing')
      .sort(byDue)
      .slice(0, 10)
      .map((t) => ({ title: t.title, due_date: t.due_date })),
    upcoming: open
      .filter((t) => t.status === 'todo')
      .sort(byDue)
      .slice(0, 10)
      .map((t) => ({ title: t.title, due_date: t.due_date })),
    notes: args.notes
      .slice(0, 5)
      .map((n) => ({ title: n.title, excerpt: n.content_text.slice(0, 500) })),
    minutes_logged: Math.max(0, Math.round(args.minutesLogged)),
  };
}

export function renderDraftMessage(kind: DraftKind, ctx: DraftContext): string {
  const silent = ctx.client.last_contacted_on
    ? daysBetween(ctx.client.last_contacted_on, ctx.today)
    : null;
  return [
    `Today is ${ctx.today}. Write a ${kind === 'client_update' ? 'status update' : 'short follow-up message'} to the client.`,
    silent != null
      ? `Last contact with this client was ${silent} days ago.`
      : 'There is no record of a previous contact.',
    '<work_context>',
    // Task titles and notes are the user's own words; still data, never instructions.
    escapeUntrusted(JSON.stringify(ctx)),
    '</work_context>',
  ].join('\n');
}

const AMOUNT = /(?:[$€£]\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:usd|eur|gbp|dollars|euros|pounds)\b)/gi;

/** Trims and caps; rejects drafts that state money amounts not present in the context. */
export function sanitizeDraft(
  draft: DraftMessage,
  ctx: DraftContext,
  issues: string[],
): DraftMessage | string {
  const subject = draft.subject.replace(/\s+/g, ' ').trim().slice(0, 120);
  const body = draft.body.trim().slice(0, PROPOSAL_LIMITS.body);
  if (!body) return 'The body was empty.';
  const known = JSON.stringify(ctx).toLowerCase().replace(/\s/g, '');
  const invented = (body.match(AMOUNT) ?? []).filter(
    (m) => !known.includes(m.toLowerCase().replace(/\s/g, '')),
  );
  if (invented.length > 0) {
    issues.push('invented_amount');
    return 'The draft mentions money amounts that are not in the work context. Do not state prices or amounts.';
  }
  return { subject: subject || 'Quick update', body };
}

/** Deterministic draft used when the model is unavailable: plain, factual, editable. */
export function fallbackDraft(kind: DraftKind, ctx: DraftContext): DraftMessage {
  const hi = `Hi ${ctx.client.contact_first_name ?? ctx.client.name},`;
  const sign = ctx.sender_name ? `\n\nBest,\n${ctx.sender_name}` : '\n\nBest,';
  const about = ctx.project ? ` on ${ctx.project.title}` : '';
  if (kind === 'follow_up') {
    return {
      subject: ctx.project ? `Checking in on ${ctx.project.title}` : 'Checking in',
      body: `${hi}\n\nJust checking in${about}. Is there anything you need from me, or anything I can help move forward?${sign}`,
    };
  }
  const list = (items: { title: string }[]) => items.map((i) => `- ${i.title}`).join('\n');
  const parts = [`${hi}\n\nHere's a quick update${about}.`];
  if (ctx.completed.length) parts.push(`Done:\n${list(ctx.completed)}`);
  if (ctx.in_progress.length) parts.push(`In progress:\n${list(ctx.in_progress)}`);
  if (ctx.upcoming.length) parts.push(`Next up:\n${list(ctx.upcoming.slice(0, 5))}`);
  parts.push('Let me know if you have any questions.');
  return {
    subject: ctx.project ? `Update: ${ctx.project.title}` : 'Quick update',
    body: parts.join('\n\n') + sign,
  };
}
