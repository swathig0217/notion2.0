import { useCallback } from 'react';
import {
  MutationObserver,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  StoredProposal,
  planApply,
  type AiProposal,
  type Json,
  type OnboardingAnswers,
  type ReviewDecision,
  type Tables,
} from '@notion2/shared';
import { keys } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { reportError } from '@/lib/sentry';
import { useWorkspaceId } from '@/features/auth/useMe';
import type { Task } from '@/features/tasks/api';

export type AiAction = Tables<'ai_actions'>;

export const aiKeys = {
  actions: ['ai-actions'] as const,
  action: (id: string) => ['ai-actions', id] as const,
};

/** Error codes from the edge functions, mapped to calm copy. */
export function aiErrorMessage(code: string | null): string {
  switch (code) {
    case 'rate_limited':
      return 'You’ve hit the hourly limit for AI. Try again in a little while.';
    case 'offline':
      return 'You’re offline. Your dump is safe in the Inbox; organize it when you’re back online.';
    case 'input_too_large':
      return 'That’s too long to organize in one go. Try splitting it up.';
    case 'ai_not_configured':
      return 'AI isn’t set up on this server yet.';
    case 'plan_limit':
      return 'You’ve used this month’s AI actions on the free plan.';
    default:
      return 'Couldn’t organize that right now. Your dump is safe in the Inbox.';
  }
}

export async function invoke(name: string, body: Record<string, unknown>): Promise<AiAction> {
  const { data, error } = await supabase.functions.invoke<{ action: AiAction }>(name, { body });
  if (error) {
    let code = 'unknown';
    if (error instanceof FunctionsHttpError) {
      code =
        ((await error.context.json().catch(() => ({}))) as { error?: string }).error ?? 'unknown';
    } else if (/fetch|network/i.test(error.message)) {
      code = 'offline';
    }
    throw new AiError(code);
  }
  if (!data) throw new AiError('unknown');
  return data.action;
}

export class AiError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AiError';
  }
}

export function parseProposal(
  action: Pick<AiAction, 'proposed_changes'>,
): (AiProposal & { fallback: boolean }) | null {
  const parsed = StoredProposal.safeParse(action.proposed_changes);
  return parsed.success ? parsed.data : null;
}

