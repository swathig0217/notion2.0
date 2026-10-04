import { describe, expect, it } from 'vitest';
import { checklistOfferCount, parseChecklist } from './parse-checklist.ts';

const titles = (input: string) => parseChecklist(input).items.map((i) => i.title);

describe('parseChecklist', () => {
  it('splits plain lines', () => {
    expect(titles('Buy milk\nCall Sam\nSend invoice')).toEqual([
      'Buy milk',
      'Call Sam',
      'Send invoice',
    ]);
  });

  it('handles CRLF and CR line endings', () => {
    expect(titles('a one\r\nb two\rc three')).toEqual(['a one', 'b two', 'c three']);
  });

  it('drops blank and whitespace-only lines', () => {
    expect(titles('\n\nOne\n   \n\tTwo\n\n')).toEqual(['One', 'Two']);
  });

  it.each([
    ['- dash', 'dash'],
    ['* star', 'star'],
    ['+ plus', 'plus'],
    ['• bullet', 'bullet'],
    ['◦ hollow', 'hollow'],
    ['▪ square', 'square'],
    ['– en dash', 'en dash'],
    ['— em dash', 'em dash'],
    ['· middle dot', 'middle dot'],
    ['> quoted', 'quoted'],
    ['1. numbered', 'numbered'],
    ['12) paren', 'paren'],
    ['(3) wrapped', 'wrapped'],
    ['a. letter', 'letter'],
    ['B) letter', 'letter'],
    ['## heading', 'heading'],
  ])('strips marker %j', (line, expected) => {
    expect(titles(`${line}\nSecond`)[0]).toBe(expected);
  });

  it('reads markdown checkboxes and their state', () => {
    const { items } = parseChecklist('- [ ] open\n- [x] done\n[X] also done\n- [] empty box');
    expect(items).toEqual([
      { title: 'open', checked: false, depth: 0 },
      { title: 'done', checked: true, depth: 0 },
      { title: 'also done', checked: true, depth: 0 },
      { title: 'empty box', checked: false, depth: 0 },
    ]);
  });

  it('reads unicode checkboxes', () => {
    const { items } = parseChecklist('☐ todo\n☑ done\n✅ shipped\n✔ fixed');
    expect(items.map((i) => i.checked)).toEqual([false, true, true, true]);
    expect(items.map((i) => i.title)).toEqual(['todo', 'done', 'shipped', 'fixed']);
  });

  it('does not strip numbers that are part of the text', () => {
    expect(titles('2024 budget review\n1.5 hours on logo\n10am call')).toEqual([
      '2024 budget review',
      '1.5 hours on logo',
      '10am call',
    ]);
  });

  it('does not treat a hyphen without a space as a bullet', () => {
    expect(titles('-5% discount\nfollow-up')).toEqual(['-5% discount', 'follow-up']);
  });

  it('collapses internal whitespace and trims', () => {
    expect(titles('  -   Call    the   printer  \nNext')).toEqual(['Call the printer', 'Next']);
  });

  it('removes zero-width chars and nbsp from web/email pastes', () => {
    expect(titles('\u200B•\u00A0Item\u00A0one\uFEFF\n• Two')).toEqual(['Item one', 'Two']);
  });

  it('drops lines with no letters or digits (dividers)', () => {
    expect(titles('One\n-----\n***\nTwo\n- \n•')).toEqual(['One', 'Two']);
  });

  it('joins wrapped lowercase continuation lines in a marked list', () => {
    expect(titles('- Send the client the revised\n  logo files by Friday\n- Book call')).toEqual([
      'Send the client the revised logo files by Friday',
      'Book call',
    ]);
  });

  it('does not join lines in an unmarked list', () => {
    expect(titles('buy milk\nbuy eggs')).toEqual(['buy milk', 'buy eggs']);
  });

  it('derives depth from indentation, relative to the least-indented line', () => {
    const { items } = parseChecklist('  - Parent\n    - Child\n      - Grandchild\n  - Sibling');
    expect(items.map((i) => i.depth)).toEqual([0, 1, 2, 0]);
  });

  it('treats tabs as one level', () => {
    const { items } = parseChecklist('- Parent\n\t- Child');
    expect(items.map((i) => i.depth)).toEqual([0, 1]);
  });

  it('never jumps more than one level deeper', () => {
    const { items } = parseChecklist('- Parent\n        - Deep');
    expect(items.map((i) => i.depth)).toEqual([0, 1]);
  });

  it('caps items and reports truncation', () => {
    const input = Array.from({ length: 250 }, (_, i) => `Item ${i + 1}`).join('\n');
    const result = parseChecklist(input);
    expect(result.items).toHaveLength(200);
    expect(result.truncated).toBe(true);
    expect(parseChecklist(input, { maxItems: 10 }).items).toHaveLength(10);
  });

  it('caps very long titles at 500 chars', () => {
    const long = 'x'.repeat(800);
    expect(parseChecklist(`${long}\nshort`).items[0]?.title).toHaveLength(500);
  });

  it('handles a 20-item to-do dump (the competitor complaint)', () => {
    const dump = Array.from({ length: 20 }, (_, i) => `${i + 1}. Task number ${i + 1}`).join('\n');
    const { items, truncated } = parseChecklist(dump);
    expect(items).toHaveLength(20);
    expect(truncated).toBe(false);
    expect(items[19]?.title).toBe('Task number 20');
  });

  it('handles Notion-style copied checklists', () => {
    expect(titles('- [ ] Draft proposal\n- [ ] Review with Acme\n- [x] Kickoff call')).toEqual([
      'Draft proposal',
      'Review with Acme',
      'Kickoff call',
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(parseChecklist('')).toEqual({ items: [], truncated: false });
  });
});

describe('checklistOfferCount', () => {
  it('offers for two or more short lines', () => {
    expect(checklistOfferCount('milk\neggs\nbread')).toBe(3);
  });

  it('offers for bulleted lists even with long items', () => {
    const item = 'A fairly long description of a thing that needs doing for this client soon.';
    expect(checklistOfferCount(`- ${item}\n- ${item}`)).toBe(2);
  });

  it('does not offer for a single line', () => {
    expect(checklistOfferCount('just one thing')).toBe(0);
    expect(checklistOfferCount('- just one thing\n\n')).toBe(0);
  });

  it('does not offer for prose paragraphs', () => {
    const prose =
      'Hi Sam, thanks for sending over the brief yesterday. I had a look through it this morning.\n' +
      'Overall it looks great and I think we can hit the deadline if we start early next week.\n' +
      'Let me know when you are free for a quick call to go over the remaining questions.';
    expect(checklistOfferCount(prose)).toBe(0);
  });

  it('does not offer for a single very long line plus a short one', () => {
    expect(checklistOfferCount(`${'word '.repeat(60)}\nok`)).toBe(0);
  });

  it('does not offer for empty input', () => {
    expect(checklistOfferCount('')).toBe(0);
  });
});
