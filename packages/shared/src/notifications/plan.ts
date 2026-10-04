import { daysBetween, isValidTimeZone, todayInTimeZone, weekday } from '../dates/dates.ts';

export interface NotifyPrefs {
  digest: boolean;
  digest_hour: number;
  nudges: boolean;
}

export interface NotifyUser {
  user_id: string;
  timezone: string;
  prefs: NotifyPrefs;
  tokens: { token: string; last_digest_on: string | null }[];
}

export interface DaySnapshot {
  overdue: number;
  due_today: number;
  /** Titles of the most pressing open tasks (overdue first). */
  top_titles: string[];
  silent_clients: { client_id: string; name: string; last_contact_on: string }[];
}

export interface PlannedMessage {
  to: string;
  title: string;
  body: string;
  url: string;
}

export interface NotificationPlan {
  messages: PlannedMessage[];
  /** Tokens to stamp with `last_digest_on = today` so the digest goes out once a day. */
  stamp: string[];
  today: string;
}

const NUDGE_EVERY_DAYS = 7;

export function readNotifyPrefs(value: unknown): NotifyPrefs {
  const v = (typeof value === 'object' && value ? value : {}) as Record<string, unknown>;
  const hour =
    typeof v.digest_hour === 'number' && v.digest_hour >= 0 && v.digest_hour <= 23
      ? Math.floor(v.digest_hour)
      : 8;
  return { digest: v.digest !== false, digest_hour: hour, nudges: v.nudges !== false };
}

/** The user's local hour at `now`. */
export function localHour(timeZone: string, now: Date): number {
  const zone = isValidTimeZone(timeZone) ? timeZone : 'UTC';
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(h) % 24;
}

/** Whether this user is due a notification run at `now` (their chosen local hour). */
export function isDue(user: NotifyUser, now: Date): boolean {
  if (!user.prefs.digest && !user.prefs.nudges) return false;
  return localHour(user.timezone, now) === user.prefs.digest_hour;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * At most one notification per device per day, at the user's chosen hour:
 * - Monday: "Your weekly brief is ready" (opens the Brief)
 * - other days with work due: a short Today digest (opens Today)
 * - a follow-up nudge on the days a client's silence hits 7, 14, 21… days, never daily
 * Nothing is sent on a quiet day.
 */
export function planNotifications(
  user: NotifyUser,
  snapshot: DaySnapshot,
  now: Date,
): NotificationPlan {
  const today = todayInTimeZone(user.timezone, now);
  const tokens = user.tokens.filter((t) => t.last_digest_on !== today).map((t) => t.token);
  const empty = { messages: [], stamp: [], today };
  if (tokens.length === 0 || !isDue(user, now)) return empty;

  const nudge = user.prefs.nudges
    ? snapshot.silent_clients.find((c) => {
        const days = daysBetween(c.last_contact_on, today);
        return days >= NUDGE_EVERY_DAYS && days % NUDGE_EVERY_DAYS === 0;
      })
    : undefined;
  const nudgeLine = nudge
    ? `${nudge.name} hasn’t heard from you in ${daysBetween(nudge.last_contact_on, today)} days.`
    : null;
  const work = snapshot.overdue + snapshot.due_today;

  let message: Omit<PlannedMessage, 'to'> | null = null;
  if (user.prefs.digest && weekday(today) === 1) {
    message = {
      title: 'Your weekly brief is ready',
      body:
        [
          work
            ? `${plural(snapshot.due_today, 'task')} due today${snapshot.overdue ? `, ${snapshot.overdue} overdue` : ''}.`
            : null,
          nudgeLine,
        ]
          .filter(Boolean)
          .join(' ') || 'Your top priorities for the week, in one place.',
      url: '/brief',
    };
  } else if (user.prefs.digest && work > 0) {
    const [first, second] = snapshot.top_titles;
    const more = work - [first, second].filter(Boolean).length;
    message = {
      title: snapshot.overdue
        ? `Today: ${plural(work, 'task')}, ${snapshot.overdue} overdue`
        : `Today: ${plural(work, 'task')}`,
      body: [
        [first, second].filter(Boolean).join(' · ') + (more > 0 ? ` +${more} more` : ''),
        nudgeLine,
      ]
        .filter(Boolean)
        .join('\n'),
      url: '/',
    };
  } else if (nudge && nudgeLine) {
    message = {
      title: `Check in with ${nudge.name}?`,
      body: `${nudgeLine} Draft a quick follow-up in one tap.`,
      url: `/draft?kind=follow_up&clientId=${nudge.client_id}`,
    };
  }

  if (!message) return { messages: [], stamp: tokens, today };
  const m = message;
  return { messages: tokens.map((to) => ({ to, ...m })), stamp: tokens, today };
}
