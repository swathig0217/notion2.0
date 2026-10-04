import { View } from 'react-native';
import { FREE_LIMITS } from '@notion2/shared';
import { Button, SectionHeader, Skeleton, Text } from '@/components/ui';
import { confirmDestructive } from '@/lib/confirm';
import { toast } from '@/lib/toast';
import {
  BillingError,
  billingErrorMessage,
  openPaywall,
  useChangePlan,
  useSubscription,
  useUsage,
} from './api';

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <View className="gap-1.5" accessibilityLabel={`${label}: ${used} of ${limit}`}>
      <View className="flex-row justify-between">
        <Text variant="caption">{label}</Text>
        <Text variant="caption" className={used >= limit ? 'text-danger' : 'text-text'}>
          {used} of {limit}
        </Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <View
          className={`h-full rounded-full ${used >= limit ? 'bg-danger' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </View>
    </View>
  );
}

/** Settings → Plan: usage meters on free, renewal date on Pro. */
export function PlanSection() {
  const usage = useUsage();
  const subscription = useSubscription().data;
  const { cancel } = useChangePlan();

  return (
    <>
      <SectionHeader title="Plan" />
      <View className="gap-4 px-4">
        {!usage.data ? (
          <Skeleton className="h-16 w-full" />
        ) : usage.data.plan === 'pro' ? (
          <>
            <Text testID="plan-name" className="font-semibold">
              Pro
              {subscription?.current_period_end
                ? ` · renews ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : ''}
            </Text>
            <View className="flex-row">
              <Button
                label="Cancel Pro"
                variant="ghost"
                onPress={() =>
                  confirmDestructive(
                    'Cancel Pro?',
                    `You keep everything. Free allows ${FREE_LIMITS.active_clients} active clients and ${FREE_LIMITS.ai_actions_per_month} AI actions a month.`,
                    async () => {
                      try {
                        await cancel();
                        toast.show('You’re back on the free plan');
                      } catch (e) {
                        toast.error(
                          billingErrorMessage(e instanceof BillingError ? e.code : 'unknown'),
                        );
                      }
                    },
                    'Cancel Pro',
                  )
                }
              />
            </View>
          </>
        ) : (
          <>
            <Text testID="plan-name" className="font-semibold">
              Free
            </Text>
            <Meter
              label="Active clients"
              used={usage.data.active_clients}
              limit={usage.data.client_limit ?? FREE_LIMITS.active_clients}
            />
            <Meter
              label="AI actions this month"
              used={usage.data.ai_actions_used}
              limit={usage.data.ai_action_limit ?? FREE_LIMITS.ai_actions_per_month}
            />
            <Text variant="caption">
              Sample clients don’t count. Onboarding and the weekly brief are always free.
            </Text>
            <Button
              testID="settings-upgrade"
              label="Upgrade to Pro"
              icon="star"
              onPress={() => openPaywall()}
            />
          </>
        )}
      </View>
    </>
  );
}
