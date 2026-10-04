export interface Insertion {
  /** The text that was inserted (e.g. pasted) between `prev` and `next`. */
  inserted: string;
  /** `next` with the insertion removed, i.e. what to restore if the paste is converted. */
  without: string;
}

/**
 * Finds what a single edit inserted into a text field, by trimming the common prefix
 * and suffix. Used to detect a paste inside a TextInput, which has no paste event.
 */
export function diffInsertion(prev: string, next: string): Insertion {
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let end = 0;
  while (
    end < prev.length - start &&
    end < next.length - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }
  return {
    inserted: next.slice(start, next.length - end),
    without: next.slice(0, start) + next.slice(next.length - end),
  };
}

/** True when an edit looks like a multi-line paste rather than typing (incl. Enter). */
export function isMultilinePaste(insertion: Insertion): boolean {
  return insertion.inserted.length > 1 && insertion.inserted.includes('\n');
}
