import { describe, expect, it } from 'vitest';
import {
  isDue,
  localHour,
  planNotifications,
  readNotifyPrefs,
  type DaySnapshot,
  type NotifyUser,
} from './plan.ts';

const user = (over: Partial<NotifyUser> = {}): NotifyUser => ({
  user_id: 'u',
  timezone: 'America/New_York',
  prefs: { digest: true, digest_hour: 8, nudges: true },
  tokens: [{ token: 'tok', last_digest_on: null }],
  ...over,
});
const snap = (over: Partial<DaySnapshot> = {}): DaySnapshot => ({
  overdue: 1,
  due_today: 2,
  top_titles: ['Send invoice', 'Logo concepts'],
  silent_clients: [],
  ...over,
});
// 2026-10-06 is a Tuesday. 12:00Z = 08:00 in New York (EDT).
const tue8am = new Date('2026-10-06T12:00:00Z');
const mon8am = new Date('2026-10-05T12:00:00Z');

describe('timing', () => {
  it('computes the local hour in the user timezone', () => {
    expect(localHour('America/New_York', tue8am)).toBe(8);
    expect(localHour('Asia/Kolkata', tue8am)).toBe(17);
  });
  it('is due only at the chosen hour', () => {
    expect(isDue(user(), tue8am)).toBe(true);
    expect(isDue(user(), new Date('2026-10-06T13:00:00Z'))).toBe(false);
    expect(isDue(user({ prefs: { digest: false, digest_hour: 8, nudges: false } }), tue8am)).toBe(
      false,
    );
  });
  it('reads prefs defensively', () => {
    expect(readNotifyPrefs(null)).toEqual({ digest: true, digest_hour: 8, nudges: true });
    expect(readNotifyPrefs({ digest: false, digest_hour: 99 })).toEqual({
      digest: false,
      digest_hour: 8,
      nudges: true,
    });
  });
});

describe('planNotifications', () => {
  it('sends a Today digest with the top tasks', () => {
    const plan = planNotifications(user(), snap({ due_today: 3, top_titles: ['A', 'B'] }), tue8am);
    expect(plan.messages).toEqual([
      { to: 'tok', title: 'Today: 4 tasks, 1 overdue', body: 'A · B +2 more', url: '/' },
    ]);
    expect(plan.stamp).toEqual(['tok']);
    expect(plan.today).toBe('2026-10-06');
  });

  it('sends once per day per device', () => {
    const plan = planNotifications(
      user({ tokens: [{ token: 'tok', last_digest_on: '2026-10-06' }] }),
      snap(),
      tue8am,
    );
    expect(plan.messages).toEqual([]);
  });

  it('announces the weekly brief on Mondays', () => {
    const plan = planNotifications(user(), snap(), mon8am);
    expect(plan.messages[0]).toMatchObject({ title: 'Your weekly brief is ready', url: '/brief' });
  });

  it('stays quiet on a quiet day, but still stamps the device', () => {
    const plan = planNotifications(
      user(),
      snap({ overdue: 0, due_today: 0, top_titles: [] }),
      tue8am,
    );
    expect(plan.messages).toEqual([]);
    expect(plan.stamp).toEqual(['tok']);
  });

  it('nudges only when silence hits a multiple of 7 days', () => {
    const quiet = { overdue: 0, due_today: 0, top_titles: [] };
    const at14 = planNotifications(
      user(),
      snap({
        ...quiet,
        silent_clients: [{ client_id: 'b', name: 'Bolt', last_contact_on: '2026-09-22' }],
      }),
      tue8am,
    );
    expect(at14.messages[0]).toEqual({
      to: 'tok',
      title: 'Check in with Bolt?',
      body: 'Bolt hasn’t heard from you in 14 days. Draft a quick follow-up in one tap.',
      url: '/draft?kind=follow_up&clientId=b',
    });
    const at15 = planNotifications(
      user(),
      snap({
        ...quiet,
        silent_clients: [{ client_id: 'b', name: 'Bolt', last_contact_on: '2026-09-21' }],
      }),
      tue8am,
    );
    expect(at15.messages).toEqual([]);
  });

  it('adds the nudge line to the digest instead of sending two notifications', () => {
    const plan = planNotifications(
      user(),
      snap({ silent_clients: [{ client_id: 'b', name: 'Bolt', last_contact_on: '2026-09-29' }] }),
      tue8am,
    );
    expect(plan.messages).toHaveLength(1);
    expect(plan.messages[0]?.body).toContain('Bolt hasn’t heard from you in 7 days.');
  });

  it('respects nudges off and digest off', () => {
    const silent = [{ client_id: 'b', name: 'Bolt', last_contact_on: '2026-09-29' }];
    expect(
      planNotifications(
        user({ prefs: { digest: true, digest_hour: 8, nudges: false } }),
        snap({ silent_clients: silent }),
        tue8am,
      ).messages[0]?.body,
    ).not.toContain('Bolt');
    expect(
      planNotifications(
        user({ prefs: { digest: false, digest_hour: 8, nudges: true } }),
        snap({ silent_clients: [] }),
        tue8am,
      ).messages,
    ).toEqual([]);
  });
});
