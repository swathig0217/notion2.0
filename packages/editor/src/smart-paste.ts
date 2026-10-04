import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Slice } from '@tiptap/pm/model';
import { checklistOfferCount } from '@notion2/shared';

export interface ListPasteEvent {
  /** Plain text of what was pasted. */
  text: string;
  /** Number of checklist items the paste would become. */
  count: number;
  /** Document range now occupied by the pasted content. */
  from: number;
  to: number;
}

export interface SmartPasteOptions {
  onListPaste?: (event: ListPasteEvent) => void;
}

export const smartPasteKey = new PluginKey('smartPaste');

function sliceContainsTaskList(slice: Slice): boolean {
  let found = false;
  slice.content.descendants((node) => {
    if (node.type.name === 'taskList') found = true;
    return !found;
  });
  return found;
}

/**
 * Lets every paste happen normally (so paste never breaks), then reports multi-line,
 * list-like pastes so the UI can offer "Turn into checklist (N items)".
 */
export const SmartPaste = Extension.create<SmartPasteOptions>({
  name: 'smartPaste',

  addOptions() {
    return { onListPaste: undefined };
  },

  addProseMirrorPlugins() {
    const { onListPaste } = this.options;
    return [
      new Plugin({
        key: smartPasteKey,
        props: {
          handlePaste: (view, event, slice) => {
            if (!onListPaste) return false;
            if (sliceContainsTaskList(slice)) return false;
            const { $from } = view.state.selection;
            for (let d = $from.depth; d > 0; d--) {
              if ($from.node(d).type.name === 'taskItem') return false;
            }

            const text =
              event.clipboardData?.getData('text/plain') ||
              slice.content.textBetween(0, slice.content.size, '\n', '\n');
            const count = checklistOfferCount(text);
            if (count < 2) return false;

            const from = view.state.selection.from;
            // Report after ProseMirror has applied the default paste.
            queueMicrotask(() => {
              onListPaste({ text, count, from, to: view.state.selection.to });
            });
            return false;
          },
        },
      }),
    ];
  },
});
