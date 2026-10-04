import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import {
  BlockquoteBridge,
  BoldBridge,
  BridgeExtension,
  BulletListBridge,
  CodeBridge,
  CoreBridge,
  DropCursorBridge,
  HardBreakBridge,
  HeadingBridge,
  HistoryBridge,
  ItalicBridge,
  LinkBridge,
  ListItemBridge,
  OrderedListBridge,
  PlaceholderBridge,
  RichText,
  StrikeBridge,
  TaskListBridge,
  UnderlineBridge,
  useBridgeState,
  useEditorBridge,
} from '@10play/tentap-editor';
import { checklistOfferCount } from '@notion2/shared';
import {
  NATIVE_LIST_PASTE_MESSAGE,
  nativeSmartPasteListenerScript,
  replaceRangeWithChecklistScript,
} from '@notion2/editor';
import { useColors } from '@/theme/useColors';
import { editorCss } from './editor-css';
import { PasteOfferBar } from './PasteOfferBar';
import { ToolbarButton } from './ToolbarButton';
import type { PasteOffer, RichEditorProps } from './types';

type PastePayload = { text: string; from: number; to: number };

/**
 * Native editor: TipTap inside TenTap's WebView. Only the bridges matching our shared
 * schema are enabled, so documents round-trip unchanged between web and native.
 */
export function RichEditor({
  initialContent,
  onChange,
  placeholder,
  onChecklistFromPaste,
}: RichEditorProps) {
  const colors = useColors();
  const [offer, setOffer] = useState<PasteOffer | null>(null);
  const pendingPaste = useRef(false);
  const onPasteRef = useRef<(p: PastePayload) => void>(() => {});
  onPasteRef.current = (p) => {
    const count = checklistOfferCount(p.text);
    setOffer(count >= 2 ? { ...p, count } : null);
  };

  const css = useMemo(() => editorCss(colors), [colors]);

  const bridgeExtensions = useMemo(() => {
    const smartPaste = new BridgeExtension<object, object, { type: string; payload: unknown }>({
      forceName: 'n2SmartPaste',
      onEditorMessage: (message) => {
        if (message.type !== NATIVE_LIST_PASTE_MESSAGE) return false;
        pendingPaste.current = true;
        onPasteRef.current(message.payload as PastePayload);
        return true;
      },
    });
    return [
      CoreBridge.configureCSS(css),
      BoldBridge,
      ItalicBridge,
      StrikeBridge,
      UnderlineBridge,
      CodeBridge,
      HeadingBridge,
      BulletListBridge,
      OrderedListBridge,
      ListItemBridge,
      TaskListBridge.configureExtension({ nested: true }),
      LinkBridge.configureExtension({ openOnClick: false }),
      BlockquoteBridge,
      HardBreakBridge,
      HistoryBridge,
      DropCursorBridge,
      PlaceholderBridge.configureExtension({ placeholder: placeholder ?? 'Start writing…' }),
      smartPaste,
    ];
  }, [css, placeholder]);

  const editor = useEditorBridge({
    bridgeExtensions,
    initialContent: initialContent ?? '',
    avoidIosKeyboard: true,
    onChange: () => {
      void editor.getJSON().then((doc) => onChange(doc));
      // The content update that carries the paste arrives before our paste message;
      // anything after that withdraws the offer.
      if (!pendingPaste.current) setOffer(null);
      pendingPaste.current = false;
    },
  });
  const state = useBridgeState(editor);

  useEffect(() => {
    if (state.isReady) editor.injectJS(nativeSmartPasteListenerScript);
  }, [state.isReady, editor]);

  // Typed and pasted URLs are auto-linked. Adding a link to selected text needs a prompt,
  // which only iOS has natively.
  const canAddLink = Platform.OS === 'ios';
  const toggleLink = () => {
    if (state.isLinkActive) editor.setLink(null);
    else if (canAddLink) Alert.prompt('Link URL', undefined, (url) => url && editor.setLink(url));
  };

  return (
    <View className="flex-1">
      {offer ? (
        <PasteOfferBar
          offer={offer}
          onDismiss={() => setOffer(null)}
          onAccept={() => {
            const script = replaceRangeWithChecklistScript(offer, offer.text);
            if (script) editor.injectJS(script);
            onChecklistFromPaste?.(offer.count);
            setOffer(null);
          }}
        />
      ) : null}
      <RichText editor={editor} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          accessibilityRole="toolbar"
          className="border-t border-border bg-surface"
          contentContainerClassName="items-center gap-1 px-2 py-1"
        >
          <ToolbarButton
            label="Bold"
            text="B"
            active={state.isBoldActive}
            onPress={editor.toggleBold}
          />
          <ToolbarButton
            label="Italic"
            icon="italic"
            active={state.isItalicActive}
            onPress={editor.toggleItalic}
          />
          <ToolbarButton
            label="Heading 1"
            text="H1"
            active={state.headingLevel === 1}
            onPress={() => editor.toggleHeading(1)}
          />
          <ToolbarButton
            label="Heading 2"
            text="H2"
            active={state.headingLevel === 2}
            onPress={() => editor.toggleHeading(2)}
          />
          <ToolbarButton
            label="Bulleted list"
            icon="list"
            active={state.isBulletListActive}
            onPress={editor.toggleBulletList}
          />
          <ToolbarButton
            label="Checklist"
            icon="check-square"
            active={state.isTaskListActive}
            onPress={editor.toggleTaskList}
          />
          <ToolbarButton
            label="Indent"
            icon="chevrons-right"
            onPress={() => (state.isTaskListActive ? editor.sinkTaskListItem() : editor.sink())}
          />
          <ToolbarButton
            label="Outdent"
            icon="chevrons-left"
            onPress={() => (state.isTaskListActive ? editor.liftTaskListItem() : editor.lift())}
          />
          {state.isLinkActive || canAddLink ? (
            <ToolbarButton
              label={state.isLinkActive ? 'Remove link' : 'Add link'}
              icon="link"
              active={state.isLinkActive}
              onPress={toggleLink}
            />
          ) : null}
          <ToolbarButton
            label="Undo"
            icon="corner-up-left"
            disabled={!state.canUndo}
            onPress={editor.undo}
          />
          <ToolbarButton
            label="Redo"
            icon="corner-up-right"
            disabled={!state.canRedo}
            onPress={editor.redo}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
