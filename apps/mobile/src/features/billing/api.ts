import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { router } from 'expo-router';
import {
  FREE_LIMITS,
  Usage,
  isSampleClientName,
  type BillingInterval,
  type LimitKind,
  type Tables,
} from '@notion2/shared';
import { useClients } from '@/features/clients/api';
import { keys } from '@/lib/collection';
import { supabase } from '@/lib/supabase';
import { useTrack } from '@/lib/analytics';
import { useWorkspaceId } from '@/features/auth/useMe';

export type Subscription = Tables<'subscriptions'>;

/** Plan + usage for the workspace (server-computed; limits are enforced server-side). */
export function useUsage() {
  const workspaceId = useWorkspaceId();
  return useQuery({
    queryKey: keys.usage,
    enabled: workspaceId != null,
    staleTime: 30_000,
    queryFn: async (): Promise<Usage> => {
      const { data, error } = await supabase.rpc('workspace_usage', { ws: workspaceId ?? '' });
      if (error) throw error;
      return Usage.parse(data);
    },
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: [...keys.usage, 'subscription'],
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase.from('subscriptions').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Whether one more real active client would exceed the free plan. Counted from the local
 * cache so it works offline; the database enforces the same rule.
 */
export function useClientLimitReached(): boolean {
  const plan = useUsage().data?.plan;
  const clients = useClients().data ?? [];
  if (plan !== 'free') return false;
  const active = clients.filter((c) => c.status === 'active' && !isSampleClientName(c.name));
  return active.length >= FREE_LIMITS.active_clients;
}

/** Opens the paywall, explaining which limit was hit. */
export function openPaywall(reason?: LimitKind) {
  router.push(reason ? `/upgrade?reason=${reason}` : '/upgrade');
}

export class BillingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BillingError';
  }
}

async function callBilling(body: Record<string, unknown>): Promise<'free' | 'pro'> {
  const { data, error } = await supabase.functions.invoke<{ plan: 'free' | 'pro' }>('billing', {
    body,
  });
  if (error) {
    const code =
      error instanceof FunctionsHttpError
        ? (((await error.context.json().catch(() => ({}))) as { error?: string }).error ??
          'unknown')
        : 'offline';
    throw new BillingError(code);
  }
  if (!data) throw new BillingError('unknown');
  return data.plan;
}

export function billingErrorMessage(code: string): string {
  switch (code) {
    case 'billing_unavailable':
      return 'Upgrades open soon. You’ll keep everything you’ve made on the free plan.';
    case 'not_owner':
      return 'Only the workspace owner can change the plan.';
    case 'offline':
      return 'You’re offline. Try again when you’re back online.';
    default:
      return 'Couldn’t change your plan. Try again.';
  }
}

export function useChangePlan() {
  const qc = useQueryClient();
  const track = useTrack();
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: keys.usage }), [qc]);
  return {
    upgrade: useCallback(
      async (interval: BillingInterval) => {
        const plan = await callBilling({ action: 'checkout', interval });
        await refresh();
        track('upgrade_completed', { interval });
        return plan;
      },
      [refresh, track],
    ),
    cancel: useCallback(async () => {
      const plan = await callBilling({ action: 'cancel' });
      await refresh();
      track('plan_canceled');
      return plan;
    }, [refresh, track]),
  };
}
