import type { OnboardingAnswers } from './schemas.ts';

/** What the model knows about the workspace. Ids let it link to existing entities. */
export interface WorkspaceContext {
  today: string;
  timezone: string;
  clients: { id: string; name: string; email: string | null; status: string }[];
  projects: { id: string; title: string; client_id: string | null }[];
  recent_tasks: { title: string; client_id: string | null; due_date: string | null }[];
}

export const CONTEXT_LIMITS = { clients: 100, projects: 100, recentTasks: 40 } as const;

export type InboxInputKind = 'text' | 'voice' | 'email' | 'image';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayName(isoDate: string): string {
  return WEEKDAYS[new Date(`${isoDate}T00:00:00Z`).getUTCDay()] ?? '';
}

/**
 * User/forwarded content can contain anything, including text that looks like our tags.
 * Neutralise closing tags so the input can never "escape" its delimiters.
 */
export function escapeUntrusted(text: string): string {
  return text.replace(/<\/?\s*(untrusted_input|workspace_context|clarification)\b/gi, (m) =>
    m.replace('<', '&lt;'),
  );
}

export function trimContext(context: WorkspaceContext): WorkspaceContext {
  return {
    ...context,
    clients: context.clients.slice(0, CONTEXT_LIMITS.clients),
    projects: context.projects.slice(0, CONTEXT_LIMITS.projects),
    recent_tasks: context.recent_tasks.slice(0, CONTEXT_LIMITS.recentTasks),
  };
}

export function renderInboxMessage(
  context: WorkspaceContext,
  input: { kind: InboxInputKind; text: string },
  clarification?: { question: string; answer: string },
): string {
  const ctx = trimContext(context);
  const parts = [
    `Today is ${weekdayName(ctx.today)} ${ctx.today} in the user's timezone (${ctx.timezone}).`,
    '<workspace_context>',
    JSON.stringify({
      clients: ctx.clients,
      projects: ctx.projects,
      recent_tasks: ctx.recent_tasks,
    }),
    '</workspace_context>',
    `<untrusted_input kind="${input.kind}">`,
    escapeUntrusted(input.text),
    '</untrusted_input>',
  ];
  if (clarification) {
    parts.push(
      '<clarification>',
      `You asked: ${escapeUntrusted(clarification.question)}`,
      `The user answered: ${escapeUntrusted(clarification.answer)}`,
      '</clarification>',
    );
  }
  return parts.join('\n');
}

export function renderOnboardingMessage(
  answers: OnboardingAnswers,
  today: string,
  timezone: string,
): string {
  return [
    `Today is ${weekdayName(today)} ${today} in the user's timezone (${timezone}).`,
    '<untrusted_input kind="onboarding_answers">',
    escapeUntrusted(
      JSON.stringify({
        what_they_do: answers.business_type,
        description: answers.business_description ?? '',
        active_clients: answers.client_count,
        biggest_admin_headaches: answers.headaches,
      }),
    ),
    '</untrusted_input>',
  ].join('\n');
}
