import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { INBOX_MAX_CHARS, parseChecklist } from '@notion2/shared';
import { Button, Text } from '@/components/ui';
import { useCaptureText } from '@/features/capture/api';
import { useCreateTask } from '@/features/tasks/api';
import { useTrack } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useColors } from '@/theme/useColors';

/**
 * "Dump it": one place to drop anything. Phase 1 saves to the Inbox (AI processing
 * arrives in Phase 2); a pasted list can become tasks right away.
 */
export default function Capture() {
  const colors = useColors();
  const [text, setText] = useState('');
  const capture = useCaptureText();
  const createTask = useCreateTask();
  const track = useTrack();
  const trimmed = text.trim();
  const listItems = trimmed.includes('\n') ? parseChecklist(trimmed).items : [];

  const save = () => {
    if (!trimmed) return;
    capture(trimmed);
    haptics.success();
    toast.show('Saved to Inbox');
    router.back();
  };

  const saveAsTasks = () => {
    for (const item of listItems)
      createTask({ title: item.title, status: item.checked ? 'done' : 'todo' });
    track('checklist_from_paste', { items: listItems.length, target: 'capture' });
    haptics.success();
    toast.show(`Added ${listItems.length} tasks`);
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg"
    >
      <View className="flex-1 p-4">
        <TextInput
          testID="capture-input"
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          maxLength={INBOX_MAX_CHARS}
          textAlignVertical="top"
          placeholder="Brain dump, client email, to-do list… anything."
          placeholderTextColor={colors.faint}
          accessibilityLabel="Capture text"
          maxFontSizeMultiplier={1.8}
          className="flex-1 text-[17px] leading-[24px] text-text"
        />
      </View>
      <View className="gap-2 border-t border-border bg-surface p-4">
        {listItems.length >= 2 ? (
          <Button
            testID="capture-as-tasks"
            label={`Add as ${listItems.length} tasks`}
            variant="secondary"
            icon="check-square"
            onPress={saveAsTasks}
          />
        ) : null}
        <Button testID="capture-save" label="Save to Inbox" disabled={!trimmed} onPress={save} />
        <Text variant="caption" className="text-center">
          Soon: AI turns every dump into a plan you approve.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
