import { describe, expect, it } from 'vitest';
import { buildToday, type TodayClient, type TodayTask } from './today';

const today = '2026-10-03';
const tz = 'America/New_York';

function task(overrides: Partial<TodayTask> & { id: string }): TodayTask {
  return {
    title: overrides.id,
    status: 'todo',
    due_date: today,
    priority: 'none',
    client_id: null,
    parent_task_id: null,
    position: 1024,
    completed_at: null,
    ...overrides,
  };
}

function client(overrides: Partial<TodayClient> & { id: string; name: string }): TodayClient {
  return {
    color: null,
    status: 'active',
    last_contacted_at: '2026-10-02T12:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildToday', () => {
  const acme = client({ id: 'acme', name: 'Acme' });
  const bolt = client({ id: 'bolt', name: 'Bolt Studio' });

  it('includes overdue and due-today tasks, excludes future and undated', () => {
    const view = buildToday({
      tasks: [
        task({ id: 'overdue', due_date: '2026-10-01' }),
        task({ id: 'today' }),
        task({ id: 'future', due_date: '2026-10-04' }),
        task({ id: 'undated', due_date: null }),
      ],
      clients: [],
      today,
      timeZone: tz,
    });
    expect(view.groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['overdue', 'today']);
    expect(view.overdueCount).toBe(1);
    expect(view.dueTodayCount).toBe(1);
  });

  it('groups by client alphabetically with "no client" last', () => {
    const view = buildToday({
      tasks: [
        task({ id: 'none' }),
        task({ id: 'b', client_id: 'bolt' }),
        task({ id: 'a', client_id: 'acme' }),
      ],
      clients: [bolt, acme],
      today,
      timeZone: tz,
    });
    expect(view.groups.map((g) => g.client?.name ?? null)).toEqual(['Acme', 'Bolt Studio', null]);
  });

  it('treats tasks for unknown clients as "no client"', () => {
    const view = buildToday({
      tasks: [task({ id: 'x', client_id: 'deleted' })],
      clients: [],
      today,
      timeZone: tz,
    });
    expect(view.groups[0]?.client).toBeNull();
  });

  it('excludes subtasks (they live inside their parent)', () => {
    const view = buildToday({
      tasks: [task({ id: 'p' }), task({ id: 'c', parent_task_id: 'p' })],
      clients: [],
      today,
      timeZone: tz,
    });
    expect(view.groups[0]?.tasks.map((t) => t.id)).toEqual(['p']);
  });

  it('sorts open before done, overdue first, then priority, then position', () => {
    const view = buildToday({
      tasks: [
        task({ id: 'done', status: 'done', completed_at: '2026-10-03T15:00:00Z' }),
        task({ id: 'low', priority: 'low', position: 1 }),
        task({ id: 'high', priority: 'high', position: 2 }),
        task({ id: 'old', due_date: '2026-09-01', priority: 'none' }),
        task({ id: 'low2', priority: 'low', position: 0 }),
      ],
      clients: [],
      today,
      timeZone: tz,
    });
    expect(view.groups[0]?.tasks.map((t) => t.id)).toEqual(['old', 'high', 'low2', 'low', 'done']);
    expect(view.doneTodayCount).toBe(1);
  });

  it('keeps tasks completed today (in the user timezone) visible', () => {
    // 2026-10-04T02:00Z is still Oct 3 in New York.
    const view = buildToday({
      tasks: [
        task({ id: 'late-night', status: 'done', completed_at: '2026-10-04T02:00:00Z' }),
        task({ id: 'yesterday', status: 'done', completed_at: '2026-10-02T15:00:00Z' }),
      ],
      clients: [],
      today,
      timeZone: tz,
    });
    expect(view.groups.flatMap((g) => g.tasks.map((t) => t.id))).toEqual(['late-night']);
  });

  it('lists active clients silent for N+ days, most silent first', () => {
    const view = buildToday({
      tasks: [],
      clients: [
        client({ id: 'fresh', name: 'Fresh', last_contacted_at: '2026-10-01T12:00:00Z' }),
        client({ id: 'stale', name: 'Stale', last_contacted_at: '2026-09-20T12:00:00Z' }),
        client({ id: 'staler', name: 'Staler', last_contacted_at: '2026-09-01T12:00:00Z' }),
        client({
          id: 'paused',
          name: 'Paused',
          status: 'paused',
          last_contacted_at: '2026-01-01T12:00:00Z',
        }),
        client({
          id: 'never',
          name: 'Never',
          last_contacted_at: null,
          created_at: '2026-09-25T12:00:00Z',
        }),
      ],
      today,
      timeZone: tz,
    });
    expect(view.followUps.map((f) => [f.client.id, f.daysSilent])).toEqual([
      ['staler', 32],
      ['stale', 13],
      ['never', 8],
    ]);
  });

  it('respects a custom follow-up threshold', () => {
    const view = buildToday({
      tasks: [],
      clients: [client({ id: 'a', name: 'A', last_contacted_at: '2026-09-30T12:00:00Z' })],
      today,
      timeZone: tz,
      followUpDays: 3,
    });
    expect(view.followUps).toHaveLength(1);
  });
});
