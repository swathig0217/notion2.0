import type { JSONContent } from '@tiptap/core';

export interface RichEditorProps {
  initialContent: JSONContent | null;
  /** Called (debounced by the caller) whenever the document changes. */
  onChange: (doc: JSONContent) => void;
  placeholder?: string;
  /** Called when a list paste is turned into a checklist (for analytics). */
  onChecklistFromPaste?: (count: number) => void;
}

export interface PasteOffer {
  text: string;
  count: number;
  from: number;
  to: number;
}
