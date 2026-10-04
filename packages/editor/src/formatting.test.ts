/**
 * Formatting behaviour suite. Formatting bugs are release blockers: every case here must
 * pass before shipping an editor change. Runs headless TipTap (same schema as web + native).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { createExtensions } from './extensions';
import { replaceRangeWithChecklist } from './checklist';
import { docToMarkdown } from './markdown';
import type { ListPasteEvent } from './smart-paste';

// jsdom has no ClipboardEvent; ProseMirror creates one when simulating paste.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  class ClipboardEventPolyfill extends Event {
    clipboardData: DataTransfer | null = null;
  }
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = ClipboardEventPolyfill;
}

let editors: Editor[] = [];

/** Ends the current undo group, like a pause between user actions. */
function pause(editor: Editor) {
  editor.view.dispatch(closeHistory(editor.state.tr));
}

function makeEditor(content: JSONContent | string = '', onListPaste?: (e: ListPasteEvent) => void) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new Editor({ element, extensions: createExtensions({ onListPaste }), content });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
  document.body.innerHTML = '';
});

const md = (editor: Editor) => docToMarkdown(editor.getJSON());

/** Selects the whole text of the first block. */
function selectFirstParagraph(editor: Editor) {
  const first = editor.state.doc.firstChild;
  if (!first) throw new Error('empty doc');
  editor.commands.setTextSelection({ from: 1, to: 1 + first.content.size });
}

/** Moves the cursor to the end of the text that contains `needle`. */
function cursorAfter(editor: Editor, needle: string) {
  let pos = -1;
  editor.state.doc.descendants((node, p) => {
    if (pos === -1 && node.isText && node.text?.includes(needle)) {
      pos = p + (node.text.indexOf(needle) + needle.length);
    }
  });
  if (pos === -1) throw new Error(`not found: ${needle}`);
  editor.commands.setTextSelection(pos);
}

describe('marks on a selected paragraph', () => {
  it('applies and removes bold', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFirstParagraph(editor);
    editor.commands.toggleBold();
    expect(md(editor)).toBe('**Hello world**');
    expect(editor.isActive('bold')).toBe(true);
    editor.commands.toggleBold();
    expect(md(editor)).toBe('Hello world');
  });

  it('applies and removes italic', () => {
    const editor = makeEditor('<p>Hello world</p>');
    selectFirstParagraph(editor);
    editor.commands.toggleItalic();
    expect(md(editor)).toBe('_Hello world_');
    editor.commands.toggleItalic();
    expect(md(editor)).toBe('Hello world');
  });

  it('combines bold and italic on the same selection', () => {
    const editor = makeEditor('<p>Both</p>');
    selectFirstParagraph(editor);
    editor.commands.toggleBold();
    editor.commands.toggleItalic();
    expect(editor.isActive('bold')).toBe(true);
    expect(editor.isActive('italic')).toBe(true);
    const marks = editor.getJSON().content?.[0]?.content?.[0]?.marks?.map((m) => m.type);
    expect(marks?.sort()).toEqual(['bold', 'italic']);
  });

  it('bolding a partly-bold selection makes all of it bold', () => {
    const editor = makeEditor('<p>one <strong>two</strong> three</p>');
    selectFirstParagraph(editor);
    editor.commands.toggleBold();
    expect(md(editor)).toBe('**one two three**');
  });

  it('applies bold only to the selected range', () => {
    const editor = makeEditor('<p>one two three</p>');
    editor.commands.setTextSelection({ from: 5, to: 8 });
    editor.commands.toggleBold();
    expect(md(editor)).toBe('one **two** three');
  });

  it('stored marks apply to text typed next', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain ' }] }],
    });
    editor.commands.focus('end');
    editor.commands.toggleBold();
    editor.commands.insertContent('loud');
    expect(md(editor)).toBe('Plain **loud**');
  });

  it('applies bold across multiple paragraphs', () => {
    const editor = makeEditor('<p>first</p><p>second</p>');
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(md(editor)).toBe('**first**\n\n**second**');
  });

  it('strike and inline code', () => {
    const editor = makeEditor('<p>gone code</p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    editor.commands.toggleStrike();
    editor.commands.setTextSelection({ from: 6, to: 10 });
    editor.commands.toggleCode();
    expect(md(editor)).toBe('~~gone~~ `code`');
  });
});

