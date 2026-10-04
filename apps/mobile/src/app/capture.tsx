import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { INBOX_MAX_CHARS, parseChecklist } from '@notion2/shared';
import { Button, Icon, Text } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import { useCaptureText } from '@/features/capture/api';
import { organize } from '@/features/ai/api';
import { useCreateTask } from '@/features/tasks/api';
import { useTrack } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useColors } from '@/theme/useColors';

type Mode = 'text' | 'voice';

const MODES = [
  { value: 'text', label: 'Type or paste' },
  { value: 'voice', label: 'Speak' },
] as const;

/**
 * "Dump it": drop anything here. It's saved to the Inbox first (works offline), then the
 * assistant organizes it into a proposal you review. Voice uses the keyboard's dictation.
 */
export default function Capture() {
  const colors = useColors();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const capture = useCaptureText();
  const createTask = useCreateTask();
  const track = useTrack();
  const trimmed = text.trim();
  const listItems = trimmed.includes('\n') ? parseChecklist(trimmed).items : [];

  const save = () => {
    if (!trimmed) return;
    const result = capture(trimmed, mode);
    if (!result) return;
    haptics.success();
    toast.show('Saved. Organizing…');
    // Organize once the dump is on the server; if offline, this waits for reconnect.
    void result.saved.then(() => organize(qc, { inboxItemId: result.row.id }));
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
      <View className="px-4 pt-3">
        <Segmented<Mode> label="Capture mode" value={mode} options={MODES} onChange={setMode} />
      </View>
      {mode === 'voice' ? (
        <View
          className="mx-4 mt-3 flex-row items-center gap-3 rounded-card bg-accent-soft p-3"
          accessibilityLiveRegion="polite"
        >
          <Icon name="mic" size={20} color="accent" />
          <Text variant="caption" className="flex-1 text-text">
            {Platform.OS === 'web'
              ? 'Use your device’s dictation to speak. Your words appear below.'
              : 'Tap the microphone on your keyboard and talk. Your words appear below.'}
          </Text>
        </View>
      ) : null}
      <View className="flex-1 p-4">
        <TextInput
          key={mode}
          testID="capture-input"
          value={text}
          onChangeText={setText}
          multiline
          autoFocus
          maxLength={INBOX_MAX_CHARS}
          textAlignVertical="top"
          placeholder={
            mode === 'voice'
              ? 'Your voice note…'
              : 'Brain dump, client email, to-do list… anything.'
          }
          placeholderTextColor={colors.faint}
          accessibilityLabel={mode === 'voice' ? 'Voice note transcript' : 'Capture text'}
          maxFontSizeMultiplier={1.8}
          className="flex-1 text-[17px] leading-[24px] text-text"
        />
      </View>
      <View className="gap-2 border-t border-border bg-surface p-4">
        {listItems.length >= 2 ? (
          <Button
            testID="capture-as-tasks"
            label={`Just add ${listItems.length} tasks`}
            variant="secondary"
            icon="check-square"
            onPress={saveAsTasks}
          />
        ) : null}
        <Button
          testID="capture-save"
          label="Dump it"
          icon="zap"
          disabled={!trimmed}
          onPress={save}
        />
        <Text variant="caption" className="text-center">
          The assistant proposes tasks and notes. Nothing changes until you approve.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
