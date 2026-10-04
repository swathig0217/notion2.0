import { describe, expect, it } from 'vitest';
import { diffInsertion, isMultilinePaste } from './insertion.ts';

describe('diffInsertion', () => {
  it('detects a paste into an empty field', () => {
    expect(diffInsertion('', 'a\nb')).toEqual({ inserted: 'a\nb', without: '' });
  });

  it('detects a paste in the middle of existing text', () => {
    expect(diffInsertion('Hello world', 'Hello a\nb world')).toEqual({
      inserted: 'a\nb ',
      without: 'Hello world',
    });
  });

  it('detects a paste at the end', () => {
    expect(diffInsertion('Notes:', 'Notes:\n- x\n- y')).toEqual({
      inserted: '\n- x\n- y',
      without: 'Notes:',
    });
  });

  it('handles a paste that replaces a selection', () => {
    const d = diffInsertion('keep REPLACE keep', 'keep one\ntwo keep');
    expect(d.inserted).toBe('one\ntwo');
    expect(d.without).toBe('keep  keep');
  });

  it('typing Enter is not a paste', () => {
    expect(isMultilinePaste(diffInsertion('line', 'line\n'))).toBe(false);
  });

  it('typing a character is not a paste', () => {
    expect(isMultilinePaste(diffInsertion('ab', 'abc'))).toBe(false);
  });

  it('a multi-line paste is a paste', () => {
    expect(isMultilinePaste(diffInsertion('', 'milk\neggs'))).toBe(true);
  });
});
