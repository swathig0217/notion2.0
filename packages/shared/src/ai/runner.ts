import type { z } from 'zod';
import { AiProposal, type StoredProposal } from './schemas.ts';
import { sanitizeProposal, type SanitizeOptions } from './guardrails.ts';

export interface ModelRequest {
  system: string;
  user: string;
  /** Zod schema the adapter turns into a structured-output format. */
  schema: typeof AiProposal;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelResult {
  /** Parsed JSON output, or null when the model produced none. */
  output: unknown;
  stopReason: string | null;
  usage: ModelUsage;
  model: string;
}

/** Injected so the same logic runs in Deno (edge functions), Node (evals) and tests. */
export type ModelCall = (request: ModelRequest) => Promise<ModelResult>;

export interface RunResult {
  proposal: StoredProposal;
  usage: ModelUsage;
  attempts: number;
  model: string | null;
  /** Guardrail corrections and failure reasons (no user content). */
  issues: string[];
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * Propose -> validate -> (retry once) -> fallback. Never throws for model problems: the
 * caller always gets a proposal it can show for review.
 */
export async function runProposal(args: {
  call: ModelCall;
  system: string;
  user: string;
  effort: ModelRequest['effort'];
  maxTokens?: number;
  sanitize: SanitizeOptions;
  fallback: () => AiProposal;
}): Promise<RunResult> {
  const usage: ModelUsage = { input_tokens: 0, output_tokens: 0 };
  const issues: string[] = [];
  let model: string | null = null;
  let user = args.user;

  for (let attempt = 1; attempt <= 2; attempt++) {
    let failure: string;
    try {
      const result = await args.call({
        system: args.system,
        user,
        schema: AiProposal,
        effort: args.effort,
        maxTokens: args.maxTokens ?? 8000,
      });
      usage.input_tokens += result.usage.input_tokens;
      usage.output_tokens += result.usage.output_tokens;
      model = result.model;

      if (result.stopReason === 'refusal') {
        issues.push('model_refusal');
        break; // a refusal won't change on retry
      }
      const parsed = AiProposal.safeParse(result.output);
      if (parsed.success) {
        const sanitized = sanitizeProposal(parsed.data, args.sanitize);
        issues.push(...sanitized.issues);
        if (
          sanitized.proposal.proposed_changes.length > 0 ||
          sanitized.proposal.questions.length > 0
        ) {
          return {
            proposal: { ...sanitized.proposal, fallback: false },
            usage,
            attempts: attempt,
            model,
            issues,
          };
        }
        failure = 'The proposal had no usable changes and no question.';
      } else {
        failure = describeIssues(parsed.error);
      }
      issues.push(result.stopReason === 'max_tokens' ? 'max_tokens' : 'invalid_output');
    } catch (error) {
      issues.push('model_error');
      failure = error instanceof Error ? error.name : 'error';
    }
    user = `${args.user}\n\nYour previous reply could not be used (${failure}). Reply again with a proposal that matches the schema exactly.`;
  }

  issues.push('fallback');
  const fallback = sanitizeProposal(args.fallback(), { ...args.sanitize, newClients: 'always' });
  return {
    proposal: { ...fallback.proposal, fallback: true },
    usage,
    attempts: 2,
    model,
    issues,
  };
}
