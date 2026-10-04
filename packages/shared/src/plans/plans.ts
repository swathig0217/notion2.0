import { z } from 'zod';

/**
 * Plans. Limits are enforced server-side (`public.plan_limits()` in the Phase 4 migration,
 * checked by a DB trigger and the edge functions); these mirror them for the UI.
 */
export const FREE_LIMITS = { active_clients: 3, ai_actions_per_month: 30 } as const;

/** Prices in cents (USD). Shown on the paywall and the landing page. */
export const PRO_PRICES = { month: 1200, year: 9600 } as const;
export type BillingInterval = keyof typeof PRO_PRICES;

/** AI action types that count toward the monthly limit. Onboarding and the brief are free. */
export const METERED_AI_TYPES = ['process_inbox', 'client_update', 'follow_up'] as const;

/** Onboarding's sample clients ("… (sample)") don't count toward the client limit. */
export function isSampleClientName(name: string): boolean {
  return name.endsWith(' (sample)');
}

/** Result of `rpc('workspace_usage')`. */
export const Usage = z.object({
  plan: z.enum(['free', 'pro']),
  active_clients: z.number().int(),
  client_limit: z.number().int().nullable(),
  ai_actions_used: z.number().int(),
  ai_action_limit: z.number().int().nullable(),
  period_start: z.string(),
});
export type Usage = z.infer<typeof Usage>;

export type LimitKind = 'clients' | 'ai';

/** True when adding one more real active client would exceed the plan. */
export function atClientLimit(usage: Usage | undefined): boolean {
  return usage?.client_limit != null && usage.active_clients >= usage.client_limit;
}

/** AI actions left this month; null = unlimited. */
export function aiActionsLeft(usage: Usage | undefined): number | null {
  if (!usage || usage.ai_action_limit == null) return null;
  return Math.max(0, usage.ai_action_limit - usage.ai_actions_used);
}

/** Yearly saving vs paying monthly, as a whole percentage (33 for $96 vs $144). */
export function yearlySavingPct(): number {
  return Math.round((1 - PRO_PRICES.year / (PRO_PRICES.month * 12)) * 100);
}

/** Error codes returned by edge functions and the database for plan limits. */
export const PLAN_LIMIT_CODE = 'plan_limit';
export const CLIENT_LIMIT_DB_MESSAGE = 'plan_limit_clients';

export function isClientLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(CLIENT_LIMIT_DB_MESSAGE);
}
