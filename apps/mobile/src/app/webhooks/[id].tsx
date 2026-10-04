import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SIGNATURE_HEADER } from '@notion2/shared';
import {
  Button,
  Checkbox,
  EmptyState,
  IconButton,
  ListSkeleton,
  SectionHeader,
  Text,
} from '@/components/ui';
import { EventPicker } from '@/features/integrations/EventPicker';
import {
  useDeleteWebhook,
  useSendTestWebhook,
  useUpdateWebhook,
  useWebhook,
  useWebhookDeliveries,
} from '@/features/integrations/api';
import { confirmDestructive } from '@/lib/confirm';

const STATUS = { pending: 'Pending', sent: 'Delivered', failed: 'Failed' } as const;

function when(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export default function WebhookDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: hook, isPending } = useWebhook(id);
  const deliveries = useWebhookDeliveries(id).data ?? [];
  const update = useUpdateWebhook();
  const remove = useDeleteWebhook();
  const sendTest = useSendTestWebhook();
  const [showSecret, setShowSecret] = useState(false);

  if (isPending) return <ListSkeleton />;
  if (!hook) {
    return (
      <EmptyState
        icon="link"
        title="Webhook not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Webhook',
          headerRight: () => (
            <IconButton
              icon="trash-2"
              label="Delete webhook"
              onPress={() =>
                confirmDestructive(
                  'Delete this webhook?',
                  'Events stop being sent to this URL.',
                  () => {
                    remove(hook.id);
                    if (router.canGoBack()) router.back();
                    else router.replace('/integrations');
                  },
                )
              }
            />
          ),
        }}
      />
      <ScrollView className="flex-1 bg-bg" contentContainerClassName="pb-24">
        <View className="gap-3 px-4 pt-3">
          <Text testID="webhook-detail-url" selectable className="font-semibold">
            {hook.url}
          </Text>
          <View className="flex-row items-center gap-3">
            <Checkbox
              checked={hook.enabled}
              label="Send events to this webhook"
              onToggle={() => update(hook.id, { enabled: !hook.enabled })}
            />
            <Text>{hook.enabled ? 'On' : 'Paused'}</Text>
          </View>
          <View className="flex-row">
            <Button
              testID="webhook-test"
              label="Send test event"
              icon="send"
              variant="secondary"
              disabled={!hook.enabled}
              onPress={() => void sendTest(hook.id)}
            />
          </View>
        </View>

        <SectionHeader title="Signing secret" />
        <View className="gap-2 px-4">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showSecret ? 'Hide signing secret' : 'Show signing secret'}
            onPress={() => setShowSecret((s) => !s)}
          >
            <Text selectable={showSecret} className="font-mono">
              {showSecret ? hook.secret : '•'.repeat(24) + ' (tap to show)'}
            </Text>
          </Pressable>
          <Text variant="caption">
            Each request carries a {SIGNATURE_HEADER} header: t=timestamp,v1=HMAC-SHA256 of
            “timestamp.body” with this secret. Reject old timestamps. The payload’s id is unique per
            delivery, so retries are safe to deduplicate.
          </Text>
        </View>

        <SectionHeader title="Events" />
        <EventPicker
          value={hook.events}
          onChange={(events) => events.length > 0 && update(hook.id, { events })}
        />

        <SectionHeader title="Recent deliveries" />
        {deliveries.length === 0 ? (
          <Text variant="caption" className="px-4">
            Nothing sent yet.
          </Text>
        ) : (
          <View className="gap-px bg-border">
            {deliveries.map((d) => (
              <View
                key={d.id}
                className="min-h-[52px] flex-row items-center gap-3 bg-surface px-4 py-2"
              >
                <View className="flex-1">
                  <Text>{d.event}</Text>
                  <Text variant="caption">{when(d.created_at)}</Text>
                </View>
                <Text
                  testID={`delivery-${d.event}`}
                  variant="caption"
                  className={
                    d.status === 'failed'
                      ? 'text-danger'
                      : d.status === 'sent'
                        ? 'text-success'
                        : 'text-muted'
                  }
                >
                  {STATUS[d.status as keyof typeof STATUS] ?? d.status}
                  {d.response_status ? ` · ${d.response_status}` : ''}
                  {d.status === 'pending' && d.attempts > 0 ? ` · retry ${d.attempts}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}
