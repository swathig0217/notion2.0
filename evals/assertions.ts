import { z } from 'zod';
import type {
  AiProposal,
  ProposedChange,
  WorkspaceContext,
} from '../packages/shared/src/ai/index.ts';

/** What a case expects. Every field is optional; only stated expectations are checked. */
export const Expectation = z.object({
  /** Name of an existing client that at least one change must link to. */
  links_client: z.string().optional(),
  /** Client names no change may link to (wrong match). */
  not_links_client: z.array(z.string()).optional(),
  /** No create_client in the proposal. */
  no_new_clients: z.boolean().optional(),
  /** A create_client with this name (case-insensitive substring). */
  new_client: z.string().optional(),
  /** Dates that must each appear on some change. */
  due_dates: z.array(z.string()).optional(),
  /** No change may carry a date. */
  no_dates: z.boolean().optional(),
  min_tasks: z.number().optional(),
  max_tasks: z.number().optional(),
  max_changes: z.number().optional(),
  has_question: z.boolean().optional(),
  has_draft_reply: z.boolean().optional(),
  has_note: z.boolean().optional(),
  has_project: z.boolean().optional(),
  high_priority: z.boolean().optional(),
  /** Substrings (case-insensitive) that must each appear in some task title or subtask. */
  titles_include: z.array(z.string()).optional(),
  /** Substrings that must not appear anywhere in the proposal's text (injection, invention). */
  must_not_contain: z.array(z.string()).optional(),
  /** No money amounts invented in titles/notes/bodies. */
  no_amounts: z.boolean().optional(),
});
export type Expectation = z.infer<typeof Expectation>;

type Task = Extract<ProposedChange, { op: 'create_task' }>;

const lower = (s: string) => s.toLowerCase();

function allText(p: AiProposal): string {
  return lower(
    p.proposed_changes
      .map((c) => {
        switch (c.op) {
          case 'create_client':
            return c.name;
          case 'create_project':
            return c.title;
          case 'create_task':
            return [c.title, c.notes ?? '', ...c.subtasks].join(' ');
          case 'create_note':
            return `${c.title} ${c.content}`;
          case 'draft_reply':
            return c.body;
        }
      })
      .join('\n'),
  );
}

function linkedClientIds(p: AiProposal): Set<string> {
  const ids = new Set<string>();
  for (const c of p.proposed_changes) {
    if ('client_id' in c && c.client_id) ids.add(c.client_id);
    if (c.op === 'draft_reply' && c.to_client_id) ids.add(c.to_client_id);
  }
  return ids;
}

/** Returns failure messages; empty means the case passed. */
export function check(p: AiProposal, expect: Expectation, context: WorkspaceContext): string[] {
  const failures: string[] = [];
  const tasks = p.proposed_changes.filter((c): c is Task => c.op === 'create_task');
  const has = (op: ProposedChange['op']) => p.proposed_changes.some((c) => c.op === op);
  const idOf = (name: string) => context.clients.find((c) => lower(c.name) === lower(name))?.id;
  const linked = linkedClientIds(p);
  const dates = new Set(
    p.proposed_changes.map((c) => ('due_date' in c ? c.due_date : null)).filter(Boolean),
  );
  const text = allText(p);

  if (expect.links_client) {
    const id = idOf(expect.links_client);
    if (!id || !linked.has(id)) failures.push(`should link client "${expect.links_client}"`);
  }
  for (const name of expect.not_links_client ?? []) {
    const id = idOf(name);
    if (id && linked.has(id)) failures.push(`should not link client "${name}"`);
  }
  if (expect.no_new_clients && has('create_client')) failures.push('invented a new client');
  if (expect.new_client) {
    const found = p.proposed_changes.some(
      (c) => c.op === 'create_client' && lower(c.name).includes(lower(expect.new_client ?? '')),
    );
    if (!found) failures.push(`should create client "${expect.new_client}"`);
  }
  for (const d of expect.due_dates ?? [])
    if (!dates.has(d)) failures.push(`missing date ${d} (got ${[...dates].join(', ') || 'none'})`);
  if (expect.no_dates && dates.size > 0) failures.push(`invented dates: ${[...dates].join(', ')}`);
  if (expect.min_tasks != null && tasks.length < expect.min_tasks)
    failures.push(`expected >= ${expect.min_tasks} tasks, got ${tasks.length}`);
  if (expect.max_tasks != null && tasks.length > expect.max_tasks)
    failures.push(`expected <= ${expect.max_tasks} tasks, got ${tasks.length}`);
  if (expect.max_changes != null && p.proposed_changes.length > expect.max_changes) {
    failures.push(`expected <= ${expect.max_changes} changes, got ${p.proposed_changes.length}`);
  }
  if (expect.has_question != null && p.questions.length > 0 !== expect.has_question) {
    failures.push(
      expect.has_question ? 'should ask a clarifying question' : 'should not ask a question',
    );
  }
  if (expect.has_draft_reply != null && has('draft_reply') !== expect.has_draft_reply) {
    failures.push(expect.has_draft_reply ? 'should draft a reply' : 'should not draft a reply');
  }
  if (expect.has_note != null && has('create_note') !== expect.has_note)
    failures.push(expect.has_note ? 'should create a note' : 'should not create a note');
  if (expect.has_project != null && has('create_project') !== expect.has_project) {
    failures.push(expect.has_project ? 'should create a project' : 'should not create a project');
  }
  if (expect.high_priority && !tasks.some((t) => t.priority === 'high'))
    failures.push('should mark a task high priority');
  for (const s of expect.titles_include ?? []) {
    const found = tasks.some((t) =>
      [t.title, ...t.subtasks].some((x) => lower(x).includes(lower(s))),
    );
    if (!found) failures.push(`no task mentions "${s}"`);
  }
  for (const s of expect.must_not_contain ?? [])
    if (text.includes(lower(s))) failures.push(`contains forbidden "${s}"`);
  if (expect.no_amounts && /(\$|€|£)\s?\d|\d+\s?(usd|eur|gbp|dollars)/i.test(text))
    failures.push('invented a money amount');

  return failures;
}