describe('headings', () => {
  it('toggles heading levels and back to paragraph', () => {
    const editor = makeEditor('<p>Title</p>');
    editor.commands.setTextSelection(2);
    editor.commands.toggleHeading({ level: 1 });
    expect(md(editor)).toBe('# Title');
    editor.commands.toggleHeading({ level: 2 });
    expect(md(editor)).toBe('## Title');
    editor.commands.toggleHeading({ level: 2 });
    expect(md(editor)).toBe('Title');
  });

  it('only allows levels 1-3', () => {
    const editor = makeEditor('<h5>Small</h5>');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
  });

  it('markdown shortcut "# " creates a heading', () => {
    const editor = makeEditor('');
    editor.commands.focus();
    typeText(editor, '# ');
    expect(editor.getJSON().content?.[0]?.type).toBe('heading');
  });
});

describe('lists', () => {
  it('toggles a bullet list on and off', () => {
    const editor = makeEditor('<p>a</p><p>b</p>');
    editor.commands.selectAll();
    editor.commands.toggleBulletList();
    expect(md(editor)).toBe('- a\n- b');
    editor.commands.toggleBulletList();
    expect(md(editor)).toBe('a\n\nb');
  });

  it('switches bullet list to ordered list', () => {
    const editor = makeEditor('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    editor.commands.selectAll();
    editor.commands.toggleOrderedList();
    expect(md(editor)).toBe('1. a\n2. b');
  });

  it('indents and outdents nested bullet items', () => {
    const editor = makeEditor('<ul><li><p>parent</p></li><li><p>child</p></li></ul>');
    cursorAfter(editor, 'child');
    expect(editor.commands.sinkListItem('listItem')).toBe(true);
    expect(md(editor)).toBe('- parent\n  - child');
    expect(editor.commands.liftListItem('listItem')).toBe(true);
    expect(md(editor)).toBe('- parent\n- child');
  });

  it('nests three levels deep and serializes indentation', () => {
    const editor = makeEditor(
      '<ul><li><p>one</p><ul><li><p>two</p><ul><li><p>three</p></li></ul></li></ul></li></ul>',
    );
    expect(md(editor)).toBe('- one\n  - two\n    - three');
  });

  it('ordered lists keep numbering and start', () => {
    const editor = makeEditor('<ol start="3"><li><p>c</p></li><li><p>d</p></li></ol>');
    expect(md(editor)).toBe('3. c\n4. d');
  });

  it('Enter on an empty list item exits the list', () => {
    const editor = makeEditor('<ul><li><p>item</p></li></ul>');
    cursorAfter(editor, 'item');
    editor.commands.splitListItem('listItem');
    editor.commands.liftListItem('listItem');
    expect(editor.getJSON().content?.map((n) => n.type)).toEqual(['bulletList', 'paragraph']);
  });

  it('"- " markdown shortcut starts a bullet list', () => {
    const editor = makeEditor('');
    editor.commands.focus();
    typeText(editor, '- ');
    expect(editor.getJSON().content?.[0]?.type).toBe('bulletList');
  });
});

describe('checklists', () => {
  it('toggles a task list and checks items', () => {
    const editor = makeEditor('<p>buy milk</p>');
    editor.commands.setTextSelection(2);
    editor.commands.toggleTaskList();
    expect(md(editor)).toBe('- [ ] buy milk');
    editor.commands.updateAttributes('taskItem', { checked: true });
    expect(md(editor)).toBe('- [x] buy milk');
  });

  it('nests task items', () => {
    const editor = makeEditor(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>a</p></li><li data-type="taskItem" data-checked="true"><p>b</p></li></ul>',
    );
    cursorAfter(editor, 'b');
    expect(editor.commands.sinkListItem('taskItem')).toBe(true);
    expect(md(editor)).toBe('- [ ] a\n  - [x] b');
  });

  it('"[ ] " markdown shortcut starts a checklist', () => {
    const editor = makeEditor('');
    editor.commands.focus();
    typeText(editor, '[ ] ');
    expect(editor.getJSON().content?.[0]?.type).toBe('taskList');
  });
});

describe('links', () => {
  it('adds, edits and removes a link', () => {
    const editor = makeEditor('<p>site</p>');
    selectFirstParagraph(editor);
    editor.commands.setLink({ href: 'https://example.com' });
    expect(md(editor)).toBe('[site](https://example.com)');
    selectFirstParagraph(editor);
    editor.commands.setLink({ href: 'https://example.org' });
    expect(md(editor)).toBe('[site](https://example.org)');
    selectFirstParagraph(editor);
    editor.commands.unsetLink();
    expect(md(editor)).toBe('site');
  });

  it('rejects javascript: links', () => {
    const editor = makeEditor('<p><a href="javascript:alert(1)">x</a></p>');
    const marks = editor.getJSON().content?.[0]?.content?.[0]?.marks ?? [];
    expect(marks.some((m) => String(m.attrs?.href ?? '').startsWith('javascript'))).toBe(false);
  });
});

describe('undo / redo', () => {
  it('undoes and redoes bold', () => {
    const editor = makeEditor('<p>text</p>');
    selectFirstParagraph(editor);
    editor.commands.toggleBold();
    pause(editor);
    editor.commands.undo();
    expect(md(editor)).toBe('text');
    editor.commands.redo();
    expect(md(editor)).toBe('**text**');
  });

  it('undoes list toggles, heading changes and typing in order', () => {
    const editor = makeEditor('<p>a</p>');
    editor.commands.setTextSelection(2);
    editor.commands.toggleHeading({ level: 1 });
    pause(editor);
    editor.commands.toggleBulletList();
    editor.commands.undo();
    expect(md(editor)).toBe('# a');
    editor.commands.undo();
    expect(md(editor)).toBe('a');
    editor.commands.redo();
    editor.commands.redo();
    // List items start with a paragraph, so the heading becomes the item text.
    expect(md(editor)).toBe('- a');
  });

  it('undoes a paste in one step', () => {
    const editor = makeEditor('<p>start</p>');
    editor.commands.focus('end');
    pause(editor);
    editor.view.pasteText(' pasted words');
    expect(md(editor)).toBe('start pasted words');
    editor.commands.undo();
    expect(md(editor)).toBe('start');
  });

  it('undoes a checklist conversion in one step', () => {
    const editor = makeEditor('<p></p>');
    editor.commands.focus();
    editor.view.pasteText('milk\neggs');
    const before = md(editor);
    pause(editor);
    const end = editor.state.selection.to;
    replaceRangeWithChecklist(editor, { from: 1, to: end }, 'milk\neggs');
    expect(md(editor)).toBe('- [ ] milk\n- [ ] eggs');
    editor.commands.undo();
    expect(md(editor)).toBe(before);
  });
});

describe('paste handling', () => {
  it('pastes plain multi-line text as paragraphs', () => {
    const editor = makeEditor('');
    editor.commands.focus();
    editor.view.pasteText('line one\nline two');
    expect(md(editor)).toContain('line one');
    expect(md(editor)).toContain('line two');
  });

  it('Gmail HTML keeps bold/italic/links and drops styling noise', () => {
    const html =
      '<div dir="ltr"><div style="font-family:arial,sans-serif;font-size:small;color:#222">Hi <b>Sam</b>,</div>' +
      '<div><i>Thanks</i> for the <a href="https://acme.example/brief" target="_blank">brief</a>.</div>' +
      '<div><br></div><div><font color="#888888">--<br>Alex</font></div></div>';
    const editor = makeEditor('');
    editor.commands.focus();
    editor.view.pasteHTML(html);
    const out = md(editor);
    expect(out).toContain('**Sam**');
    expect(out).toContain('_Thanks_');
    expect(out).toContain('[brief](https://acme.example/brief)');
    expect(out).not.toMatch(/color|font-family|style=/);
  });

  it('Google Docs HTML does not turn everything bold', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-abc"><p dir="ltr"><span style="font-weight:400">Normal text </span><span style="font-weight:700">bold bit</span></p></b>';
    const editor = makeEditor('');
    editor.commands.focus();
    editor.view.pasteHTML(html);
    expect(md(editor)).toBe('Normal text **bold bit**');
  });

  it('Notion HTML keeps headings, lists and checklists', () => {
    const html =
      '<h2>Plan</h2><ul><li>Research</li><li>Draft</li></ul>' +
      '<ul class="to-do-list"><li><div class="checkbox checkbox-off"></div><span>Send invoice</span></li></ul>';
    const editor = makeEditor('');
    editor.commands.focus();
    editor.view.pasteHTML(html);
    const out = md(editor);
    expect(out).toContain('## Plan');
    expect(out).toContain('- Research\n- Draft');
    expect(out).toContain('Send invoice');
  });

  it('web page HTML drops scripts, styles, images and unsupported blocks safely', () => {
    const html =
      '<style>p{color:red}</style><script>alert(1)</script><h4>Sub</h4><p>Body <u>under</u> <img src="x.png"> text</p><table><tr><td>cell</td></tr></table><hr>';
    const editor = makeEditor('');
    editor.commands.focus();
    editor.view.pasteHTML(html);
    const out = md(editor);
    expect(out).not.toContain('alert');
    expect(out).not.toContain('color:red');
    expect(out).toContain('Body under text');
    expect(out).toContain('cell');
  });

  it('pasting HTML task lists keeps checked state', () => {
    const html =
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>done</p></li><li data-type="taskItem" data-checked="false"><p>todo</p></li></ul>';
    const editor = makeEditor('');
    editor.commands.focus();
    editor.view.pasteHTML(html);
    expect(md(editor)).toBe('- [x] done\n- [ ] todo');
  });
});

