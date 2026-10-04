import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeIcsText, feedEvents, foldLine } from './ics.ts';

describe('ics', () => {
  it('escapes text', () => {
    expect(escapeIcsText('a, b; c\\d\nnext')).toBe('a\\, b\\; c\\\\d\\nnext');
  });

  it('folds long lines at 75 octets, multibyte-safe', () => {
    const folded = foldLine(`SUMMARY:${'é'.repeat(60)}`);
    for (const part of folded.split('\r\n'))
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(
      folded
        .split('\r\n')
        .slice(1)
        .every((p) => p.startsWith(' ')),
    ).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'é'.repeat(60)}`);
    expect(foldLine('SHORT')).toBe('SHORT');
  });

  it('builds all-day events with stable UIDs and CRLF line endings', () => {
    const ics = buildCalendar({
      name: 'Due dates',
      events: [{ uid: 'task-1@notion2', date: '2026-10-31', summary: 'Logo, v2' }],
      now: new Date('2026-10-04T12:00:00.123Z'),
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261031\r\nDTEND;VALUE=DATE:20261101');
    expect(ics).toContain('DTSTAMP:20261004T120000Z');
    expect(ics).toContain('SUMMARY:Logo\\, v2');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
  });
});

describe('feedEvents', () => {
  it('includes open tasks, active projects and sent invoices inside the window', () => {
    const events = feedEvents({
      today: '2026-10-04',
      clientNames: new Map([['c1', 'Acme']]),
      tasks: [
        {
          id: 't1',
          title: 'Logo',
          status: 'todo',
          due_date: '2026-10-10',
          parent_task_id: null,
          client_id: 'c1',
          project_id: null,
        },
        {
          id: 't2',
          title: 'Done',
          status: 'done',
          due_date: '2026-10-10',
          parent_task_id: null,
          client_id: null,
          project_id: null,
        },
        {
          id: 't3',
          title: 'Sub',
          status: 'todo',
          due_date: '2026-10-10',
          parent_task_id: 't1',
          client_id: null,
          project_id: null,
        },
        {
          id: 't4',
          title: 'No date',
          status: 'todo',
          due_date: null,
          parent_task_id: null,
          client_id: null,
          project_id: null,
        },
        {
          id: 't5',
          title: 'Ancient',
          status: 'todo',
          due_date: '2026-01-01',
          parent_task_id: null,
          client_id: null,
          project_id: null,
        },
        {
          id: 't6',
          title: 'Overdue',
          status: 'doing',
          due_date: '2026-09-30',
          parent_task_id: null,
          client_id: null,
          project_id: null,
        },
      ],
      projects: [
        { id: 'p1', title: 'Rebrand', status: 'active', due_date: '2026-11-01', client_id: 'c1' },
        { id: 'p2', title: 'Old', status: 'done', due_date: '2026-11-01', client_id: null },
      ],
      invoices: [
        {
          id: 'i1',
          number: 'INV-0001',
          status: 'sent',
          due_date: '2026-10-18',
          client_name: 'Acme',
        },
        {
          id: 'i2',
          number: 'INV-0002',
          status: 'paid',
          due_date: '2026-10-18',
          client_name: 'Acme',
        },
      ],
    });
    expect(events.map((e) => [e.date, e.summary])).toEqual([
      ['2026-09-30', 'Overdue'],
      ['2026-10-10', 'Logo · Acme'],
      ['2026-10-18', 'Invoice INV-0001 due · Acme'],
      ['2026-11-01', 'Project due: Rebrand · Acme'],
    ]);
  });
});
