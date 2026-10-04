import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Share, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { DraftKind } from '@notion2/shared';
import { Button, Skeleton, Text } from '@/components/ui';
import { AiError, aiErrorMessage } from '@/features/ai/api';
import { parseDraft, useDraftMessage } from '@/features/ai/drafts';
import { openPaywall } from '@/features/billing/api';
import { useClient, useUpdateClient } from '@/features/clients/api';
import { useTrack } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useColors } from '@/theme/useColors';

/**
 * Client update / follow-up writer. The assistant drafts, the user edits and sends it
 * from their own email or messaging app. "Mark as sent" records the contact.
 */
export default function DraftScreen() {
  const params = useLocalSearchParams<{ kind: DraftKind; clientId: string; projectId?: string }>();
  const kind: DraftKind = params.kind === 'follow_up' ? 'follow_up' : 'client_update';
  const { data: client } = useClient(params.clientId);
  const draftMessage = useDraftMessage();
  const updateClient = useUpdateClient();
  const track = useTrack();
  const colors = useColors();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const started = useRef(false);

  const generate = async () => {
    setState('loading');
    try {
      const action = await draftMessage({
        kind,
        clientId: params.clientId,
        projectId: params.projectId ?? null,
      });
      const stored = parseDraft(action);
      if (!stored) throw new AiError('unknown');
      setSubject(stored.draft.subject);
      setBody(stored.draft.body);
      setFallback(stored.fallback);
      setState('ready');
    } catch (e) {
      setErrorCode(e instanceof AiError ? e.code : 'unknown');
      setState('error');
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const share = async () => {
    const message = Platform.OS === 'web' ? `${subject}\n\n${body}` : body;
    try {
      await Share.share({ title: subject, message });
    } catch {
      // Web without the Share API: the text stays selectable on screen.
    }
  };

  const markSent = () => {
    if (!client) return;
    updateClient(client.id, { last_contacted_at: new Date().toISOString() });
    track(kind === 'follow_up' ? 'follow_up_sent' : 'client_update_sent', { edited: false });
    haptics.success();
    toast.show(`Marked ${client.name} as contacted`);
    router.back();
  };

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="gap-4 p-4 pb-16"
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{ title: kind === 'follow_up' ? 'Follow-up draft' : 'Client update' }}
      />
      <Text variant="caption">
        {kind === 'follow_up' ? 'A friendly check-in' : 'A status update'} for{' '}
        {client?.name ?? 'your client'}. Edit anything, then send it from your own app.
      </Text>

      {state === 'loading' ? (
        <View className="gap-3" accessibilityLabel="Writing draft" accessibilityLiveRegion="polite">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </View>
      ) : state === 'error' ? (
        <View className="gap-3">
          <Text className="text-danger">{aiErrorMessage(errorCode)}</Text>
          {errorCode === 'plan_limit' ? (
            <Button
              testID="draft-upgrade"
              label="See Pro"
              icon="star"
              variant="secondary"
              onPress={() => openPaywall('ai')}
            />
          ) : (
            <Button label="Try again" variant="secondary" onPress={generate} />
          )}
        </View>
      ) : (
        <>
          {fallback ? (
            <Text variant="caption">
              The assistant wasn’t available, so this is a simple template from your tasks.
            </Text>
          ) : null}
          <TextInput
            testID="draft-subject"
            value={subject}
            onChangeText={setSubject}
            accessibilityLabel="Subject"
            placeholder="Subject"
            placeholderTextColor={colors.faint}
            maxFontSizeMultiplier={1.6}
            className="rounded-xl border border-border bg-surface px-4 py-3 text-[16px] font-semibold text-text"
          />
          <TextInput
            testID="draft-body"
            value={body}
            onChangeText={setBody}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Message"
            maxFontSizeMultiplier={1.6}
            className="min-h-[260px] rounded-xl border border-border bg-surface px-4 py-3 text-[16px] leading-[23px] text-text"
          />
          <Button testID="draft-share" label="Share or copy" icon="share" onPress={share} />
          <Button
            testID="draft-mark-sent"
            label="Mark as sent"
            variant="secondary"
            icon="check"
            onPress={markSent}
          />
          <Button
            label="Write a new version"
            variant="ghost"
            icon="refresh-cw"
            onPress={generate}
          />
        </>
      )}
    </ScrollView>
  );
}
