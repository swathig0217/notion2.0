import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { createExtensions, replaceRangeWithChecklist } from '@notion2/editor';
import { useColors } from '@/theme/useColors';
import { editorCss } from './editor-css';
import { PasteOfferBar } from './PasteOfferBar';
import { ToolbarButton } from './ToolbarButton';
import type { PasteOffer, RichEditorProps } from './types';

export function RichEditor({
  initialContent,
  onChange,
  placeholder,
  onChecklistFromPaste,
}: RichEditorProps) {
  const colors = useColors();
  const [offer, setOffer] = useState<PasteOffer | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => createExtensions({ placeholder, onListPaste: (e) => setOffer(e) }),
    [placeholder],
  );

  const editor = useEditor({
    extensions,
    content: initialContent ?? '',
    immediatelyRender: true,
    editorProps: { attributes: { 'aria-label': 'Note body', 'data-testid': 'note-editor' } },
    onUpdate: ({ editor: ed, transaction }) => {
      onChangeRef.current(ed.getJSON());
      // Any edit after the paste (other than the paste itself) withdraws the offer.
      if (transaction.docChanged && !transaction.getMeta('paste')) setOffer(null);
    },
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      h1: ed.isActive('heading', { level: 1 }),
      h2: ed.isActive('heading', { level: 2 }),
      bullet: ed.isActive('bulletList'),
      task: ed.isActive('taskList'),
      link: ed.isActive('link'),
      canUndo: ed.can().undo(),
      canRedo: ed.can().redo(),
    }),
  });

  useEffect(() => () => editor.destroy(), [editor]);

  const css = useMemo(() => editorCss(colors), [colors]);

  const toggleLink = () => {
    if (state.link) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    const href = window.prompt('Link URL');
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <View className="flex-1">
      <style>{css}</style>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="toolbar"
        className="max-h-[52px] grow-0 border-b border-border"
        contentContainerClassName="items-center gap-1 px-3 py-1"
      >
        <ToolbarButton
          label="Bold"
          text="B"
          active={state.bold}
          onPress={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          icon="italic"
          active={state.italic}
          onPress={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Heading 1"
          text="H1"
          active={state.h1}
          onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        />
        <ToolbarButton
          label="Heading 2"
          text="H2"
          active={state.h2}
          onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        />
        <ToolbarButton
          label="Bulleted list"
          icon="list"
          active={state.bullet}
          onPress={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Checklist"
          icon="check-square"
          active={state.task}
          onPress={() => editor.chain().focus().toggleTaskList().run()}
        />
        <ToolbarButton
          label={state.link ? 'Remove link' : 'Add link'}
          icon="link"
          active={state.link}
          onPress={toggleLink}
        />
        <ToolbarButton
          label="Undo"
          icon="corner-up-left"
          disabled={!state.canUndo}
          onPress={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo"
          icon="corner-up-right"
          disabled={!state.canRedo}
          onPress={() => editor.chain().focus().redo().run()}
        />
      </ScrollView>
      {offer ? (
        <PasteOfferBar
          offer={offer}
          onDismiss={() => setOffer(null)}
          onAccept={() => {
            replaceRangeWithChecklist(editor, offer, offer.text);
            onChecklistFromPaste?.(offer.count);
            setOffer(null);
          }}
        />
      ) : null}
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <EditorContent editor={editor} />
      </ScrollView>
    </View>
  );
}
