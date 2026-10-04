import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { ClientView, shareTokenFromBytes, shareUrl, type Tables } from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { env } from '@/lib/env';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { useWorkspaceId } from '@/features/auth/useMe';

export type ShareLink = Tables<'share_links'>;

export function useShareLinks() {
  return useQuery({
    queryKey: keys.shareLinks,
    queryFn: async () => {
      const { data, error } = await supabase.from('share_links').select('*');
      if (error) throw error;
      return data;
    },
  });
}

export function useShareLink(projectId: string | undefined) {
  const { data, ...rest } = useShareLinks();
  return {
    ...rest,
    data: useMemo(() => data?.find((l) => l.project_id === projectId), [data, projectId]),
  };
}

/** The public link, or null when no web app URL is known (native without EXPO_PUBLIC_APP_URL). */
export function linkUrl(token: string): string | null {
  const base = env.appUrl || (Platform.OS === 'web' ? window.location.origin : '');
  return base ? shareUrl(base, token) : null;
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (projectId: string): ShareLink | null => {
      if (!workspaceId) return null;
      const now = new Date().toISOString();
      const row: ShareLink = {
        id: newId(),
        workspace_id: workspaceId,
        project_id: projectId,
        // Generated on the device so the link exists (and can be shared) instantly.
        token: shareTokenFromBytes(Crypto.getRandomBytes(16)),
        hidden_task_ids: [],
        view_count: 0,
        last_viewed_at: null,
        created_at: now,
        updated_at: now,
      };
      updateList<ShareLink>(qc, keys.shareLinks, (rows) => [...rows, row]);
      write({ op: 'insert', table: 'share_links', rows: [row] });
      track('client_link_created');
      return row;
    },
    [qc, write, track, workspaceId],
  );
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  return useCallback(
    (link: ShareLink) => {
      updateList<ShareLink>(qc, keys.shareLinks, (rows) => rows.filter((r) => r.id !== link.id));
      write({ op: 'delete', table: 'share_links', ids: [link.id] });
      track('client_link_revoked');
    },
    [qc, write, track],
  );
}

export function useSetTaskHidden() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (link: ShareLink, taskId: string, hidden: boolean) => {
      const set = new Set(link.hidden_task_ids);
      if (hidden) set.add(taskId);
      else set.delete(taskId);
      const hidden_task_ids = [...set];
      updateList<ShareLink>(qc, keys.shareLinks, (rows) =>
        rows.map((r) => (r.id === link.id ? { ...r, hidden_task_ids } : r)),
      );
      write({ op: 'update', table: 'share_links', id: link.id, patch: { hidden_task_ids } });
    },
    [qc, write],
  );
}

export class ClientViewError extends Error {
  constructor(readonly code: 'not_found' | 'offline' | 'unknown') {
    super(code);
    this.name = 'ClientViewError';
  }
}

/** Public page data (no login). The server returns allowlisted fields only. */
export function usePublicClientView(token: string | undefined) {
  return useQuery({
    queryKey: ['client-view', token],
    enabled: token != null,
    retry: false,
    // Never persisted (it may be a shared device) and always fresh from the server.
    gcTime: 0,
    meta: { persist: false },
    queryFn: async (): Promise<ClientView> => {
      const { data, error } = await supabase.functions.invoke<unknown>('client-view', {
        body: { token },
      });
      if (error) {
        const status = (error as { context?: { status?: number } }).context?.status;
        throw new ClientViewError(
          status === 404 ? 'not_found' : /fetch/i.test(error.message) ? 'offline' : 'unknown',
        );
      }
      const parsed = ClientView.safeParse(data);
      if (!parsed.success) throw new ClientViewError('unknown');
      return parsed.data;
    },
  });
}
