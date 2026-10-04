import { addDays } from '../dates/dates.ts';
import { parseChecklist } from '../paste/parse-checklist.ts';
import type { WorkspaceContext } from './context.ts';
import type { ModelCall } from './runner.ts';
import type { AiProposal, ProposedChange } from './schemas.ts';

/**
 * A deterministic stand-in for the model, enabled server-side with AI_MOCK=1. Lets the
 * full pipeline (function -> ai_actions -> review -> apply -> undo) run in local dev and
 * e2e without an API key. Never used in production.
 */
export function mockInboxProposal(text: string, context: WorkspaceContext): AiProposal {
  const lower = text.toLowerCase();
  const client = context.clients.find((c) =>
    lower.includes(c.name.toLowerCase().split(' ')[0] ?? '~'),
  );
  const due = /\btomorrow\b/i.test(text)
    ? addDays(context.today, 1)
    : /\btoday\b/i.test(text)
      ? context.today
      : null;
  // Lines like "Acme needs:" introduce a list; they aren't tasks themselves.
  const all = parseChecklist(text).items;
  const items = all.length > 2 ? all.filter((i) => !i.title.endsWith(':')) : all;
  const titles =
    items.length >= 2
      ? items.slice(0, 10).map((i) => i.title)
      : [items[0]?.title ?? text.trim().slice(0, 120)];
  const changes: ProposedChange[] = titles.map((title, i) => ({
    op: 'create_task',
    ref: `c${i + 1}`,
    title,
    notes: null,
    client_id: client?.id ?? null,
    project_id: null,
    due_date: due,
    priority: 'none',
    subtasks: [],
  }));
  return {
    summary: `Mock proposal: ${changes.length} task${changes.length === 1 ? '' : 's'}${client ? ` for ${client.name}` : ''}.`,
    proposed_changes: changes,
    questions: [],
    confidence: 0.6,
  };
}

export function mockModel(produce: () => unknown): ModelCall {
  return async () => ({
    output: produce(),
    stopReason: 'end_turn',
    usage: { input_tokens: 0, output_tokens: 0 },
    model: 'mock',
  });
}