describe('smart paste offer', () => {
  it('reports a list paste with item count and pasted range', async () => {
    const onListPaste = vi.fn();
    const editor = makeEditor('', onListPaste);
    editor.commands.focus();
    editor.view.pasteText('- milk\n- eggs\n- bread');
    await Promise.resolve();
    expect(onListPaste).toHaveBeenCalledTimes(1);
    const event = onListPaste.mock.calls[0]?.[0] as ListPasteEvent;
    expect(event.count).toBe(3);
    expect(event.to).toBeGreaterThan(event.from);
  });

  it('does not report single-line or prose pastes', async () => {
    const onListPaste = vi.fn();
    const editor = makeEditor('', onListPaste);
    editor.commands.focus();
    editor.view.pasteText('just one line');
    editor.view.pasteText(
      'This is a long sentence that reads like prose and should not become a checklist at all.\nAnd here is another long sentence that also reads like prose in a normal email.',
    );
    await Promise.resolve();
    expect(onListPaste).not.toHaveBeenCalled();
  });

  it('does not report pastes inside an existing checklist', async () => {
    const onListPaste = vi.fn();
    const editor = makeEditor(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>a</p></li></ul>',
      onListPaste,
    );
    cursorAfter(editor, 'a');
    editor.view.pasteText('x\ny');
    await Promise.resolve();
    expect(onListPaste).not.toHaveBeenCalled();
  });

  it('converts the pasted range into a checklist, keeping surrounding content', async () => {
    let event: ListPasteEvent | undefined;
    const editor = makeEditor('<p>Before</p><p></p><p>After</p>', (e) => (event = e));
    editor.commands.setTextSelection(9); // empty middle paragraph
    editor.view.pasteText('1. Draft proposal\n2. [x] Kickoff call\n   - Agenda');
    await Promise.resolve();
    expect(event).toBeDefined();
    if (!event) return;
    replaceRangeWithChecklist(editor, event, event.text);
    expect(md(editor)).toBe(
      'Before\n\n- [ ] Draft proposal\n- [x] Kickoff call\n  - [ ] Agenda\n\nAfter',
    );
  });

  it('handles a 20-item paste', async () => {
    let event: ListPasteEvent | undefined;
    const editor = makeEditor('', (e) => (event = e));
    editor.commands.focus();
    const text = Array.from({ length: 20 }, (_, i) => `Task ${i + 1}`).join('\n');
    editor.view.pasteText(text);
    await Promise.resolve();
    expect(event?.count).toBe(20);
    if (!event) return;
    replaceRangeWithChecklist(editor, event, event.text);
    const list = editor.getJSON().content?.find((n) => n.type === 'taskList');
    expect(list?.content).toHaveLength(20);
  });
});

