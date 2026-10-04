import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { SmartPaste, type SmartPasteOptions } from './smart-paste';

export interface EditorExtensionOptions {
  placeholder?: string;
  onListPaste?: SmartPasteOptions['onListPaste'];
}

/**
 * The single editor schema shared by web (TipTap) and native (TenTap, which enables the
 * matching bridge extensions). Deliberately small: every feature here must be flawless.
 */
export function createExtensions(options: EditorExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      horizontalRule: false,
      // Auto-inserted trailing paragraphs caused stray empty list items; keep docs exact.
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        protocols: ['http', 'https', 'mailto'],
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: options.placeholder ?? 'Start writing…' }),
    SmartPaste.configure({ onListPaste: options.onListPaste }),
  ];
}
