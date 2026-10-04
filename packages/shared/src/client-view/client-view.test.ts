import { describe, expect, it } from 'vitest';
import {
  ClientView,
  buildClientView,
  isShareToken,
  shareTokenFromBytes,
  shareUrl,
  visibleTasks,
  type ViewTaskRow,
} from './client-view.ts';

const now = new Date('2026-10-04T12:00:00Z');
const task = (over: Partial<ViewTaskRow>): ViewTaskRow => ({
  id: 't',
  title: 'Task',
  status: 'todo',
  due_date: null,
  parent_task_id: null,
  completed_at: null,
  updated_at: '2026-10-01T00:00:00Z',
  ...over,
});

describe('share tokens', () => {
  it('formats 16 random bytes as 32 hex chars', () => {
    const token = shareTokenFromBytes(new Uint8Array(16).fill(171));
    expect(token).toBe('ab'.repeat(16));
    expect(isShareToken(token)).toBe(true);
    expect(() => shareTokenFromBytes(new Uint8Array(8))).toThrow();
  });
  it('rejects anything else', () => {
    expect(isShareToken('AB'.repeat(16))).toBe(false);
    expect(isShareToken('ab'.repeat(15))).toBe(false);
    expect(isShareToken("' or 1=1")).toBe(false);
    expect(isShareToken(undefined)).toBe(false);
  });
  it('builds the link', () => {
    expect(shareUrl('https://app.example.com/', 'ab'.repeat(16))).toBe(
      `https://app.example.com/p/${'ab'.repeat(16)}`,
    );
  });
});

describe('visibleTasks', () => {
  it('shows top-level, unhidden tasks; done only when recent; open work first', () => {
    const tasks = [
      task({
        id: 'a',
        title: 'Done long ago',
        status: 'done',
        completed_at: '2026-08-01T00:00:00Z',
      }),
      task({
        id: 'b',
        title: 'Done recently',
        status: 'done',
        completed_at: '2026-10-02T00:00:00Z',
      }),
      task({ id: 'c', title: 'Later', due_date: '2026-10-20' }),
      task({ id: 'd', title: 'Soon', due_date: '2026-10-06' }),
      task({ id: 'e', title: 'In progress', status: 'doing' }),
      task({ id: 'f', title: 'Subtask', parent_task_id: 'c' }),
      task({ id: 'g', title: 'Private: chase payment' }),
    ];
    expect(visibleTasks(tasks, ['g'], now).map((t) => t.title)).toEqual([
      'In progress',
      'Soon',
      'Later',
      'Done recently',
    ]);
  });
});

describe('buildClientView', () => {
  it('exposes only allowlisted fields', () => {
    const view = buildClientView({
      project: { title: 'Rebrand', status: 'active', due_date: '2026-11-01' },
      clientName: 'Acme',
      from: 'Jordan',
      tasks: [
        task({
          id: 'a',
          title: 'Logo',
          status: 'done',
          completed_at: '2026-10-03T00:00:00Z',
          updated_at: '2026-10-03T00:00:00Z',
        }),
        task({ id: 'b', title: 'Website' }),
      ],
      hiddenTaskIds: [],
      now,
    });
    expect(ClientView.parse(view)).toEqual(view);
    expect(view.progress).toEqual({ done: 1, total: 2 });
    expect(view.updated_at).toBe('2026-10-03T00:00:00Z');
    expect(Object.keys(view.tasks[0] ?? {})).toEqual(['title', 'status', 'due_date']);
  });
});
