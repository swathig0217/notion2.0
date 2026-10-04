import { useCallback } from 'react';
import { confirmDestructive } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import { useUndoAction, type AiAction } from './api';

/** Undo with a confirmation when the created items were edited since. */
export function useUndoFlow() {
  const undo = useUndoAction();
  return useCallback(
    async (action: AiAction) => {
      try {
        const first = await undo(action);
        if (first.undone) {
          toast.show('Undone');
          return;
        }
        const n = first.editedCount;
        confirmDestructive(
          'Undo anyway?',
          `${n} item${n === 1 ? ' was' : 's were'} changed since this was applied. Undo removes everything it added, including those changes.`,
          async () => {
            await undo(action, true);
            toast.show('Undone');
          },
          'Undo',
        );
      } catch {
        toast.error('Couldn’t undo. Check your connection and try again.');
      }
    },
    [undo],
  );
}
