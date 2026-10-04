import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button, IconButton, Icon, Text } from '@/components/ui';
import { useAiActions } from '@/features/ai/api';
import { useInbox } from '@/features/capture/api';
import { useTrack } from '@/lib/analytics';

const KEY = 'tip.first-dump.dismissed';

/**
 * After onboarding, Today nudges the one habit that makes the app useful: dump real
 * work into it. Hidden once the user has dumped anything, or dismissed it.
 */
export function FirstRunTip() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const actions = useAiActions().data;
  const inbox = useInbox().data;
  const track = useTrack();

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setDismissed(v === '1'))
      .catch(() => setDismissed(false));
  }, []);

  const hasDumped =
    (inbox?.length ?? 0) > 0 || (actions ?? []).some((a) => a.type === 'process_inbox');
  if (dismissed !== false || !actions || hasDumped) return null;

  const dismiss = () => {
    setDismissed(true);
    void AsyncStorage.setItem(KEY, '1');
  };

  return (
    <View
      testID="first-run-tip"
      className="mx-4 mt-3 flex-row gap-3 rounded-card bg-accent-soft p-4"
      accessibilityRole="summary"
    >
      <Icon name="zap" size={20} color="accent" />
      <View className="flex-1 gap-2">
        <Text className="font-semibold">Next: dump something real</Text>
        <Text variant="caption" className="text-text">
          Paste a client email, a to-do list or a voice note. The assistant turns it into tasks for
          you to approve.
        </Text>
        <View className="flex-row">
          <Button
            label="Dump something"
            icon="plus"
            variant="secondary"
            onPress={() => {
              dismiss();
              router.push('/capture');
            }}
          />
        </View>
      </View>
      <IconButton
        icon="x"
        label="Dismiss tip"
        onPress={() => {
          dismiss();
          track('first_run_tip_dismissed');
        }}
      />
    </View>
  );
}
