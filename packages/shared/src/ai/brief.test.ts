import { describe, expect, it } from 'vitest';
import {
  buildBriefData,
  fallbackBrief,
  sanitizeBrief,
  weekStart,
  type BriefTask,
} from './brief.ts';

const today = '2026-10-07'; // Wednesday
const t = (over: Partial<BriefTask> & { id: string }): BriefTask => ({
  title: over.id,
  status: 'todo',
  due_date: null,
  priority: 'none',
  client_id: null,
  parent_task_id: null,
  created_at: '2026-10-01T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
  completed_at: null,
  ...over,
});
const clients = [
  {
    id: 'acme',
    name: 'Acme',
    status: 'active',
    last_contacted_at: '2026-10-05T10:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'bolt',
    name: 'Bolt',
    status: 'active',
    last_contacted_at: '2026-09-20T10:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'old',
    name: 'Old',
    status: 'archived',
    last_contacted_at: null,
    created_at: '2025-01-01T00:00:00Z',
  },
];
const data = buildBriefData({
  today,
  clients,
  tasks: [
    t({ id: 'late', due_date: '2026-10-03', client_id: 'acme' }),
    t({ id: 'friday', due_date: '2026-10-09' }),
    t({ id: 'nextweek', due_date: '2026-10-14' }),
    t({ id: 'urgent', priority: 'high' }),
    t({ id: 'stuck', status: 'doing', updated_at: '2026-09-25T10:00:00Z' }),
    t({ id: 'ancient', created_at: '2026-09-01T10:00:00Z' }),
    t({ id: 'done', status: 'done', completed_at: '2026-10-06T10:00:00Z' }),
    t({ id: 'sub', parent_task_id: 'late', due_date: '2026-10-01' }),
  ],
});

describe('weekStart', () => {
  it('is the Monday of the week', () => {
    expect(weekStart('2026-10-07')).toBe('2026-10-05');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
    expect(weekStart('2026-10-11')).toBe('2026-10-05'); // Sunday
  });
});

describe('buildBriefData', () => {
  it('finds overdue, due this week, stale and silent clients', () => {
    expect(data.week_start).toBe('2026-10-05');
    expect(data.overdue.map((x) => x.id)).toEqual(['late']);
    expect(data.overdue[0]?.client).toBe('Acme');
    expect(data.due_this_week.map((x) => x.id)).toEqual(['friday']); // 14th is 7 days out
    expect(data.stale.map((x) => x.id).sort()).toEqual(['ancient', 'stuck']);
    expect(data.silent_clients).toEqual([{ client_id: 'bolt', name: 'Bolt', days_silent: 17 }]);
    expect(data.completed_last_7_days).toBe(1);
  });
  it('builds deduplicated candidates without subtasks', () => {
    expect(data.candidates.map((x) => x.id)).toEqual([
      'late',
      'urgent',
      'friday',
      'stuck',
      'ancient',
    ]);
  });
});

it('looks 7 days ahead, so a Sunday brief still sees Monday', () => {
  const sunday = buildBriefData({
    today: '2026-10-11',
    clients: [],
    tasks: [t({ id: 'monday', due_date: '2026-10-12' })],
  });
  expect(sunday.due_this_week.map((x) => x.id)).toEqual(['monday']);
});

describe('sanitizeBrief', () => {
  it('keeps only candidate tasks and silent clients, deduplicated, max 5', () => {
    const issues: string[] = [];
    const out = sanitizeBrief(
      {
        headline: ' Busy  week ',
        priorities: [
          { task_id: 'late', why: 'Overdue' },
          { task_id: 'invented', why: 'x' },
          { task_id: 'late', why: 'again' },
          { task_id: 'friday', why: 'Due Friday' },
        ],
        follow_ups: [
          { client_id: 'bolt', why: 'quiet' },
          { client_id: 'acme', why: 'not silent' },
        ],
      },
      data,
      issues,
    );
    expect(out).toEqual({
      headline: 'Busy week',
      priorities: [
        { task_id: 'late', why: 'Overdue' },
        { task_id: 'friday', why: 'Due Friday' },
      ],
      follow_ups: [{ client_id: 'bolt', why: 'quiet' }],
    });
    expect(issues).toContain('unknown_or_duplicate_task');
  });
  it('rejects a brief with no valid priorities when there are candidates', () => {
    expect(
      typeof sanitizeBrief(
        { headline: 'h', priorities: [{ task_id: 'nope', why: 'x' }], follow_ups: [] },
        data,
        [],
      ),
    ).toBe('string');
  });
});

describe('fallbackBrief', () => {
  it('ranks overdue, then high priority, then due soon', () => {
    const b = fallbackBrief(data);
    expect(b.priorities.map((p) => p.task_id).slice(0, 3)).toEqual(['late', 'urgent', 'friday']);
    expect(b.priorities[0]?.why).toBe('Overdue, Acme is waiting');
    expect(b.headline).toBe('This week: 1 overdue, 1 due this week, 1 client to check in with.');
    expect(b.follow_ups).toEqual([{ client_id: 'bolt', why: 'No contact in 17 days' }]);
  });
  it('is calm when nothing is pressing', () => {
    const empty = buildBriefData({ today, clients: [], tasks: [] });
    expect(fallbackBrief(empty).headline).toBe('A clear week. Nothing overdue or urgent.');
  });
});
