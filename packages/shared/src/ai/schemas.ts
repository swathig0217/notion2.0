import { z } from 'zod';
import { TaskPriority } from '../schemas/enums.ts';

/**
 * What the model returns. Kept to features the structured-outputs JSON schema subset
 * supports (no min/max constraints; the SDK strips and re-checks those client-side).
 *
 * Every change carries a short `ref` ("c1", "c2", ...). A later change may point at an
 * earlier `create_client` / `create_project` by putting that ref in `client_id` /
 * `project_id`; otherwise those fields hold an existing id from the workspace context.
 */

const ref = z.string().describe('Short unique id for this change, e.g. "c1"');
const nullableId = z
  .string()
  .nullable()
  .describe('An id from workspace_context, the ref of an earlier change in this proposal, or null');
const isoDateOrNull = z.string().nullable().describe('YYYY-MM-DD or null when not stated');

export const CreateClientChange = z.object({
  op: z.literal('create_client'),
  ref,
  name: z.string(),
  email: z.string().nullable(),
});

export const CreateProjectChange = z.object({
  op: z.literal('create_project'),
  ref,
  title: z.string(),
  client_id: nullableId,
  due_date: isoDateOrNull,
});

export const CreateTaskChange = z.object({
  op: z.literal('create_task'),
  ref,
  title: z.string(),
  notes: z.string().nullable(),
  client_id: nullableId,
  project_id: nullableId,
  due_date: isoDateOrNull,
  priority: TaskPriority,
  subtasks: z.array(z.string()),
});

export const CreateNoteChange = z.object({
  op: z.literal('create_note'),
  ref,
  title: z.string(),
  content: z.string().describe('Markdown'),
  client_id: nullableId,
  project_id: nullableId,
});

export const DraftReplyChange = z.object({
  op: z.literal('draft_reply'),
  ref,
  to_client_id: nullableId,
  body: z.string(),
});

export const ProposedChange = z.discriminatedUnion('op', [
  CreateClientChange,
  CreateProjectChange,
  CreateTaskChange,
  CreateNoteChange,
  DraftReplyChange,
]);

export const AiProposal = z.object({
  summary: z.string().describe('One sentence describing what this input is and what you propose'),
  proposed_changes: z.array(ProposedChange),
  questions: z
    .array(z.string())
    .describe('At most one clarifying question, only when ambiguity is high; otherwise empty'),
  confidence: z.number().describe('0.0 to 1.0'),
});

export type ProposedChange = z.infer<typeof ProposedChange>;
export type CreateClientChange = z.infer<typeof CreateClientChange>;
export type CreateProjectChange = z.infer<typeof CreateProjectChange>;
export type CreateTaskChange = z.infer<typeof CreateTaskChange>;
export type CreateNoteChange = z.infer<typeof CreateNoteChange>;
export type DraftReplyChange = z.infer<typeof DraftReplyChange>;
export type AiProposal = z.infer<typeof AiProposal>;
export type ChangeOp = ProposedChange['op'];

/** Onboarding answers (the "3 questions"). */
export const OnboardingAnswers = z.object({
  business_type: z.string().trim().min(1).max(100),
  business_description: z.string().trim().max(500).default(''),
  client_count: z.enum(['1-2', '3-5', '6-10', '11+']),
  headaches: z.array(z.string().trim().min(1).max(100)).max(8),
});
export type OnboardingAnswers = z.input<typeof OnboardingAnswers>;

/** Request bodies for the edge functions (validated server-side). */
export const ProcessInboxRequest = z.object({
  inbox_item_id: z.uuid(),
  /** Answer to the clarifying question from a previous proposal for this item. */
  clarification: z
    .object({ question: z.string().max(500), answer: z.string().trim().min(1).max(2000) })
    .optional(),
});
export type ProcessInboxRequest = z.infer<typeof ProcessInboxRequest>;

export const GenerateWorkspaceRequest = OnboardingAnswers;

/** Stored in `ai_actions.proposed_changes`: the proposal plus how it was produced. */
export const StoredProposal = AiProposal.extend({
  fallback: z.boolean(),
});
export type StoredProposal = z.infer<typeof StoredProposal>;

/** Stored in `ai_actions.applied_changes` by `apply_ai_action`. */
export const AppliedChanges = z.object({
  clients: z.array(z.uuid()),
  projects: z.array(z.uuid()),
  tasks: z.array(z.uuid()),
  notes: z.array(z.uuid()),
  applied_at: z.string(),
});
export type AppliedChanges = z.infer<typeof AppliedChanges>;
