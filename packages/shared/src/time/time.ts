/**
 * Time tracking rules. A running timer is an entry with `ended_at = null`; at most one
 * runs at a time (starting another stops it). Stopped and manual entries carry `minutes`.
 */

export interface TimeEntryLike {
  id: string;
  task_id: string | null;
  project_id: string | null;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  billable: boolean;
}

/** Longest single entry we accept (guards against a timer left running for days). */
export const MAX_ENTRY_MINUTES = 16 * 60;

export function minutesBetween(startIso: string, end: Date): number {
  const ms = end.getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.min(MAX_ENTRY_MINUTES, Math.round(ms / 60_000)));
}

/** Minutes for an entry; a running entry counts up to `now`. */
export function entryMinutes(entry: TimeEntryLike, now: Date = new Date()): number {
  if (entry.ended_at == null) return minutesBetween(entry.started_at, now);
  return entry.minutes ?? minutesBetween(entry.started_at, new Date(entry.ended_at));
}

export function runningEntry<T extends TimeEntryLike>(entries: readonly T[]): T | undefined {
  return entries.find((e) => e.ended_at == null);
}

/** Fields that stop a running entry. */
export function stopFields(entry: TimeEntryLike, now: Date = new Date()) {
  return { ended_at: now.toISOString(), minutes: minutesBetween(entry.started_at, now) };
}

/** A manual entry of `minutes` that ended at `endedAt`. */
export function manualFields(minutes: number, endedAt: Date = new Date()) {
  const m = Math.max(1, Math.min(MAX_ENTRY_MINUTES, Math.round(minutes)));
  return {
    started_at: new Date(endedAt.getTime() - m * 60_000).toISOString(),
    ended_at: endedAt.toISOString(),
    minutes: m,
  };
}

export interface TimeTotals {
  minutes: number;
  billableMinutes: number;
  entries: number;
}

export function totalMinutes(
  entries: readonly TimeEntryLike[],
  now: Date = new Date(),
  since?: string,
): TimeTotals {
  let minutes = 0;
  let billableMinutes = 0;
  let count = 0;
  for (const e of entries) {
    if (since && e.started_at < since) continue;
    const m = entryMinutes(e, now);
    minutes += m;
    if (e.billable) billableMinutes += m;
    count++;
  }
  return { minutes, billableMinutes, entries: count };
}

/** Entries belonging to a client, directly via the task or via the project. */
export function entriesForClient<T extends TimeEntryLike>(
  entries: readonly T[],
  clientId: string,
  taskClient: ReadonlyMap<string, string | null>,
  projectClient: ReadonlyMap<string, string | null>,
): T[] {
  return entries.filter(
    (e) =>
      (e.task_id != null && taskClient.get(e.task_id) === clientId) ||
      (e.project_id != null && projectClient.get(e.project_id) === clientId),
  );
}

/** "0m", "45m", "1h", "1h 05m", "12h 30m". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${String(rest).padStart(2, '0')}m`;
}

/** "0:07", "12:34", "1:02:03" for a live timer. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Parses "90", "1h", "1h30", "1:30", "1.5h", "45m" into minutes; null if invalid. */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+):(\d{1,2})$/.exec(s))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = /^(\d+(?:\.\d+)?)h(?:(\d{1,2})m?)?$/.exec(s))) {
    return Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0);
  }
  if ((m = /^(\d+)m?$/.exec(s))) return Number(m[1]);
  return null;
}
