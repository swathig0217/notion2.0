import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { INBOX_MAX_CHARS, parseChecklist } from '@notion2/shared';
import { Button, Icon, Text } from '@/components/ui';
import { Segmented } from '@/components/Segmented';
import {
  MAX_IMAGE_BYTES,
  useCaptureImage,
  useCaptureText,
  type PickedImage,
} from '@/features/capture/api';
import { organize } from '@/features/ai/api';
import { useCreateTask } from '@/features/tasks/api';
import { useTrack } from '@/lib/analytics';
import { haptics } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useColors } from '@/theme/useColors';
import { takePendingShare } from '@/features/share/pending';

type Mode = 'text' | 'voice' | 'image';

const MODES = [
  { value: 'text', label: 'Type' },
  { value: 'voice', label: 'Speak' },
  { value: 'image', label: 'Screenshot' },
] as const;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * "Dump it": drop anything here. It's saved to the Inbox first (works offline), then the
 * assistant organizes it into a proposal you review. Voice uses the keyboard's dictation.
 */
export default function Capture() {
  const colors = useColors();
  const qc = useQueryClient();
  const { shared } = useLocalSearchParams<{ shared?: string }>();
  // Content shared from another app (OS share sheet) prefills the screen once.
  const [initial] = useState(() => (shared ? takePendingShare() : null));
  const [mode, setMode] = useState<Mode>(initial?.mode ?? 'text');
  const [text, setText] = useState(initial?.text ?? '');
  const capture = useCaptureText();
  const captureImage = useCaptureImage();
  const [image, setImage] = useState<PickedImage | null>(
    initial?.mode === 'image' ? initial.image : null,
  );
  const [uploading, setUploading] = useState(false);

  const pick = async (source: 'library' | 'camera') => {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        toast.error('Camera access is off for this app.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const mimeType = asset.mimeType ?? 'image/jpeg';
    if (!ALLOWED.has(mimeType)) {
      toast.error('Use a JPEG, PNG or WebP image.');
      return;
    }
    if (asset.fileSize && asset.fileSize > MAX_IMAGE_BYTES) {
      toast.error('That image is larger than 5 MB.');
      return;
    }
    setImage({ uri: asset.uri, mimeType, fileSize: asset.fileSize ?? null });
  };

  const saveImage = async () => {
    if (!image) return;
    setUploading(true);
    try {
      const row = await captureImage(image, text);
      haptics.success();
      toast.show('Saved. Organizing…');
      void organize(qc, { inboxItemId: row.id });
      router.back();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(
        msg === 'too_large'
          ? 'That image is larger than 5 MB.'
          : 'Couldn’t upload the image. Check your connection.',
      );
    } finally {
      setUploading(false);
    }
  };
  const createTask = useCreateTask();
  const track = useTrack();
  const trimmed = text.trim();
  const listItems = trimmed.includes('\n') ? parseChecklist(trimmed).items : [];

  const save = () => {
    if (!trimmed) return;
    if (mode === 'image') return;
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
      {mode === 'image' ? (
        <View className="flex-1 gap-3 p-4">
          {image ? (
            <Image
              source={{ uri: image.uri }}
              accessibilityLabel="Selected screenshot"
              resizeMode="contain"
              className="h-64 w-full rounded-card bg-surface-2"
            />
          ) : (
            <View className="h-40 items-center justify-center gap-2 rounded-card border border-dashed border-border">
              <Icon name="image" size={28} color="faint" />
              <Text variant="caption">A chat, an email, a whiteboard, a handwritten list…</Text>
            </View>
          )}
          <View className="flex-row gap-3">
            <Button
              testID="pick-image"
              label={image ? 'Choose another' : 'Choose image'}
              variant="secondary"
              icon="image"
              onPress={() => void pick('library')}
              className="flex-1"
            />
            {Platform.OS !== 'web' ? (
              <Button
                label="Take photo"
                variant="secondary"
                icon="camera"
                onPress={() => void pick('camera')}
                className="flex-1"
              />
            ) : null}
          </View>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a note (optional)"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Note about the image"
            maxLength={500}
            className="min-h-[48px] rounded-xl border border-border bg-surface px-4 py-3 text-[16px] text-text"
          />
        </View>
      ) : (
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
      )}
      <View className="gap-2 border-t border-border bg-surface p-4">
        {mode !== 'image' && listItems.length >= 2 ? (
          <Button
            testID="capture-as-tasks"
            label={`Just add ${listItems.length} tasks`}
            variant="secondary"
            icon="check-square"
            onPress={saveAsTasks}
          />
        ) : null}
        {mode === 'image' ? (
          <Button
            testID="capture-save-image"
            label={uploading ? 'Uploading…' : 'Dump it'}
            icon="zap"
            disabled={!image || uploading}
            onPress={() => void saveImage()}
          />
        ) : (
          <Button
            testID="capture-save"
            label="Dump it"
            icon="zap"
            disabled={!trimmed}
            onPress={save}
          />
        )}
        <Text variant="caption" className="text-center">
          The assistant proposes tasks and notes. Nothing changes until you approve.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
