import { useEffect, useMemo, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { JSONContent } from '@tiptap/core';
import { docToMarkdown } from '@notion2/editor';
import type { Json } from '@notion2/shared';
import { EmptyState, IconButton, Skeleton } from '@/components/ui';
import { RichEditor } from '@/editor/RichEditor';
import { useDeleteNote, useNote, useSaveNote } from '@/features/notes/api';
import { useTrack } from '@/lib/analytics';
import { confirmDestructive } from '@/lib/confirm';
import { useColors } from '@/theme/useColors';

const SAVE_DEBOUNCE_MS = 600;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: note, isPending } = useNote(id);
  const save = useSaveNote();
  const remove = useDeleteNote();
  const track = useTrack();
  const colors = useColors();
  const [title, setTitle] = useState<string | null>(null);
  const pendingDoc = useRef<JSONContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The editor owns the document after first render; only the initial value is passed in.
  const initialContent = useMemo(
    () => (note?.content as JSONContent | null | undefined) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note?.id],
  );

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const doc = pendingDoc.current;
    if (!doc || !id) return;
    pendingDoc.current = null;
    save(id, { content: doc as Json, content_text: docToMarkdown(doc) });
  };

  // Save on leave.
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return (
      <View className="flex-1 gap-4 bg-bg p-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </View>
    );
  }
  if (!note) {
    return (
      <EmptyState
        icon="file"
        title="Note not found"
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  const currentTitle = title ?? note.title;

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton
              icon="trash-2"
              label="Delete note"
              onPress={() =>
                confirmDestructive('Delete note?', 'This cannot be undone.', () => {
                  pendingDoc.current = null;
                  remove(note.id);
                  router.back();
                })
              }
            />
          ),
        }}
      />
      <TextInput
        testID="note-title"
        value={currentTitle}
        onChangeText={setTitle}
        onBlur={() => {
          if (title != null && title !== note.title) save(note.id, { title: title.trim() });
        }}
        placeholder="Untitled"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Note title"
        maxFontSizeMultiplier={1.6}
        className="px-4 pb-2 pt-1 text-[26px] font-bold text-text"
      />
      <RichEditor
        initialContent={initialContent}
        placeholder="Write, or paste a list…"
        onChecklistFromPaste={(count) =>
          track('checklist_from_paste', { items: count, target: 'note' })
        }
        onChange={(doc) => {
          pendingDoc.current = doc;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
        }}
      />
    </View>
  );
}
