export { createExtensions, type EditorExtensionOptions } from './extensions';
export {
  SmartPaste,
  smartPasteKey,
  type ListPasteEvent,
  type SmartPasteOptions,
} from './smart-paste';
export {
  checklistNode,
  replaceRangeWithChecklist,
  replaceRangeWithChecklistScript,
} from './checklist';
export { docToMarkdown } from './markdown';
export { NATIVE_LIST_PASTE_MESSAGE, nativeSmartPasteListenerScript } from './native-bridge';
export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] } as const;
