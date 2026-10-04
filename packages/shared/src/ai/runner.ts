import type { z } from 'zod';
import { AiProposal, type StoredProposal } from './schemas.ts';
import { sanitizeProposal, type SanitizeOptions } from './guardrails.ts';

export interface ModelImage {
  media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  /** Base64, no data: prefix. */
  data: string;
}

export interface ModelRequest {
  system: string;
  user: string;
  /** Zod schema the adapter turns into a structured-output format. */
  schema: z.ZodType;
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
  /** Optional images placed before the text (vision). */
  images?: ModelImage[];
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

export interface StructuredResult<T> {
  value: T;
  fallback: boolean;
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
 * Generic structured call: validate with Zod -> post-process -> (retry once with the
 * reason) -> deterministic fallback. Never throws for model problems.
 *
 * `postProcess` applies guardrails and may reject a parsed value by returning a reason
 * string (it is then retried, then falls back).
 */
export async function runStructured<S extends z.ZodType>(args: {
  call: ModelCall;
  schema: S;
  system: string;
  user: string;
  images?: ModelImage[];
  effort: ModelRequest['effort'];
  maxTokens?: number;
  postProcess: (value: z.infer<S>, issues: string[]) => z.infer<S> | string;
  fallback: () => z.infer<S>;
}): Promise<StructuredResult<z.infer<S>>> {
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
        schema: args.schema,
        images: args.images,
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
      const parsed = args.schema.safeParse(result.output);
      if (parsed.success) {
        const processed = args.postProcess(parsed.data, issues);
        if (typeof processed !== 'string') {
          return { value: processed, fallback: false, usage, attempts: attempt, model, issues };
        }
        failure = processed;
      } else {
        failure = describeIssues(parsed.error);
      }
      issues.push(result.stopReason === 'max_tokens' ? 'max_tokens' : 'invalid_output');
    } catch (error) {
      issues.push('model_error');
      failure = error instanceof Error ? error.name : 'error';
    }
    user = `${args.user}\n\nYour previous reply could not be used (${failure}). Reply again with output that matches the schema exactly.`;
  }

  issues.push('fallback');
  return { value: args.fallback(), fallback: true, usage, attempts: 2, model, issues };
}

export interface RunResult {
  proposal: StoredProposal;
  usage: ModelUsage;
  attempts: number;
  model: string | null;
  issues: string[];
}

/** Inbox/onboarding proposals: structured run + proposal guardrails. */
export async function runProposal(args: {
  call: ModelCall;
  system: string;
  user: string;
  images?: ModelImage[];
  effort: ModelRequest['effort'];
  maxTokens?: number;
  sanitize: SanitizeOptions;
  fallback: () => AiProposal;
}): Promise<RunResult> {
  const result = await runStructured({
    call: args.call,
    schema: AiProposal,
    system: args.system,
    user: args.user,
    images: args.images,
    effort: args.effort,
    maxTokens: args.maxTokens,
    postProcess: (value, issues) => {
      const sanitized = sanitizeProposal(value, args.sanitize);
      issues.push(...sanitized.issues);
      const p = sanitized.proposal;
      return p.proposed_changes.length > 0 || p.questions.length > 0
        ? p
        : 'The proposal had no usable changes and no question.';
    },
    fallback: () =>
      sanitizeProposal(args.fallback(), { ...args.sanitize, newClients: 'always' }).proposal,
  });
  return {
    proposal: { ...result.value, fallback: result.fallback },
    usage: result.usage,
    attempts: result.attempts,
    model: result.model,
    issues: result.issues,
  };
}
