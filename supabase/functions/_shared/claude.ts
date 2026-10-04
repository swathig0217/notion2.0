// Claude adapter shared by the edge functions (Deno) and the eval runner (Node), so evals
// exercise exactly the production call. Server-side only: never import from apps/.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ModelCall } from '../../../packages/shared/src/ai/index.ts';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export interface ClaudeConfig {
  apiKey: string;
  model?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  maxRetries?: number;
}

/**
 * Structured-output call: the response is constrained to the Zod schema and parsed by
 * the SDK. Refusals are reported via stopReason so the runner can fall back. Server-side
 * fallbacks (`fallbacks: "default"`) let the API retry a policy decline on another model.
 */
export function createClaudeCall(config: ClaudeConfig): ModelCall {
  const client = new Anthropic({
    apiKey: config.apiKey,
    timeout: config.timeoutMs ?? 60_000,
    maxRetries: config.maxRetries ?? 2,
  });
  const model = config.model || DEFAULT_MODEL;

  return async (request) => {
    const response = await client.beta.messages.parse({
      model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
      output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    return {
      output: response.stop_reason === 'refusal' ? null : response.parsed_output,
      stopReason: response.stop_reason,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
      model: response.model,
    };
  };
}
