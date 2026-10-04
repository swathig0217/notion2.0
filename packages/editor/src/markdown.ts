import type { JSONContent } from '@tiptap/core';

/**
 * Serializes our editor schema to Markdown. Used for `notes.content_text` (AI context,
 * search) and data export. Unknown nodes degrade to their text content.
 */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]])/g, '\\$1');
}

function wrapMarks(text: string, marks: readonly Mark[] | undefined): string {
  if (!marks || marks.length === 0) return text;
  // Keep surrounding whitespace outside markers so "**bold **" never happens.
  const lead = /^\s*/.exec(text)?.[0] ?? '';
  const trail = /\s*$/.exec(text)?.[0] ?? '';
  let inner = text.slice(lead.length, text.length - trail.length);
  if (inner.length === 0) return text;

  for (const mark of marks) {
    switch (mark.type) {
      case 'code':
        inner = `\`${inner}\``;
        break;
      case 'bold':
        inner = `**${inner}**`;
        break;
      case 'italic':
        inner = `_${inner}_`;
        break;
      case 'strike':
        inner = `~~${inner}~~`;
        break;
      case 'link': {
        const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
        inner = `[${inner}](${href.replace(/\)/g, '%29')})`;
        break;
      }
      default:
        break;
    }
  }
  return `${lead}${inner}${trail}`;
}

function inline(nodes: readonly JSONContent[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'text') {
        const isCode = node.marks?.some((m) => m.type === 'code');
        const text = isCode ? (node.text ?? '') : escapeText(node.text ?? '');
        return wrapMarks(text, node.marks as Mark[] | undefined);
      }
      if (node.type === 'hardBreak') return '  \n';
      return inline(node.content);
    })
    .join('');
}

function indentLines(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? pad + line : line))
    .join('\n');
}

function listItemBody(item: JSONContent, markerWidth: number): string {
  const [first, ...rest] = item.content ?? [];
  const head = first ? block(first).trimEnd() : '';
  const tail = rest.map((child) => indentLines(block(child).trimEnd(), markerWidth)).join('\n');
  return tail ? `${head}\n${tail}` : head;
}

function block(node: JSONContent): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? [])
        .map(block)
        .filter((s) => s.length > 0)
        .join('\n\n');
    case 'paragraph':
      return inline(node.content);
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)));
      return `${'#'.repeat(level)} ${inline(node.content)}`;
    }
    case 'blockquote':
      return (node.content ?? [])
        .map(block)
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n');
    case 'bulletList':
      return (node.content ?? []).map((item) => `- ${listItemBody(item, 2)}`).join('\n');
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, i) => {
          const marker = `${start + i}. `;
          return `${marker}${listItemBody(item, marker.length)}`;
        })
        .join('\n');
    }
    case 'taskList':
      return (node.content ?? [])
        .map((item) => {
          const box = item.attrs?.checked ? '[x]' : '[ ]';
          return `- ${box} ${listItemBody(item, 2)}`;
        })
        .join('\n');
    case 'listItem':
    case 'taskItem':
      return listItemBody(node, 2);
    case 'codeBlock':
      return `\`\`\`\n${(node.content ?? []).map((n) => n.text ?? '').join('')}\n\`\`\``;
    case 'horizontalRule':
      return '---';
    default:
      return node.content ? (node.content ?? []).map(block).join('\n') : inline([node]);
  }
}

export function docToMarkdown(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  return block(doc).trim();
}
