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

export interface PickedImage {
  uri: string;
  mimeType: string;
  fileSize: number | null;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Uploads a screenshot/photo to the private inbox bucket and creates an image inbox
 * item. Needs a connection (unlike text dumps, images aren't queued offline).
 */
export function useCaptureImage() {
  const qc = useQueryClient();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    async (image: PickedImage, caption: string): Promise<InboxItem> => {
      if (!workspaceId) throw new Error('No workspace');
      const ext = EXT[image.mimeType];
      if (!ext) throw new Error('unsupported_type');
      const blob = await (await fetch(image.uri)).blob();
      if (blob.size > MAX_IMAGE_BYTES) throw new Error('too_large');
      const id = newId();
      const path = `${workspaceId}/${id}.${ext}`;
      const upload = await supabase.storage
        .from('inbox')
        .upload(path, blob, { contentType: image.mimeType });
      if (upload.error) throw upload.error;
      const parsed = InboxItemInsert.parse({
        id,
        workspace_id: workspaceId,
        kind: 'image',
        raw_content: caption.trim() || 'Screenshot',
      });
      const { data, error } = await supabase
        .from('inbox_items')
        .insert({ ...parsed, storage_path: path })
        .select('*')
        .single();
      if (error) throw error;
      updateList<InboxItem>(qc, keys.inbox, (rows) => [data, ...rows]);
      track('inbox_item_created', { kind: 'image', bytes: blob.size });
      return data;
    },
    [qc, track, workspaceId],
  );
}
