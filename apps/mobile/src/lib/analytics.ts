import { useCallback } from 'react';
import { useMe } from '@/features/auth/useMe';
import { newId } from './ids';
import { useDbWrite } from './collection';

/**
 * Product analytics events (see PLAN.md success metrics). Names are snake_case.
 * Props must be counts, ids, or enums: never user content.
 */
export type EventName =
  // 'signup_completed' is recorded by the database signup trigger.
  | 'client_created'
  | 'project_created'
  | 'task_created'
  | 'task_completed'
  | 'checklist_from_paste'
  | 'note_created'
  | 'inbox_item_created'
  | 'onboarding_completed'
  | 'ai_proposal_accepted'
  | 'ai_proposal_rejected'
  | 'ai_proposal_undone'
  | 'ai_clarification_answered'
  | 'client_update_sent'
  | 'follow_up_sent'
  | 'weekly_brief_opened'
  | 'timer_started';

export function useTrack() {
  const me = useMe().data;
  const write = useDbWrite();
  return useCallback(
    (name: EventName, props: Record<string, string | number | boolean> = {}) => {
      if (!me) return;
      write({
        op: 'insert',
        table: 'events',
        rows: [{ id: newId(), workspace_id: me.workspace.id, user_id: me.userId, name, props }],
      });
    },
    [me, write],
  );
}
