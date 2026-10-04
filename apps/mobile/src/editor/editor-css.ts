import type { Palette } from '@/theme/tokens';

/** Editor content styles, shared by the web editor and the native WebView. */
export function editorCss(c: Palette): string {
  return `
  .ProseMirror { outline: none; color: ${c.text}; font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 4px 16px 160px; min-height: 60vh; -webkit-user-select: text; }
  .ProseMirror p { margin: 0 0 8px; }
  .ProseMirror h1 { font-size: 26px; line-height: 1.25; margin: 16px 0 8px; font-weight: 700; }
  .ProseMirror h2 { font-size: 21px; line-height: 1.3; margin: 14px 0 6px; font-weight: 700; }
  .ProseMirror h3 { font-size: 18px; line-height: 1.35; margin: 12px 0 6px; font-weight: 600; }
  .ProseMirror a { color: ${c.accent}; text-decoration: underline; }
  .ProseMirror blockquote { border-left: 3px solid ${c.border}; margin: 8px 0; padding-left: 12px; color: ${c.muted}; }
  .ProseMirror code { background: ${c['surface-2']}; border-radius: 4px; padding: 1px 4px; font-size: 0.9em; }
  .ProseMirror ul, .ProseMirror ol { padding-left: 24px; margin: 0 0 8px; }
  .ProseMirror li > p { margin: 0 0 4px; }
  .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 2px; }
  .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 10px; }
  .ProseMirror ul[data-type="taskList"] li > label { flex: 0 0 auto; margin-top: 3px; user-select: none; }
  .ProseMirror ul[data-type="taskList"] li > label input { width: 20px; height: 20px; accent-color: ${c.accent}; }
  .ProseMirror ul[data-type="taskList"] li > div { flex: 1 1 auto; min-width: 0; }
  .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { color: ${c.faint}; text-decoration: line-through; }
  .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: ${c.faint}; float: left; height: 0; pointer-events: none; }
  `;
}
