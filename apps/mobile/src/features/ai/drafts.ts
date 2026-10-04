import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { StoredDraft, type DraftKind } from '@notion2/shared';
import { keys } from '@/lib/collection';
import { aiKeys, invoke, type AiAction } from './api';

export function parseDraft(action: Pick<AiAction, 'proposed_changes'>): StoredDraft | null {
  const parsed = StoredDraft.safeParse(action.proposed_changes);
  return parsed.success ? parsed.data : null;
}

/** Asks the assistant for a client update or follow-up draft. Nothing is sent. */
export function useDraftMessage() {
  const qc = useQueryClient();
  return useCallback(
    async (args: { kind: DraftKind; clientId: string; projectId?: string | null }) => {
      const action = await invoke('draft-message', {
        kind: args.kind,
        client_id: args.clientId,
        project_id: args.projectId ?? null,
      });
      qc.setQueryData<AiAction[]>(aiKeys.actions, (rows = []) => [action, ...rows]);
      void qc.invalidateQueries({ queryKey: keys.usage });
      return action;
    },
    [qc],
  );
}
