/**
 * Smart Paste: turns pasted multi-line text into checklist items.
 * Pure heuristics, no AI, no I/O, so it works offline and is instant.
 */

export interface ChecklistItem {
  title: string;
  checked: boolean;
  /** Nesting level derived from indentation (0 = top level). */
  depth: number;
}

export interface ParseChecklistResult {
  items: ChecklistItem[];
  /** True when input had more than `maxItems` items and the rest were dropped. */
  truncated: boolean;
}

export interface ParseChecklistOptions {
  maxItems?: number;
}

export const CHECKLIST_MAX_ITEMS = 200;
const MAX_TITLE_LENGTH = 500;
const MAX_DEPTH = 3;
const SPACES_PER_LEVEL = 2;

// Order matters: checkbox markers must be tried before plain bullets.
const CHECKBOX_RE = /^(?:[-*+•]\s*)?\[([ xX✓✔]?)\]\s*/;
const UNICODE_UNCHECKED_RE = /^[☐❏□◻◯○]\s*/;
const UNICODE_CHECKED_RE = /^[☑☒✓✔✅]\s*/;
const BULLET_RE = /^[-*+•◦▪▫‣⁃·●–—>]\s+/;
const NUMBER_RE = /^\(?\d{1,3}[.)]\s+/;
const LETTER_RE = /^\(?[a-zA-Z][.)]\s+/;
const HEADING_RE = /^#{1,6}\s+/;

interface RawLine {
  indent: number;
  text: string;
  marked: boolean;
  checked: boolean;
}

function normalize(input: string): string {
  return input
    .replace(/\r\n?|\u2028|\u2029/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');
}

function measureIndent(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += SPACES_PER_LEVEL;
    else break;
  }
  return width;
}

function stripMarker(text: string): { text: string; marked: boolean; checked: boolean } {
  const checkbox = CHECKBOX_RE.exec(text);
  if (checkbox) {
    const mark = checkbox[1] ?? '';
    return { text: text.slice(checkbox[0].length), marked: true, checked: mark.trim() !== '' };
  }
  const checked = UNICODE_CHECKED_RE.exec(text);
  if (checked) return { text: text.slice(checked[0].length), marked: true, checked: true };
  const unchecked = UNICODE_UNCHECKED_RE.exec(text);
  if (unchecked) return { text: text.slice(unchecked[0].length), marked: true, checked: false };

  for (const re of [BULLET_RE, NUMBER_RE, LETTER_RE, HEADING_RE]) {
    const m = re.exec(text);
    if (m) {
      // A bullet can wrap a checkbox: "- [x] done".
      const inner = stripMarker(text.slice(m[0].length));
      return inner.marked ? inner : { text: text.slice(m[0].length), marked: true, checked: false };
    }
  }
  return { text, marked: false, checked: false };
}

function cleanTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
}

function hasContent(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

function toRawLines(input: string): RawLine[] {
  return normalize(input)
    .split('\n')
    .map((line) => {
      const indent = measureIndent(line);
      const stripped = stripMarker(line.trim());
      return { indent, ...stripped, text: cleanTitle(stripped.text) };
    })
    .filter((l) => l.text.length > 0 && hasContent(l.text));
}

export function parseChecklist(
  input: string,
  options: ParseChecklistOptions = {},
): ParseChecklistResult {
  const maxItems = options.maxItems ?? CHECKLIST_MAX_ITEMS;
  const lines = toRawLines(input);
  const anyMarked = lines.some((l) => l.marked);

  const merged: RawLine[] = [];
  for (const line of lines) {
    const prev = merged[merged.length - 1];
    // In a marked list, an unmarked line starting lowercase is a wrapped continuation
    // of the previous item (common when copying from email clients).
    const isContinuation =
      anyMarked && prev !== undefined && !line.marked && /^[\p{Ll}]/u.test(line.text);
    if (isContinuation && prev) {
      prev.text = cleanTitle(`${prev.text} ${line.text}`);
    } else {
      merged.push({ ...line });
    }
  }

  const minIndent = merged.reduce((min, l) => Math.min(min, l.indent), Number.POSITIVE_INFINITY);
  const items = merged.map((l) => ({
    title: l.text,
    checked: l.checked,
    depth: Math.min(MAX_DEPTH, Math.floor((l.indent - minIndent) / SPACES_PER_LEVEL)),
  }));

  // Depth can only increase by one level at a time.
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const prevDepth = i === 0 ? -1 : (items[i - 1]?.depth ?? 0);
    item.depth = Math.min(item.depth, prevDepth + 1);
  }

  return { items: items.slice(0, maxItems), truncated: items.length > maxItems };
}

/**
 * Whether a paste should offer "Turn into checklist (N items)".
 * Returns the item count to show, or 0 when the text reads like prose or a single line.
 */
export function checklistOfferCount(input: string): number {
  const lines = toRawLines(input);
  if (lines.length < 2) return 0;

  const markedCount = lines.filter((l) => l.marked).length;
  if (markedCount >= 2) return parseChecklist(input).items.length;

  // Unmarked text: offer only when lines look like short list entries, not paragraphs.
  const longest = Math.max(...lines.map((l) => l.text.length));
  const avg = lines.reduce((sum, l) => sum + l.text.length, 0) / lines.length;
  const sentenceLike = lines.filter((l) => /[.!?]$/.test(l.text) && l.text.length > 60).length;
  if (longest > 200 || avg > 100 || sentenceLike > lines.length / 2) return 0;

  return parseChecklist(input).items.length;
}
