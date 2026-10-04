import {
  fallbackProposal,
  mockInboxProposal,
  renderInboxMessage,
  runProposal,
  type ModelImage,
} from '../../../packages/shared/src/ai/index.ts';
import type { Tables } from '../../../packages/shared/src/db.types.ts';
import { INBOX_MAX_CHARS } from '../../../packages/shared/src/schemas/entities.ts';
import { logMetrics } from './http.ts';
import {
  isMock,
  loadPrompt,
  loadTimeZone,
  loadWorkspaceContext,
  mockModel,
  modelCall,
  overPlanLimit,
  overRateLimit,
} from './ai.ts';
import type { Db } from './supabase.ts';

export const INBOX_PROMPT = 'process-inbox.v2';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type InboxItem = Tables<'inbox_items'>;
export type ProcessOutcome =
  | { ok: true; action: Tables<'ai_actions'> }
  | {
      ok: false;
      code:
        | 'input_too_large'
        | 'rate_limited'
        | 'plan_limit'
        | 'ai_not_configured'
        | 'image_unavailable'
        | 'save_failed';
      status: number;
    };

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function loadImage(db: Db, path: string): Promise<ModelImage | null> {
  const { data, error } = await db.storage.from('inbox').download(path);
  if (error || !data || data.size > MAX_IMAGE_BYTES || !IMAGE_TYPES.has(data.type)) return null;
  return {
    media_type: data.type as ModelImage['media_type'],
    data: toBase64(new Uint8Array(await data.arrayBuffer())),
  };
}

/**
 * Organizes one inbox item into a proposal (ai_actions row). Used by `process-inbox`
 * (the user's client, RLS) and `inbound-email` (service client scoped to the item's
 * workspace). `timezoneUserId` decides what "today" means.
 */
export async function processInboxItem(
  db: Db,
  item: InboxItem,
  opts: {
    timezoneUserId: string;
    clarification?: { question: string; answer: string };
    source: string;
  },
): Promise<ProcessOutcome> {
  const started = Date.now();
  if (item.raw_content.length > INBOX_MAX_CHARS)
    return { ok: false, code: 'input_too_large', status: 413 };
  if (await overRateLimit(db, item.workspace_id))
    return { ok: false, code: 'rate_limited', status: 429 };
  if (await overPlanLimit(db, item.workspace_id))
    return { ok: false, code: 'plan_limit', status: 402 };

  const timeZone = await loadTimeZone(db, opts.timezoneUserId);
  const context = await loadWorkspaceContext(db, item.workspace_id, timeZone);

  let images: ModelImage[] | undefined;
  if (item.kind === 'image') {
    const image = item.storage_path ? await loadImage(db, item.storage_path) : null;
    if (!image) return { ok: false, code: 'image_unavailable', status: 422 };
    images = [image];
  }

  const call = isMock()
    ? mockModel(() => mockInboxProposal(item.raw_content, context))
    : modelCall({ timeoutMs: 60_000, maxRetries: 2 });
  if (!call) return { ok: false, code: 'ai_not_configured', status: 503 };

  const result = await runProposal({
    call,
    system: await loadPrompt(INBOX_PROMPT),
    user: renderInboxMessage(
      context,
      { kind: item.kind, text: item.raw_content },
      opts.clarification,
    ),
    images,
    effort: 'medium',
    sanitize: { context, rawInput: item.raw_content, newClients: 'if_mentioned' },
    fallback: () => fallbackProposal(item.raw_content),
  });

  const { data: action, error } = await db
    .from('ai_actions')
    .insert({
      workspace_id: item.workspace_id,
      inbox_item_id: item.id,
      type: 'process_inbox',
      proposed_changes: result.proposal,
      model: result.model,
      prompt_version: INBOX_PROMPT,
      tokens_in: result.usage.input_tokens,
      tokens_out: result.usage.output_tokens,
    })
    .select('*')
    .single();
  if (error) return { ok: false, code: 'save_failed', status: 500 };

  logMetrics({
    fn: 'process-inbox',
    source: opts.source,
    action_id: action.id,
    kind: item.kind,
    attempts: result.attempts,
    fallback: result.proposal.fallback,
    changes: result.proposal.proposed_changes.length,
    tokens_in: result.usage.input_tokens,
    tokens_out: result.usage.output_tokens,
    issues: result.issues,
    ms: Date.now() - started,
  });
  return { ok: true, action };
}
