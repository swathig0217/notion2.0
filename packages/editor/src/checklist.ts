import type { Editor, JSONContent } from '@tiptap/core';
import { parseChecklist, type ChecklistItem } from '@notion2/shared';

/** A TipTap `taskList` node for the given items, nesting by `depth`. */
export function checklistNode(items: readonly ChecklistItem[]): JSONContent {
  const root: JSONContent = { type: 'taskList', content: [] };
  const stack: { depth: number; list: JSONContent }[] = [{ depth: 0, list: root }];

  for (const item of items) {
    while (stack.length > 1 && (stack[stack.length - 1]?.depth ?? 0) > item.depth) stack.pop();
    let top = stack[stack.length - 1] as { depth: number; list: JSONContent };

    if (item.depth > top.depth) {
      const parentItem = top.list.content?.[top.list.content.length - 1];
      if (parentItem) {
        const nested: JSONContent = { type: 'taskList', content: [] };
        parentItem.content = [...(parentItem.content ?? []), nested];
        top = { depth: top.depth + 1, list: nested };
        stack.push(top);
      }
    }

    top.list.content = [
      ...(top.list.content ?? []),
      {
        type: 'taskItem',
        attrs: { checked: item.checked },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: item.title }] }],
      },
    ];
  }
  return root;
}

/** Replaces `from..to` (typically a just-pasted range) with a checklist built from `text`. */
export function replaceRangeWithChecklist(
  editor: Editor,
  range: { from: number; to: number },
  text: string,
): boolean {
  const { items } = parseChecklist(text);
  if (items.length === 0) return false;
  return editor.chain().focus().insertContentAt(range, checklistNode(items)).run();
}

/**
 * JavaScript to run inside the native (TenTap) WebView to do the same replacement.
 * Content is passed as JSON data, never interpolated as code.
 */
export function replaceRangeWithChecklistScript(
  range: { from: number; to: number },
  text: string,
): string | null {
  const { items } = parseChecklist(text);
  if (items.length === 0) return null;
  const payload = JSON.stringify({ from: range.from, to: range.to, node: checklistNode(items) });
  return `(function(){var p=${payload};var el=document.querySelector('.ProseMirror');var ed=el&&el.editor;if(ed){ed.chain().focus().insertContentAt({from:p.from,to:p.to},p.node).run();}})();true;`;
}
