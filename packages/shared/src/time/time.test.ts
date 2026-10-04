import { describe, expect, it } from 'vitest';
import {
  MAX_ENTRY_MINUTES,
  entriesForClient,
  entryMinutes,
  formatClock,
  formatDuration,
  manualFields,
  parseDuration,
  runningEntry,
  stopFields,
  totalMinutes,
  type TimeEntryLike,
} from './time.ts';

const e = (over: Partial<TimeEntryLike>): TimeEntryLike => ({
  id: 'e',
  task_id: null,
  project_id: null,
  started_at: '2026-10-05T10:00:00Z',
  ended_at: '2026-10-05T10:30:00Z',
  minutes: 30,
  billable: true,
  ...over,
});
const now = new Date('2026-10-05T11:00:00Z');

describe('time entries', () => {
  it('counts a running timer up to now', () => {
    expect(entryMinutes(e({ ended_at: null, minutes: null }), now)).toBe(60);
  });
  it('uses stored minutes for stopped entries', () => {
    expect(entryMinutes(e({ minutes: 42 }), now)).toBe(42);
  });
  it('caps runaway timers', () => {
    expect(
      entryMinutes(e({ started_at: '2026-10-01T00:00:00Z', ended_at: null, minutes: null }), now),
    ).toBe(MAX_ENTRY_MINUTES);
  });
  it('finds the running entry', () => {
    expect(runningEntry([e({ id: 'a' }), e({ id: 'b', ended_at: null })])?.id).toBe('b');
  });
  it('stops with rounded minutes', () => {
    expect(stopFields(e({ started_at: '2026-10-05T10:59:31Z' }), now)).toEqual({
      ended_at: now.toISOString(),
      minutes: 0,
    });
    expect(stopFields(e({ started_at: '2026-10-05T10:15:00Z' }), now).minutes).toBe(45);
  });
  it('builds manual entries ending now', () => {
    expect(manualFields(90, now)).toEqual({
      started_at: '2026-10-05T09:30:00.000Z',
      ended_at: now.toISOString(),
      minutes: 90,
    });
  });
  it('totals with billable split and a since filter', () => {
    const t = totalMinutes(
      [
        e({ minutes: 30 }),
        e({ minutes: 60, billable: false }),
        e({ started_at: '2026-09-01T00:00:00Z', minutes: 500 }),
      ],
      now,
      '2026-10-01',
    );
    expect(t).toEqual({ minutes: 90, billableMinutes: 30, entries: 2 });
  });
  it('attributes entries to a client via task or project', () => {
    const entries = [
      e({ id: '1', task_id: 't1' }),
      e({ id: '2', project_id: 'p1' }),
      e({ id: '3', task_id: 't2' }),
    ];
    const got = entriesForClient(
      entries,
      'acme',
      new Map([
        ['t1', 'acme'],
        ['t2', 'bolt'],
      ]),
      new Map([['p1', 'acme']]),
    );
    expect(got.map((x) => x.id)).toEqual(['1', '2']);
  });
});

describe('formatting and parsing', () => {
  it.each([
    [0, '0m'],
    [45, '45m'],
    [60, '1h'],
    [65, '1h 05m'],
    [750, '12h 30m'],
  ])('formatDuration(%i) = %s', (m, s) => expect(formatDuration(m)).toBe(s));

  it.each([
    [7, '0:07'],
    [754, '12:34'],
    [3723, '1:02:03'],
  ])('formatClock(%i) = %s', (s, out) => expect(formatClock(s)).toBe(out));

  it.each([
    ['90', 90],
    ['45m', 45],
    ['1h', 60],
    ['1h30', 90],
    ['1h 30m', 90],
    ['1:15', 75],
    ['1.5h', 90],
    ['', null],
    ['abc', null],
  ])('parseDuration(%j) = %s', (input, out) => expect(parseDuration(input)).toBe(out));
});
