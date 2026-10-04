import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InboxItemInsert, type InboxKind, type Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite, useDbWriteAsync } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { useWorkspaceId } from '@/features/auth/useMe';

export type InboxItem = Tables<'inbox_items'>;

export function useInbox() {
  return useQuery({
    queryKey: keys.inbox,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inbox_items')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Saves a dump to the inbox (optimistic, works offline). Resolves with the row once it
 * is on the server, so it can be sent to the AI.
 */
export function useCaptureText() {
  const qc = useQueryClient();
  const write = useDbWriteAsync();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (text: string, kind: InboxKind = 'text'): { row: InboxItem; saved: Promise<void> } | null => {
      if (!workspaceId) return null;
      const parsed = InboxItemInsert.parse({
        id: newId(),
        workspace_id: workspaceId,
        kind,
        raw_content: text,
      });
      const now = new Date().toISOString();
      const row: InboxItem = { storage_path: null, ...parsed, created_at: now, updated_at: now };
      updateList<InboxItem>(qc, keys.inbox, (rows) => [row, ...rows]);
      const saved = write({ op: 'insert', table: 'inbox_items', rows: [row] });
      track('inbox_item_created', { kind, length: text.length });
      return { row, saved };
    },
    [qc, write, track, workspaceId],
  );
}

export function useDismissInboxItem() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (item: InboxItem) => {
      updateList<InboxItem>(qc, keys.inbox, (rows) => rows.filter((r) => r.id !== item.id));
      write({ op: 'update', table: 'inbox_items', id: item.id, patch: { status: 'dismissed' } });
    },
    [qc, write],
  );
}
