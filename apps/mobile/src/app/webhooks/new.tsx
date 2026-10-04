import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { webhookUrlProblem, type WebhookEvent } from '@notion2/shared';
import { Button, SectionHeader, Text, TextField } from '@/components/ui';
import { EventPicker } from '@/features/integrations/EventPicker';
import { useCreateWebhook } from '@/features/integrations/api';
import { env } from '@/lib/env';

export default function NewWebhook() {
  const create = useCreateWebhook();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['task.completed', 'invoice.paid']);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const problem = webhookUrlProblem(url, { allowInsecure: env.webhooksAllowInsecure });
    if (problem) return setError(problem);
    if (events.length === 0) return setError('Pick at least one event.');
    const hook = create(url, events);
    if (hook) router.replace(`/webhooks/${hook.id}`);
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-2 pb-24"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-2 px-4 pt-4">
        <TextField
          testID="webhook-url"
          label="Endpoint URL"
          value={url}
          onChangeText={(t) => {
            setUrl(t);
            setError(null);
          }}
          placeholder="https://hooks.zapier.com/hooks/catch/…"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          error={error}
        />
        <Text variant="caption">
          In Zapier, use “Webhooks by Zapier → Catch Hook” and paste its URL here.
        </Text>
      </View>
      <SectionHeader title="Send these events" />
      <EventPicker value={events} onChange={setEvents} />
      <View className="px-4 pt-4">
        <Button testID="save-webhook" label="Add webhook" icon="check" onPress={save} />
      </View>
    </ScrollView>
  );
}
