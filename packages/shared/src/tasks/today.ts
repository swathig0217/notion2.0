import { daysBetween } from '../dates/dates.ts';
import type { TaskPriority, TaskStatus } from '../schemas/enums.ts';

export interface TodayTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string | null;
  priority: TaskPriority;
  client_id: string | null;
  parent_task_id: string | null;
  position: number;
  completed_at: string | null;
}

export interface TodayClient {
  id: string;
  name: string;
  color: string | null;
  status: 'active' | 'paused' | 'archived';
  last_contacted_at: string | null;
  created_at: string;
}

export interface TodayGroup<T extends TodayTask, C extends TodayClient> {
  client: C | null;
  tasks: T[];
}

export interface FollowUp<C extends TodayClient> {
  client: C;
  /** Days since last contact (or since the client was added, if never contacted). */
  daysSilent: number;
}

export interface TodayView<T extends TodayTask, C extends TodayClient> {
  groups: TodayGroup<T, C>[];
  overdueCount: number;
  dueTodayCount: number;
  /** Tasks completed today, so a just-completed task does not vanish under the user's thumb. */
  doneTodayCount: number;
  followUps: FollowUp<C>[];
}

export const DEFAULT_FOLLOW_UP_DAYS = 7;

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, med: 1, low: 2, none: 3 };

/** Calendar date of an ISO timestamp, interpreted in `timeZone`. */
function dateInZone(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return parts;
}

function compareTasks(a: TodayTask, b: TodayTask): number {
  // Open tasks first, then overdue before today, then priority, then manual order.
  const doneA = a.status === 'done' ? 1 : 0;
  const doneB = b.status === 'done' ? 1 : 0;
  if (doneA !== doneB) return doneA - doneB;
  const dueA = a.due_date ?? '9999-12-31';
  const dueB = b.due_date ?? '9999-12-31';
  if (dueA !== dueB) return dueA < dueB ? -1 : 1;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  return a.position - b.position;
}

/**
 * Builds the Today screen: top-level tasks that are overdue or due today, grouped by
 * client (clients alphabetically, "No client" last), plus active clients needing follow-up.
 */
export function buildToday<T extends TodayTask, C extends TodayClient>(input: {
  tasks: readonly T[];
  clients: readonly C[];
  today: string;
  timeZone: string;
  followUpDays?: number;
}): TodayView<T, C> {
  const { tasks, clients, today, timeZone } = input;
  const followUpDays = input.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS;
  const clientById = new Map(clients.map((c) => [c.id, c]));

  let overdueCount = 0;
  let dueTodayCount = 0;
  let doneTodayCount = 0;
  const byClient = new Map<string | null, T[]>();

  for (const task of tasks) {
    if (task.parent_task_id != null || task.due_date == null) continue;
    const isOpen = task.status !== 'done';
    const completedToday =
      !isOpen && task.completed_at != null && dateInZone(task.completed_at, timeZone) === today;

    let include = false;
    if (isOpen && task.due_date < today) {
      overdueCount++;
      include = true;
    } else if (isOpen && task.due_date === today) {
      dueTodayCount++;
      include = true;
    } else if (completedToday && task.due_date <= today) {
      doneTodayCount++;
      include = true;
    }
    if (!include) continue;

    const key = task.client_id != null && clientById.has(task.client_id) ? task.client_id : null;
    const list = byClient.get(key) ?? [];
    list.push(task);
    byClient.set(key, list);
  }

  const groups: TodayGroup<T, C>[] = [...byClient.entries()]
    .map(([clientId, list]) => ({
      client: clientId == null ? null : (clientById.get(clientId) ?? null),
      tasks: [...list].sort(compareTasks),
    }))
    .sort((a, b) => {
      if (a.client == null) return 1;
      if (b.client == null) return -1;
      return a.client.name.localeCompare(b.client.name);
    });

  const followUps = clients
    .filter((c) => c.status === 'active')
    .map((client) => {
      const since = dateInZone(client.last_contacted_at ?? client.created_at, timeZone);
      return { client, daysSilent: daysBetween(since, today) };
    })
    .filter((f) => f.daysSilent >= followUpDays)
    .sort((a, b) => b.daysSilent - a.daysSilent);

  return { groups, overdueCount, dueTodayCount, doneTodayCount, followUps };
}
