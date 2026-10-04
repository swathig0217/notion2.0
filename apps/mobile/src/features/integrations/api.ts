import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import {
  shareTokenFromBytes,
  webhookSecretFromBytes,
  type Tables,
  type WebhookEvent,
} from '@notion2/shared';
import { keys, updateList, useDbWrite } from '@/lib/collection';
import { env } from '@/lib/env';
import { newId } from '@/lib/ids';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { toast } from '@/lib/toast';
import { useWorkspaceId, type Me } from '@/features/auth/useMe';

export type Webhook = Tables<'webhooks'>;
export type WebhookDelivery = Tables<'webhook_deliveries'>;

// ---------------------------------------------------------------------------
// Calendar feed
// ---------------------------------------------------------------------------

export function calendarUrl(token: string): string {
  return `${env.supabaseUrl.replace(/\/+$/, '')}/functions/v1/calendar?token=${token}`;
}

/** Apple Calendar subscribes from a webcal:// link. */
export function webcalUrl(token: string): string {
  return calendarUrl(token).replace(/^https?:\/\//, 'webcal://');
}

/** Turns the feed on (new token), replaces it, or turns it off (owner only). */
export function useSetCalendarToken() {
  const qc = useQueryClient();
  const track = useTrack();
  return useCallback(
    async (on: boolean) => {
      const before = qc.getQueryData<Me>(keys.me);
      if (!before) return false;
      const calendar_token = on ? shareTokenFromBytes(Crypto.getRandomBytes(16)) : null;
      qc.setQueryData<Me>(keys.me, {
        ...before,
        workspace: { ...before.workspace, calendar_token },
      });
      const { error } = await supabase
        .from('workspaces')
        .update({ calendar_token })
        .eq('id', before.workspace.id);
      if (error) {
        qc.setQueryData<Me>(keys.me, before);
        toast.error('Couldn’t change the calendar feed.');
        return false;
      }
      if (on && !before.workspace.calendar_token) track('calendar_feed_enabled');
      return true;
    },
    [qc, track],
  );
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export function useWebhooks() {
  return useQuery({
    queryKey: keys.webhooks,
    queryFn: async () => {
      const { data, error } = await supabase.from('webhooks').select('*').order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

export function useWebhook(id: string | undefined) {
  const { data, ...rest } = useWebhooks();
  return { ...rest, data: data?.find((w) => w.id === id) };
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  const write = useDbWrite();
  const track = useTrack();
  const workspaceId = useWorkspaceId();
  return useCallback(
    (url: string, events: WebhookEvent[]): Webhook | null => {
      if (!workspaceId) return null;
      const now = new Date().toISOString();
      const row: Webhook = {
        id: newId(),
        workspace_id: workspaceId,
        url: url.trim(),
        // Generated on the device; shown once on the detail screen for signature checks.
        secret: webhookSecretFromBytes(Crypto.getRandomBytes(32)),
        events,
        enabled: true,
        created_at: now,
        updated_at: now,
      };
      updateList<Webhook>(qc, keys.webhooks, (rows) => [...rows, row]);
      write({ op: 'insert', table: 'webhooks', rows: [row] });
      track('webhook_created', { events: events.length });
      return row;
    },
    [qc, write, track, workspaceId],
  );
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string, patch: Partial<Pick<Webhook, 'enabled' | 'events' | 'url'>>) => {
      updateList<Webhook>(qc, keys.webhooks, (rows) =>
        rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      );
      write({ op: 'update', table: 'webhooks', id, patch });
    },
    [qc, write],
  );
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  const write = useDbWrite();
  return useCallback(
    (id: string) => {
      updateList<Webhook>(qc, keys.webhooks, (rows) => rows.filter((r) => r.id !== id));
      write({ op: 'delete', table: 'webhooks', ids: [id] });
    },
    [qc, write],
  );
}

/** Recent deliveries (refreshes while the screen is open, so a test shows up quickly). */
export function useWebhookDeliveries(webhookId: string | undefined) {
  return useQuery({
    queryKey: keys.webhookDeliveries(webhookId ?? ''),
    enabled: webhookId != null,
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('id, event, status, attempts, response_status, created_at, updated_at')
        .eq('webhook_id', webhookId ?? '')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useSendTestWebhook() {
  const qc = useQueryClient();
  const track = useTrack();
  return useCallback(
    async (webhookId: string) => {
      const { error } = await supabase.rpc('send_test_webhook', { p_webhook_id: webhookId });
      if (error) {
        toast.error('Couldn’t queue a test event. Check your connection.');
        return;
      }
      track('webhook_test_sent');
      toast.show('Test event queued. It’s sent within a minute.');
      void qc.invalidateQueries({ queryKey: keys.webhookDeliveries(webhookId) });
    },
    [qc, track],
  );
}