describe('markdown round trip', () => {
  it('serializes a mixed document', () => {
    const editor = makeEditor(
      '<h1>Kickoff</h1><p>With <strong>Acme</strong> and <em>Bolt</em>, see <a href="https://x.example">doc</a>.</p>' +
        '<blockquote><p>Quote</p></blockquote>' +
        '<ul><li><p>a</p></li></ul><ol><li><p>b</p></li></ol>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>c</p></li></ul>',
    );
    expect(md(editor)).toBe(
      '# Kickoff\n\nWith **Acme** and _Bolt_, see [doc](https://x.example).\n\n> Quote\n\n- a\n\n1. b\n\n- [ ] c',
    );
  });

  it('escapes markdown characters in plain text', () => {
    const editor = makeEditor('<p>2*3 = 6 and [not a link]</p>');
    expect(md(editor)).toBe('2\\*3 = 6 and \\[not a link\\]');
  });

  it('keeps whitespace outside of mark delimiters', () => {
    const editor = makeEditor('<p><strong>bold </strong>next</p>');
    expect(md(editor)).toBe('**bold** next');
  });

  it('JSON survives a reload into a fresh editor unchanged', () => {
    const editor = makeEditor(
      '<h2>T</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p><strong>x</strong></p></li></ul>',
    );
    const json = editor.getJSON();
    const reloaded = makeEditor(json);
    expect(reloaded.getJSON()).toEqual(json);
  });
});

/** Simulates typing so input rules (markdown shortcuts) fire. */
function typeText(editor: Editor, text: string) {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp('handleTextInput', (f) =>
      f(editor.view, from, to, ch, () => editor.state.tr.insertText(ch, from, to)),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to));
  }
}
