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

// ---------------------------------------------------------------------------
// Drafts (client updates and follow-ups)
// ---------------------------------------------------------------------------
export const DraftExpectation = z.object({
  /** At least one of these (case-insensitive) must appear in the body. */
  mentions_any: z.array(z.string()).optional(),
  /** Each of these must appear. */
  mentions_all: z.array(z.string()).optional(),
  must_not_contain: z.array(z.string()).optional(),
  max_words: z.number().optional(),
  min_words: z.number().optional(),
  greets: z.string().optional(),
  signs: z.string().optional(),
  no_amounts: z.boolean().optional(),
  no_dates_except: z.array(z.string()).optional(),
});
export type DraftExpectation = z.infer<typeof DraftExpectation>;

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

export function checkDraft(
  d: { subject: string; body: string },
  expect: DraftExpectation,
): string[] {
  const failures: string[] = [];
  const body = d.body.toLowerCase();
  const words = d.body.split(/\s+/).filter(Boolean).length;
  if (expect.mentions_any && !expect.mentions_any.some((s) => body.includes(s.toLowerCase()))) {
    failures.push(`mentions none of: ${expect.mentions_any.join(', ')}`);
  }
  for (const s of expect.mentions_all ?? [])
    if (!body.includes(s.toLowerCase())) failures.push(`missing "${s}"`);
  for (const s of expect.must_not_contain ?? [])
    if (`${d.subject} ${d.body}`.toLowerCase().includes(s.toLowerCase()))
      failures.push(`contains forbidden "${s}"`);
  if (expect.max_words != null && words > expect.max_words)
    failures.push(`${words} words > ${expect.max_words}`);
  if (expect.min_words != null && words < expect.min_words)
    failures.push(`${words} words < ${expect.min_words}`);
  if (expect.greets && !body.slice(0, 40).includes(expect.greets.toLowerCase()))
    failures.push(`does not greet "${expect.greets}"`);
  if (expect.signs && !body.slice(-60).includes(expect.signs.toLowerCase()))
    failures.push(`not signed "${expect.signs}"`);
  if (expect.no_amounts && /(\$|€|£)\s?\d|\d+\s?(usd|eur|gbp|dollars)/i.test(d.body))
    failures.push('invented a money amount');
  if (expect.no_dates_except) {
    const allowed = expect.no_dates_except.map((s) => s.toLowerCase());
    const found =
      d.body.match(
        new RegExp(
          `\\b(\\d{4}-\\d{2}-\\d{2}|(?:${MONTHS})[a-z]*\\.? \\d{1,2}(?:st|nd|rd|th)?)\\b`,
          'gi',
        ),
      ) ?? [];
    const bad = found.filter((f) => !allowed.some((a) => f.toLowerCase().includes(a)));
    if (bad.length) failures.push(`mentions dates not in context: ${bad.join(', ')}`);
  }
  return failures;
}

// ---------------------------------------------------------------------------
// Weekly brief
// ---------------------------------------------------------------------------
export const BriefExpectation = z.object({
  /** The first priority must be one of these task ids. */
  first_priority_in: z.array(z.string()).optional(),
  /** These task ids must appear somewhere in the priorities. */
  includes: z.array(z.string()).optional(),
  excludes: z.array(z.string()).optional(),
  max_priorities: z.number().optional(),
  min_priorities: z.number().optional(),
  follow_ups_include: z.array(z.string()).optional(),
  headline_must_not_contain: z.array(z.string()).optional(),
});
export type BriefExpectation = z.infer<typeof BriefExpectation>;

export function checkBrief(
  b: { headline: string; priorities: { task_id: string }[]; follow_ups: { client_id: string }[] },
  expect: BriefExpectation,
): string[] {
  const failures: string[] = [];
  const ids = b.priorities.map((p) => p.task_id);
  if (expect.first_priority_in && !expect.first_priority_in.includes(ids[0] ?? '')) {
    failures.push(
      `first priority ${ids[0] ?? 'none'} not in [${expect.first_priority_in.join(', ')}]`,
    );
  }
  for (const id of expect.includes ?? [])
    if (!ids.includes(id)) failures.push(`missing priority ${id}`);
  for (const id of expect.excludes ?? [])
    if (ids.includes(id)) failures.push(`should not prioritize ${id}`);
  if (expect.max_priorities != null && ids.length > expect.max_priorities)
    failures.push(`${ids.length} priorities > ${expect.max_priorities}`);
  if (expect.min_priorities != null && ids.length < expect.min_priorities)
    failures.push(`${ids.length} priorities < ${expect.min_priorities}`);
  for (const id of expect.follow_ups_include ?? [])
    if (!b.follow_ups.some((f) => f.client_id === id)) failures.push(`missing follow-up ${id}`);
  for (const s of expect.headline_must_not_contain ?? [])
    if (b.headline.toLowerCase().includes(s.toLowerCase()))
      failures.push(`headline contains "${s}"`);
  return failures;
}