/** Recent AI actions: proposals to review and the history that powers Undo. */
export function useAiActions() {
  return useQuery({
    queryKey: aiKeys.actions,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useAiAction(id: string | undefined) {
  const { data, ...rest } = useAiActions();
  return { ...rest, data: data?.find((a) => a.id === id) };
}

function upsertAction(qc: QueryClient, action: AiAction) {
  qc.setQueryData<AiAction[]>(aiKeys.actions, (rows = []) => [
    action,
    ...rows.filter((r) => r.id !== action.id),
  ]);
}

export interface ProcessInboxVars {
  inboxItemId: string;
  clarification?: { question: string; answer: string };
}

export const PROCESS_INBOX_KEY = ['process-inbox'] as const;

/**
 * Sends one inbox dump to the AI. The result is a proposal; nothing changes until the
 * user accepts it. Defaults live on the client so the request finishes (and notifies)
 * even if the screen that started it is gone (e.g. the capture sheet closed).
 */
export function configureAiMutations(qc: QueryClient, onReady: (action: AiAction) => void) {
  qc.setMutationDefaults(PROCESS_INBOX_KEY, {
    networkMode: 'always',
    retry: false,
    mutationFn: (vars: ProcessInboxVars) =>
      invoke('process-inbox', {
        inbox_item_id: vars.inboxItemId,
        clarification: vars.clarification,
      }),
    onSuccess: (action: AiAction) => {
      upsertAction(qc, action);
      void qc.invalidateQueries({ queryKey: keys.usage });
      onReady(action);
    },
    onError: (error: Error) => {
      if (!(error instanceof AiError) || error.code === 'unknown')
        reportError(error, { fn: 'process-inbox' });
    },
  });
}

/** Starts organizing outside React (keeps running after the calling screen closes). */
export function organize(qc: QueryClient, vars: ProcessInboxVars) {
  return new MutationObserver<AiAction, Error, ProcessInboxVars>(qc, {
    mutationKey: PROCESS_INBOX_KEY,
  })
    .mutate(vars)
    .catch(() => undefined); // surfaced per item in the Inbox via useProcessErrors
}

export function useProcessInbox() {
  return useMutation<AiAction, Error, ProcessInboxVars>({ mutationKey: PROCESS_INBOX_KEY });
}

/** Inbox item ids currently being organized (from any screen). */
export function useProcessingIds(): Set<string> {
  const vars = useMutationState({
    filters: { mutationKey: PROCESS_INBOX_KEY, status: 'pending' },
    select: (m) => (m.state.variables as ProcessInboxVars | undefined)?.inboxItemId,
  });
  return new Set(vars.filter((v): v is string => typeof v === 'string'));
}

/** The last organize error per inbox item, cleared when a new attempt starts. */
export function useProcessErrors(): Map<string, string> {
  const states = useMutationState({
    filters: { mutationKey: PROCESS_INBOX_KEY },
    select: (m) => ({
      id: (m.state.variables as ProcessInboxVars | undefined)?.inboxItemId,
      status: m.state.status,
      code:
        m.state.error instanceof AiError ? m.state.error.code : m.state.error ? 'unknown' : null,
    }),
  });
  const map = new Map<string, string>();
  for (const s of states) {
    if (!s.id) continue;
    if (s.status === 'error' && s.code) map.set(s.id, s.code);
    else map.delete(s.id);
  }
  return map;
}

export function useGenerateWorkspace() {
  const qc = useQueryClient();
  const workspaceId = useWorkspaceId();
  return useCallback(
    async (answers: OnboardingAnswers, fallback: () => AiProposal): Promise<AiAction> => {
      try {
        const action = await invoke('generate-workspace', answers);
        upsertAction(qc, action);
        return action;
      } catch (error) {
        // The AI is optional for onboarding: store the starter template as the proposal
        // so the user still reviews and applies it the normal way.
        reportError(error, { fn: 'generate-workspace' });
        if (!workspaceId) throw error;
        const { data, error: insertError } = await supabase
          .from('ai_actions')
          .insert({
            workspace_id: workspaceId,
            type: 'generate_workspace',
            proposed_changes: { ...fallback(), fallback: true } as unknown as NonNullable<Json>,
            prompt_version: 'template',
          })
          .select('*')
          .single();
        if (insertError) throw insertError;
        upsertAction(qc, data);
        return data;
      }
    },
    [qc, workspaceId],
  );
}

const DATA_KEYS = [keys.tasks, keys.clients, keys.projects, keys.notes, keys.inbox, aiKeys.actions];

function refreshAll(qc: QueryClient) {
  return Promise.all(DATA_KEYS.map((key) => qc.invalidateQueries({ queryKey: key })));
}

export function useApplyAction() {
  const qc = useQueryClient();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    async (action: AiAction, proposal: AiProposal, decision: ReviewDecision) => {
      if (!workspaceId) throw new Error('No workspace');
      const tasks = qc.getQueryData<Task[]>(keys.tasks) ?? [];
      const lastTaskPosition = tasks.length
        ? Math.max(...tasks.filter((t) => !t.parent_task_id).map((t) => t.position))
        : null;
      const plan = planApply(proposal, decision, {
        workspaceId,
        actionId: action.id,
        newId,
        lastTaskPosition,
      });
      const { error } = await supabase.rpc('apply_ai_action', {
        p_action_id: action.id,
        p_rows: plan.rows as unknown as NonNullable<Json>,
        p_edited: plan.edited,
      });
      if (error) throw error;
      await refreshAll(qc);
      track('ai_proposal_accepted', {
        type: action.type,
        edited: plan.edited,
        rows: plan.count,
        seconds_to_accept: Math.round((Date.now() - new Date(action.created_at).getTime()) / 1000),
      });
      return plan;
    },
    [qc, track, workspaceId],
  );
}

export function useRejectAction() {
  const qc = useQueryClient();
  const track = useTrack();
  return useCallback(
    async (action: AiAction) => {
      const { error } = await supabase.rpc('reject_ai_action', { p_action_id: action.id });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: aiKeys.actions });
      track('ai_proposal_rejected', { type: action.type });
    },
    [qc, track],
  );
}

/**
 * Undo an applied action. Returns `{ editedCount }` without deleting anything when rows
 * were changed since; call again with `force` after the user confirms.
 */
export function useUndoAction() {
  const qc = useQueryClient();
  const track = useTrack();
  return useCallback(
    async (action: AiAction, force = false): Promise<{ undone: boolean; editedCount: number }> => {
      const { data, error } = await supabase.rpc('undo_ai_action', {
        p_action_id: action.id,
        p_force: force,
      });
      if (error) throw error;
      const result = data as { undone: boolean; edited_count: number };
      if (result.undone) {
        await refreshAll(qc);
        track('ai_proposal_undone', { type: action.type, edited_rows: result.edited_count });
      }
      return { undone: result.undone, editedCount: result.edited_count };
    },
    [qc, track],
  );
}
