import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  FREE_LIMITS,
  PRO_PRICES,
  formatMoney,
  yearlySavingPct,
  type BillingInterval,
} from '@notion2/shared';
import { Button, Icon, Text } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { BillingError, billingErrorMessage, useChangePlan, useUsage } from '@/features/billing/api';
import { useTrack } from '@/lib/analytics';
import { APP_NAME } from '@/lib/brand';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';

const REASONS = {
  clients: `The free plan includes ${FREE_LIMITS.active_clients} active clients. Archive one, or go Pro for unlimited clients.`,
  ai: `You’ve used this month’s ${FREE_LIMITS.ai_actions_per_month} AI actions. Your dumps are safe in the Inbox; go Pro to keep the assistant organizing.`,
} as const;

const FEATURES = [
  { icon: 'users', text: 'Unlimited active clients' },
  { icon: 'zap', text: 'Unlimited AI organizing, client updates and follow-ups' },
  { icon: 'file-text', text: 'Weekly brief, invoices, time tracking (also on free)' },
  { icon: 'shield', text: 'Your data stays yours: export or delete anytime' },
] as const;

const INTERVALS = [
  { value: 'month', label: `Monthly · ${formatMoney(PRO_PRICES.month, 'USD')}` },
  { value: 'year', label: `Yearly · ${formatMoney(PRO_PRICES.year, 'USD')}` },
] as const;

/** Paywall. Billing is stubbed until RevenueCat/Stripe are wired (see LAUNCH.md). */
export default function Upgrade() {
  const { reason } = useLocalSearchParams<{ reason?: 'clients' | 'ai' }>();
  const usage = useUsage().data;
  const { upgrade } = useChangePlan();
  const track = useTrack();
  const [interval, setInterval] = useState<BillingInterval>('year');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    track('paywall_viewed', { reason: reason ?? 'settings' });
    if (reason) track('plan_limit_hit', { limit: reason });
  }, [reason, track]);

  const onUpgrade = async () => {
    setBusy(true);
    try {
      await upgrade(interval);
      haptics.success();
      toast.show('You’re on Pro. Thank you!');
      router.back();
    } catch (e) {
      toast.error(billingErrorMessage(e instanceof BillingError ? e.code : 'unknown'));
    } finally {
      setBusy(false);
    }
  };

  const perMonth = interval === 'year' ? PRO_PRICES.year / 12 : PRO_PRICES.month;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="gap-6 p-4 pb-16">
      <View className="gap-2">
        <Text variant="title">{APP_NAME} Pro</Text>
        {reason && reason in REASONS ? (
          <Text testID="paywall-reason" className="text-muted">
            {REASONS[reason]}
          </Text>
        ) : (
          <Text className="text-muted">For freelancers with a full roster.</Text>
        )}
      </View>

      <View className="gap-3 rounded-card bg-surface p-4">
        {FEATURES.map((f) => (
          <View key={f.text} className="flex-row items-center gap-3">
            <Icon name={f.icon} size={18} color="accent" />
            <Text className="flex-1">{f.text}</Text>
          </View>
        ))}
      </View>

      {usage?.plan === 'pro' ? (
        <View className="gap-3">
          <Text testID="paywall-pro" className="font-semibold">
            You’re on Pro.
          </Text>
          <Button label="Done" variant="secondary" onPress={() => router.back()} />
        </View>
      ) : (
        <View className="gap-3">
          <Segmented<BillingInterval>
            label="Billing period"
            value={interval}
            options={INTERVALS}
            onChange={setInterval}
          />
          <Text variant="caption" className="text-center">
            {formatMoney(Math.round(perMonth), 'USD')} a month
            {interval === 'year' ? `, billed yearly. Save ${yearlySavingPct()}%.` : '.'} Cancel
            anytime.
          </Text>
          <Button
            testID="upgrade-pro"
            label={busy ? 'Upgrading…' : 'Upgrade to Pro'}
            icon="star"
            disabled={busy}
            onPress={() => void onUpgrade()}
          />
          <Button label="Not now" variant="ghost" onPress={() => router.back()} />
        </View>
      )}
    </ScrollView>
  );
}
