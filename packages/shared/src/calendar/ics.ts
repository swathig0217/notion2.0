import { addDays } from '../dates/dates.ts';

/**
 * Private calendar feed (RFC 5545). All-day events for due dates, so they land on the
 * right day in every timezone. Stable UIDs let calendar apps update events in place.
 */

export interface CalendarEvent {
  uid: string;
  /** YYYY-MM-DD */
  date: string;
  summary: string;
  description?: string | null;
}

/** Feed window: recent past (overdue work) through the next year. */
export const FEED_PAST_DAYS = 30;
export const FEED_FUTURE_DAYS = 365;
export const MAX_FEED_EVENTS = 1000;

export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets (UTF-8), continuation lines start with a space. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (size + n > limit) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const compactDate = (date: string) => date.replace(/-/g, '');

function stamp(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildCalendar(args: {
  name: string;
  events: readonly CalendarEvent[];
  now?: Date;
}) {
  const now = stamp(args.now ?? new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Notion 2.0//Due dates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(args.name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of args.events.slice(0, MAX_FEED_EVENTS)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(e.date, 1))}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${escapeIcsText(e.description)}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

export interface FeedTask {
  id: string;
  title: string;
  status: 'todo' | 'doing' | 'done';
  due_date: string | null;
  parent_task_id: string | null;
  client_id: string | null;
  project_id: string | null;
}
export interface FeedProject {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  client_id: string | null;
}
export interface FeedInvoice {
  id: string;
  number: string;
  status: string;
  due_date: string | null;
  client_name: string;
}

/**
 * Open top-level tasks, active projects and sent invoices with a due date inside the
 * feed window. Titles only: no notes, no amounts.
 */
export function feedEvents(args: {
  today: string;
  tasks: readonly FeedTask[];
  projects: readonly FeedProject[];
  invoices: readonly FeedInvoice[];
  clientNames: ReadonlyMap<string, string>;
}): CalendarEvent[] {
  const from = addDays(args.today, -FEED_PAST_DAYS);
  const to = addDays(args.today, FEED_FUTURE_DAYS);
  const inWindow = (d: string | null): d is string => d != null && d >= from && d <= to;
  const client = (id: string | null) => (id ? args.clientNames.get(id) : undefined);
  const events: CalendarEvent[] = [];
  for (const t of args.tasks) {
    if (t.parent_task_id || t.status === 'done' || !inWindow(t.due_date)) continue;
    const c = client(t.client_id);
    events.push({
      uid: `task-${t.id}@notion2`,
      date: t.due_date,
      summary: c ? `${t.title} · ${c}` : t.title,
    });
  }
  for (const p of args.projects) {
    if (p.status !== 'active' || !inWindow(p.due_date)) continue;
    const c = client(p.client_id);
    events.push({
      uid: `project-${p.id}@notion2`,
      date: p.due_date,
      summary: `Project due: ${p.title}${c ? ` · ${c}` : ''}`,
    });
  }
  for (const i of args.invoices) {
    if (i.status !== 'sent' || !inWindow(i.due_date)) continue;
    events.push({
      uid: `invoice-${i.id}@notion2`,
      date: i.due_date,
      summary: `Invoice ${i.number} due · ${i.client_name}`,
    });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid));
}
