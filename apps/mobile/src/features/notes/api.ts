import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Json, Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { useWorkspaceId } from '@/features/auth/useMe';

export type Note = Tables<'notes'>;
export type NoteSummary = Pick<Note, 'id' | 'title' | 'client_id' | 'project_id' | 'updated_at'>;

export function useNotes() {
  return useQuery({
    queryKey: keys.notes,
    queryFn: async (): Promise<NoteSummary[]> => {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, client_id, project_id, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useNote(id: string | undefined) {
  return useQuery({
    queryKey: keys.note(id ?? ''),
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('id', id ?? '')
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (input: { client_id?: string | null; project_id?: string | null }): Note | null => {
      if (!workspaceId) return null;
      const now = new Date().toISOString();
      const row: Note = {
        id: newId(),
        workspace_id: workspaceId,
        client_id: input.client_id ?? null,
        project_id: input.project_id ?? null,
        title: '',
        content: null,
        content_text: '',
        ai_action_id: null,
        created_at: now,
        updated_at: now,
      };
      qc.setQueryData(keys.note(row.id), row);
      updateList<NoteSummary>(qc, keys.notes, (rows) => [row, ...rows]);
      write({ op: 'insert', table: 'notes', rows: [row] });
      track('note_created');
      return row;
    },
    [qc, write, track, workspaceId],
  );
}

export function useSaveNote() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string, patch: { title?: string; content?: Json; content_text?: string }) => {
      const updated_at = new Date().toISOString();
      qc.setQueryData<Note>(keys.note(id), (n) => (n ? { ...n, ...patch, updated_at } : n));
      updateList<NoteSummary>(qc, keys.notes, (rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch, updated_at } : r)),
      );
      write({ op: 'update', table: 'notes', id, patch });
    },
    [qc, write],
  );
}

export function useDeleteNote() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string) => {
      updateList<NoteSummary>(qc, keys.notes, (rows) => rows.filter((r) => r.id !== id));
      qc.removeQueries({ queryKey: keys.note(id) });
      write({ op: 'delete', table: 'notes', ids: [id] });
    },
    [qc, write],
  );
}
