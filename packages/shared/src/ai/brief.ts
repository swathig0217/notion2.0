import { z } from 'zod';
import { addDays, daysBetween, weekday } from '../dates/dates.ts';
import { escapeUntrusted } from './context.ts';

/**
 * Weekly Brief. The facts (overdue, stale, silent clients, candidates) are computed here,
 * deterministically. The model only chooses and explains the top priorities, and only
 * from the candidate ids it is given, so it can't invent work.
 */

export interface BriefTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority: string;
  client_id: string | null;
  parent_task_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BriefClient {
  id: string;
  name: string;
  status: string;
  last_contacted_at: string | null;
  created_at: string;
}

export interface BriefTaskRef {
  id: string;
  title: string;
  client: string | null;
  due_date: string | null;
  priority: string;
  status: string;
}

export interface BriefData {
  week_start: string;
  today: string;
  overdue: BriefTaskRef[];
  /** Due today through the next 6 days. */
  due_this_week: BriefTaskRef[];
  stale: BriefTaskRef[];
  silent_clients: { client_id: string; name: string; days_silent: number }[];
  completed_last_7_days: number;
  candidates: BriefTaskRef[];
}

export const STALE_DOING_DAYS = 5;
export const STALE_TODO_DAYS = 21;

/** Monday of the week containing `today` (weeks start Monday). */
export function weekStart(today: string): string {
  return addDays(today, -((weekday(today) + 6) % 7));
}

function dateOf(iso: string) {
  return iso.slice(0, 10);
}

export function buildBriefData(args: {
  today: string;
  tasks: readonly BriefTask[];
  clients: readonly BriefClient[];
  followUpDays?: number;
}): BriefData {
  const { today } = args;
  const followUpDays = args.followUpDays ?? 7;
  const names = new Map(args.clients.map((c) => [c.id, c.name]));
  const ref = (t: BriefTask): BriefTaskRef => ({
    id: t.id,
    title: t.title,
    client: t.client_id ? (names.get(t.client_id) ?? null) : null,
    due_date: t.due_date,
    priority: t.priority,
    status: t.status,
  });
  const open = args.tasks.filter((t) => t.parent_task_id == null && t.status !== 'done');
  const byDue = (a: BriefTask, b: BriefTask) =>
    (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
  // Rolling 7 days, so a brief opened late in the week still looks ahead.
  const horizon = addDays(today, 6);

  const overdue = open.filter((t) => t.due_date != null && t.due_date < today).sort(byDue);
  const dueThisWeek = open
    .filter((t) => t.due_date != null && t.due_date >= today && t.due_date <= horizon)
    .sort(byDue);
  const stale = open.filter(
    (t) =>
      (t.status === 'doing' && daysBetween(dateOf(t.updated_at), today) >= STALE_DOING_DAYS) ||
      (t.status === 'todo' &&
        t.due_date == null &&
        daysBetween(dateOf(t.created_at), today) >= STALE_TODO_DAYS),
  );
  const high = open.filter((t) => t.priority === 'high');

  const seen = new Set<string>();
  const candidates: BriefTask[] = [];
  for (const t of [...overdue, ...high, ...dueThisWeek, ...stale]) {
    if (seen.has(t.id) || candidates.length >= 25) continue;
    seen.add(t.id);
    candidates.push(t);
  }

  const silent = args.clients
    .filter((c) => c.status === 'active')
    .map((c) => ({
      client_id: c.id,
      name: c.name,
      days_silent: daysBetween(dateOf(c.last_contacted_at ?? c.created_at), today),
    }))
    .filter((c) => c.days_silent >= followUpDays)
    .sort((a, b) => b.days_silent - a.days_silent)
    .slice(0, 5);

  const weekAgo = addDays(today, -7);
  return {
    week_start: weekStart(today),
    today,
    overdue: overdue.map(ref),
    due_this_week: dueThisWeek.map(ref),
    stale: stale.map(ref),
    silent_clients: silent,
    completed_last_7_days: args.tasks.filter(
      (t) => t.status === 'done' && t.completed_at != null && dateOf(t.completed_at) > weekAgo,
    ).length,
    candidates: candidates.map(ref),
  };
}

export const WeeklyBrief = z.object({
  headline: z.string().describe('One calm sentence summarizing the week ahead'),
  priorities: z
    .array(z.object({ task_id: z.string(), why: z.string().describe('Under 12 words') }))
    .describe('Up to 5, most important first, task_id from candidates only'),
  follow_ups: z
    .array(z.object({ client_id: z.string(), why: z.string() }))
    .describe('Clients from silent_clients worth a check-in, most important first'),
});
export type WeeklyBrief = z.infer<typeof WeeklyBrief>;

export const StoredBrief = z.object({
  week_start: z.string(),
  data: z.custom<BriefData>((v) => typeof v === 'object' && v != null),
  brief: WeeklyBrief,
  fallback: z.boolean(),
});
export type StoredBrief = z.infer<typeof StoredBrief>;

export const WeeklyBriefRequest = z.object({ force: z.boolean().optional() });

export function renderBriefMessage(data: BriefData): string {
  return [
    `Today is ${data.today}. The week started ${data.week_start}.`,
    '<brief_data>',
    escapeUntrusted(JSON.stringify(data)),
    '</brief_data>',
  ].join('\n');
}

export function sanitizeBrief(
  brief: WeeklyBrief,
  data: BriefData,
  issues: string[],
): WeeklyBrief | string {
  const candidateIds = new Set(data.candidates.map((c) => c.id));
  const clientIds = new Set(data.silent_clients.map((c) => c.client_id));
  const seen = new Set<string>();
  const priorities = brief.priorities.filter((p) => {
    if (!candidateIds.has(p.task_id) || seen.has(p.task_id)) {
      issues.push('unknown_or_duplicate_task');
      return false;
    }
    seen.add(p.task_id);
    return true;
  });
  if (priorities.length === 0 && data.candidates.length > 0)
    return 'Pick priorities from the candidate task ids.';
  const followSeen = new Set<string>();
  const follow_ups = brief.follow_ups.filter((f) => {
    const ok = clientIds.has(f.client_id) && !followSeen.has(f.client_id);
    followSeen.add(f.client_id);
    if (!ok) issues.push('unknown_or_duplicate_client');
    return ok;
  });
  const clip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);
  return {
    headline: clip(brief.headline, 200) || 'Here’s your week.',
    priorities: priorities.slice(0, 5).map((p) => ({ task_id: p.task_id, why: clip(p.why, 120) })),
    follow_ups: follow_ups
      .slice(0, 5)
      .map((f) => ({ client_id: f.client_id, why: clip(f.why, 120) })),
  };
}

