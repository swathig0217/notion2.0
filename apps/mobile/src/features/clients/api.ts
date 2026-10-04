import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClientInsert, type ClientUpdate, type Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { useWorkspaceId } from '@/features/auth/useMe';
import { CLIENT_COLORS } from '@/theme/tokens';

export type Client = Tables<'clients'>;

const byName = (a: Client, b: Client) => a.name.localeCompare(b.name);

export function useClients() {
  return useQuery({
    queryKey: keys.clients,
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('name');
      if (error) throw error;
      return data;
    },
  });
}

export function useClient(id: string | undefined) {
  const { data, ...rest } = useClients();
  return { ...rest, data: data?.find((c) => c.id === id) };
}

export function useCreateClient() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  const workspaceId = useWorkspaceId();

  return useCallback(
    (input: { name: string; email?: string | null; color?: string | null }): Client | null => {
      if (!workspaceId) return null;
      const count = qc.getQueryData<Client[]>(keys.clients)?.length ?? 0;
      const parsed = ClientInsert.parse({
        id: newId(),
        workspace_id: workspaceId,
        name: input.name,
        email: input.email || null,
        color: input.color ?? CLIENT_COLORS[count % CLIENT_COLORS.length],
      });
      const now = new Date().toISOString();
      const row: Client = {
        notes: null,
        last_contacted_at: null,
        email: null,
        color: null,
        ...parsed,
        created_at: now,
        updated_at: now,
      };
      updateList<Client>(qc, keys.clients, (rows) => [...rows, row].sort(byName));
      write({ op: 'insert', table: 'clients', rows: [row] });
      track('client_created');
      return row;
    },
    [qc, write, track, workspaceId],
  );
}

export function useUpdateClient() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string, patch: ClientUpdate) => {
      updateList<Client>(qc, keys.clients, (rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)).sort(byName),
      );
      write({ op: 'update', table: 'clients', id, patch });
    },
    [qc, write],
  );
}

export function useDeleteClient() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string) => {
      updateList<Client>(qc, keys.clients, (rows) => rows.filter((r) => r.id !== id));
      // Mirror ON DELETE SET NULL locally so lists stay consistent before refetch.
      const clear = <T extends { client_id: string | null }>(rows: T[]) =>
        rows.map((r) => (r.client_id === id ? { ...r, client_id: null } : r));
      updateList<Tables<'projects'>>(qc, keys.projects, clear);
      updateList<Tables<'tasks'>>(qc, keys.tasks, clear);
      write({ op: 'delete', table: 'clients', ids: [id] });
    },
    [qc, write],
  );
}
