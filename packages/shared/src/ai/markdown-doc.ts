/**
 * Minimal Markdown -> TipTap/ProseMirror JSON for AI-created notes (headings, paragraphs,
 * bullet lists, checklists). Matches the shared editor schema in packages/editor.
 */

interface Node {
  type: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
  text?: string;
}

const text = (t: string): Node[] => (t ? [{ type: 'text', text: t }] : []);
const paragraph = (t: string): Node => ({ type: 'paragraph', content: text(t) });

export function markdownToDoc(markdown: string): Node {
  const content: Node[] = [];
  let list: Node | null = null;

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);

    if (task) {
      if (list?.type !== 'taskList') content.push((list = { type: 'taskList', content: [] }));
      list.content?.push({
        type: 'taskItem',
        attrs: { checked: task[1] !== ' ' },
        content: [paragraph(task[2] ?? '')],
      });
      continue;
    }
    if (bullet) {
      if (list?.type !== 'bulletList') content.push((list = { type: 'bulletList', content: [] }));
      list.content?.push({ type: 'listItem', content: [paragraph(bullet[1] ?? '')] });
      continue;
    }
    list = null;
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1]?.length ?? 1 },
        content: text(heading[2] ?? ''),
      });
    } else if (line.trim()) {
      content.push(paragraph(line.trim()));
    }
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
