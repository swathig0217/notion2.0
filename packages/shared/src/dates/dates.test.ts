import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDueLabel,
  isDueToday,
  isIsoDate,
  isOverdue,
  isValidTimeZone,
  nextWeekday,
  todayInTimeZone,
  weekday,
} from './dates';

describe('todayInTimeZone', () => {
  // 2026-10-05T02:30Z is still Oct 4 in New York and already Oct 5 in Tokyo.
  const instant = new Date('2026-10-05T02:30:00Z');

  it('uses the user timezone, not UTC', () => {
    expect(todayInTimeZone('America/New_York', instant)).toBe('2026-10-04');
    expect(todayInTimeZone('Asia/Tokyo', instant)).toBe('2026-10-05');
    expect(todayInTimeZone('UTC', instant)).toBe('2026-10-05');
  });

  it('handles half-hour offsets', () => {
    expect(todayInTimeZone('Asia/Kolkata', new Date('2026-10-04T18:29:00Z'))).toBe('2026-10-04');
    expect(todayInTimeZone('Asia/Kolkata', new Date('2026-10-04T18:30:00Z'))).toBe('2026-10-05');
  });

  it('falls back to UTC for an invalid zone', () => {
    expect(todayInTimeZone('Not/AZone', instant)).toBe('2026-10-05');
  });
});

describe('date arithmetic', () => {
  it('validates ISO dates including impossible days', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST start
    expect(addDays('2026-11-01', -1)).toBe('2026-10-31'); // US DST end
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-08')).toBe(7);
    expect(daysBetween('2026-10-08', '2026-10-01')).toBe(-7);
  });

  it('computes weekdays', () => {
    expect(weekday('2026-10-05')).toBe(1); // Monday
  });

  it('finds the next weekday strictly after today', () => {
    expect(nextWeekday('2026-10-03', 1)).toBe('2026-10-05'); // Sat -> Mon
    expect(nextWeekday('2026-10-05', 1)).toBe('2026-10-12'); // Mon -> next Mon
  });

  it('rejects malformed input', () => {
    expect(() => addDays('nope', 1)).toThrow();
  });

  it('checks timezones', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
  });
});

describe('overdue and due today', () => {
  const today = '2026-10-03';
  it('classifies due dates', () => {
    expect(isOverdue('2026-10-02', today)).toBe(true);
    expect(isOverdue('2026-10-03', today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
    expect(isDueToday('2026-10-03', today)).toBe(true);
    expect(isDueToday(undefined, today)).toBe(false);
  });
});

describe('formatDueLabel', () => {
  const today = '2026-10-03';
  it.each([
    ['2026-10-03', 'Today'],
    ['2026-10-04', 'Tomorrow'],
    ['2026-10-02', 'Yesterday'],
    ['2026-09-28', '5d overdue'],
    ['2026-10-06', 'Tue'],
    ['2026-10-20', 'Oct 20'],
    ['2027-01-15', 'Jan 15, 2027'],
  ])('%s -> %s', (due, label) => {
    expect(formatDueLabel(due, today)).toBe(label);
  });
});