const PRIORITY_SCORE: Record<string, number> = { high: 30, med: 15, low: 5, none: 0 };

/** Deterministic brief: overdue first, then priority, then due soon, then stale. */
export function fallbackBrief(data: BriefData): WeeklyBrief {
  const staleIds = new Set(data.stale.map((t) => t.id));
  const score = (t: BriefTaskRef) => {
    let s = PRIORITY_SCORE[t.priority] ?? 0;
    if (t.due_date) {
      const d = daysBetween(data.today, t.due_date);
      s += d < 0 ? 50 + Math.min(30, -d) : Math.max(0, 25 - d * 3);
    }
    if (staleIds.has(t.id)) s += 10;
    return s;
  };
  // Reasons don't restate the due date: the UI shows it next to the reason.
  const why = (t: BriefTaskRef) => {
    if (t.due_date && t.due_date < data.today)
      return t.client ? `Overdue, ${t.client} is waiting` : 'Overdue';
    if (t.priority === 'high') return 'High priority';
    if (t.due_date) return t.due_date === data.today ? 'Due today' : 'Due soon';
    if (staleIds.has(t.id)) return 'Hasn’t moved in a while';
    return 'Open and waiting';
  };
  const top = [...data.candidates].sort((a, b) => score(b) - score(a)).slice(0, 5);
  const parts = [
    data.overdue.length ? `${data.overdue.length} overdue` : null,
    data.due_this_week.length ? `${data.due_this_week.length} due this week` : null,
    data.silent_clients.length
      ? `${data.silent_clients.length} client${data.silent_clients.length === 1 ? '' : 's'} to check in with`
      : null,
  ].filter(Boolean);
  return {
    headline: parts.length
      ? `This week: ${parts.join(', ')}.`
      : 'A clear week. Nothing overdue or urgent.',
    priorities: top.map((t) => ({ task_id: t.id, why: why(t) })),
    follow_ups: data.silent_clients.map((c) => ({
      client_id: c.client_id,
      why: `No contact in ${c.days_silent} days`,
    })),
  };
}
