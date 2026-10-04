import { z } from 'zod';
import { addDays } from '../dates/dates.ts';
import { entryMinutes, type TimeEntryLike } from '../time/time.ts';

/**
 * Invoicing from tracked time. Money is always integer cents; quantities are hours with
 * two decimals. The database recomputes totals the same way (`save_invoice`).
 */

export const DEFAULT_PAYMENT_TERMS_DAYS = 14;

export const InvoiceLine = z.object({
  id: z.string().uuid(),
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(99_999_999),
  unit_price_cents: z.number().int().min(0).max(100_000_000),
  task_id: z.string().uuid().nullable(),
});
export type InvoiceLine = z.infer<typeof InvoiceLine>;

export interface BillableEntry extends TimeEntryLike {
  invoice_id: string | null;
}

export interface TaskRef {
  id: string;
  title: string;
  client_id: string | null;
  project_id: string | null;
}

export interface ProjectRef {
  id: string;
  title: string;
  client_id: string | null;
}

/** Finished, billable, not-yet-invoiced entries for a client (via task or project). */
export function unbilledEntries<T extends BillableEntry>(
  entries: readonly T[],
  clientId: string,
  tasks: readonly TaskRef[],
  projects: readonly ProjectRef[],
): T[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectClient = new Map(projects.map((p) => [p.id, p.client_id]));
  return entries.filter((e) => {
    if (!e.billable || e.ended_at == null || e.invoice_id != null) return false;
    const task = e.task_id ? taskById.get(e.task_id) : undefined;
    const client =
      task?.client_id ??
      (task?.project_id ? projectClient.get(task.project_id) : undefined) ??
      (e.project_id ? projectClient.get(e.project_id) : undefined) ??
      null;
    return client === clientId;
  });
}

/** Hours with two decimals, rounded to the nearest 0.01 h. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function lineAmount(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}

export function invoiceTotal(lines: readonly Pick<InvoiceLine, 'quantity' | 'unit_price_cents'>[]) {
  return lines.reduce((sum, l) => sum + lineAmount(l.quantity, l.unit_price_cents), 0);
}

/**
 * One line per task (time without a task is grouped per project, then "Other work"),
 * in order of first tracked time.
 */
export function linesFromTime(
  entries: readonly BillableEntry[],
  tasks: readonly TaskRef[],
  projects: readonly ProjectRef[],
  rateCents: number,
  newId: () => string,
): InvoiceLine[] {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const groups = new Map<
    string,
    { label: string; taskId: string | null; minutes: number; first: string }
  >();
  for (const e of entries) {
    const task = e.task_id ? taskById.get(e.task_id) : undefined;
    const project = e.project_id ? projectById.get(e.project_id) : undefined;
    const key = task ? `t:${task.id}` : project ? `p:${project.id}` : 'other';
    const label = task?.title ?? project?.title ?? 'Other work';
    const g = groups.get(key) ?? {
      label,
      taskId: task?.id ?? null,
      minutes: 0,
      first: e.started_at,
    };
    g.minutes += entryMinutes(e);
    if (e.started_at < g.first) g.first = e.started_at;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.minutes > 0)
    .sort((a, b) => a.first.localeCompare(b.first))
    .map((g) => ({
      id: newId(),
      description: g.label.slice(0, 500),
      quantity: Math.max(0.01, minutesToHours(g.minutes)),
      unit_price_cents: rateCents,
      task_id: g.taskId,
    }));
}

/** "$1,234.50" in the invoice currency; falls back to "USD 1234.50" if Intl lacks it. */
export function formatMoney(cents: number, currency: string, locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** Parses "120", "120.5", "$1,200.00", "85,50" into cents; null if invalid. */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/[^\d.,-]/g, '');
  if (!s || s.startsWith('-')) return null;
  // "85,50" (decimal comma) vs "1,200" (thousands separator)
  if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  s = s.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** "2.5" → 2.5; accepts a decimal comma. Null if not a positive number. */
export function parseQuantity(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

export function formatQuantity(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/0$/, '');
}

export function defaultDueDate(issueDate: string, days = DEFAULT_PAYMENT_TERMS_DAYS): string {
  return addDays(issueDate, days);
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export function isInvoiceOverdue(
  invoice: { status: InvoiceStatus; due_date: string | null },
  today: string,
): boolean {
  return invoice.status === 'sent' && invoice.due_date != null && invoice.due_date < today;
}

export interface InvoiceText {
  number: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  client_name: string;
  notes: string | null;
  lines: readonly Pick<InvoiceLine, 'description' | 'quantity' | 'unit_price_cents'>[];
  from: string | null;
  details: string | null;
}

/** Plain-text invoice for email/WhatsApp. Lines: "Design homepage — 2.5 h × $100.00 = $250.00". */
export function renderInvoiceText(inv: InvoiceText): string {
  const money = (c: number) => formatMoney(c, inv.currency);
  const out: string[] = [];
  out.push(`Invoice ${inv.number}`);
  if (inv.from) out.push(`From: ${inv.from}`);
  out.push(`To: ${inv.client_name}`);
  out.push(`Date: ${inv.issue_date}`);
  if (inv.due_date) out.push(`Due: ${inv.due_date}`);
  out.push('');
  for (const l of inv.lines) {
    out.push(
      `${l.description} — ${formatQuantity(l.quantity)} × ${money(l.unit_price_cents)} = ${money(lineAmount(l.quantity, l.unit_price_cents))}`,
    );
  }
  out.push('');
  out.push(`Total: ${money(invoiceTotal(inv.lines))}`);
  if (inv.notes?.trim()) out.push('', inv.notes.trim());
  if (inv.details?.trim()) out.push('', inv.details.trim());
  return out.join('\n');
}
