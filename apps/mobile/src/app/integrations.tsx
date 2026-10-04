import { ScrollView, Share, View } from 'react-native';
import { router } from 'expo-router';
import { MAX_WEBHOOKS, WEBHOOK_EVENT_LABELS, type WebhookEvent } from '@notion2/shared';
import { Button, ListRow, SectionHeader, Text } from '@/components/ui';
import { useMe } from '@/features/auth/useMe';
import {
  calendarUrl,
  useSetCalendarToken,
  useWebhooks,
  webcalUrl,
} from '@/features/integrations/api';
import { confirmDestructive } from '@/lib/confirm';
import { toast } from '@/lib/toast';

/** Settings → Connections: calendar feed and webhooks (Zapier, Make, your own server). */
export default function Integrations() {
  const me = useMe().data;
  const setToken = useSetCalendarToken();
  const webhooks = useWebhooks().data ?? [];
  if (!me) return null;
  const token = me.workspace.calendar_token;

  return (
    <ScrollView className="flex-1 bg-bg" contentContainerClassName="pb-24">
      <SectionHeader title="Calendar" />
      <View className="gap-3 px-4">
        <Text variant="caption">
          See due dates for tasks, projects and invoices in Google, Apple or Outlook Calendar.
          Calendar apps refresh every few hours. Titles only; no notes or amounts.
        </Text>
        {token ? (
          <>
            <Text testID="calendar-url" selectable className="font-semibold">
              {calendarUrl(token)}
            </Text>
            <Text variant="caption">
              Google Calendar: Other calendars → From URL, paste this link. Apple Calendar: tap “Add
              to Apple Calendar”. Keep it private; anyone with it can see your due dates.
            </Text>
            <View className="flex-row flex-wrap gap-3">
              <Button
                label="Share link"
                icon="share"
                variant="secondary"
                onPress={() => void Share.share({ message: calendarUrl(token) })}
              />
              <Button
                label="Add to Apple Calendar"
                variant="ghost"
                onPress={() =>
                  void Share.share({ url: webcalUrl(token), message: webcalUrl(token) })
                }
              />
            </View>
            <View className="flex-row gap-3">
              <Button
                label="New link"
                variant="ghost"
                onPress={() =>
                  confirmDestructive(
                    'Replace the calendar link?',
                    'The current link stops working; subscribe again with the new one.',
                    async () => {
                      if (await setToken(true)) toast.show('New calendar link ready');
                    },
                    'Replace',
                  )
                }
              />
              <Button
                testID="calendar-off"
                label="Turn off"
                variant="ghost"
                onPress={() =>
                  confirmDestructive(
                    'Turn off the calendar feed?',
                    'Subscribed calendars stop updating.',
                    () => void setToken(false),
                    'Turn off',
                  )
                }
              />
            </View>
          </>
        ) : (
          <View className="flex-row">
            <Button
              testID="calendar-on"
              label="Turn on calendar feed"
              icon="calendar"
              variant="secondary"
              onPress={() => void setToken(true)}
            />
          </View>
        )}
      </View>

      <SectionHeader title="Webhooks" />
      <Text variant="caption" className="px-4 pb-3">
        Send events to Zapier, Make or your own server when tasks, clients or invoices change. Every
        request is signed so you can verify it came from us.
      </Text>
      {webhooks.length > 0 ? (
        <View className="gap-px bg-border">
          {webhooks.map((w) => (
            <ListRow
              key={w.id}
              title={w.url.replace(/^https?:\/\//, '')}
              subtitle={`${w.enabled ? '' : 'Paused · '}${w.events
                .map((e) => WEBHOOK_EVENT_LABELS[e as WebhookEvent] ?? e)
                .join(', ')}`}
              onPress={() => router.push(`/webhooks/${w.id}`)}
            />
          ))}
        </View>
      ) : null}
      <View className="flex-row px-4 pt-3">
        <Button
          testID="add-webhook"
          label="Add webhook"
          icon="plus"
          variant="secondary"
          disabled={webhooks.length >= MAX_WEBHOOKS}
          onPress={() => router.push('/webhooks/new')}
        />
      </View>
    </ScrollView>
  );
}
