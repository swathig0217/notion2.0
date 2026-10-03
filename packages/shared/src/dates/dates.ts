/**
 * Calendar-date helpers. Due dates are plain `YYYY-MM-DD` strings (no time, no zone);
 * "today" is always computed in the user's IANA timezone so overdue/today boundaries
 * match the user's wall clock, not the server's.
 */

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date in `timeZone` at instant `now`. Falls back to UTC for invalid zones. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function toUtcMs(date: string): number {
  const m = ISO_DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  return fromUtcMs(toUtcMs(value)) === value;
}

export function addDays(date: string, days: number): string {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekday(date: string): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function isOverdue(due: string | null | undefined, today: string): boolean {
  return due != null && due < today;
}

export function isDueToday(due: string | null | undefined, today: string): boolean {
  return due === today;
}

/** Short human label for a due date relative to `today`. */
export function formatDueLabel(due: string, today: string, locale = 'en-US'): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff}d overdue`;
  const opts: Intl.DateTimeFormatOptions =
    diff < 7
      ? { weekday: 'short', timeZone: 'UTC' }
      : { month: 'short', day: 'numeric', timeZone: 'UTC' };
  if (diff >= 7 && due.slice(0, 4) !== today.slice(0, 4)) opts.year = 'numeric';
  return new Intl.DateTimeFormat(locale, opts).format(new Date(toUtcMs(due)));
}

/** The next occurrence of `targetWeekday` strictly after `today` (for "snooze to Monday"). */
export function nextWeekday(today: string, targetWeekday: number): string {
  const diff = (targetWeekday - weekday(today) + 7) % 7 || 7;
  return addDays(today, diff);
}
