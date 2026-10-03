/**
 * Fractional positions: inserting or moving an item only rewrites that one row.
 * Gaps halve on each insert between neighbours; `needsRebalance` flags when a list
 * should be renumbered (after ~50 inserts at the same spot).
 */

export const POSITION_STEP = 1024;
const MIN_GAP = 1e-9;

export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return POSITION_STEP;
  if (before == null && after != null) return after - POSITION_STEP;
  if (before != null && after == null) return before + POSITION_STEP;
  return ((before as number) + (after as number)) / 2;
}

/** Positions for `count` new items appended after `last` (bulk checklist creation). */
export function positionsAfter(last: number | null, count: number): number[] {
  const start = last ?? 0;
  return Array.from({ length: count }, (_, i) => start + (i + 1) * POSITION_STEP);
}

export function needsRebalance(sortedPositions: readonly number[]): boolean {
  for (let i = 1; i < sortedPositions.length; i++) {
    const prev = sortedPositions[i - 1] as number;
    const cur = sortedPositions[i] as number;
    if (cur - prev < MIN_GAP) return true;
  }
  return false;
}

/** Evenly spaced positions for a list of the given length. */
export function rebalance(count: number): number[] {
  return positionsAfter(null, count);
}

/**
 * New position for an item moved from index `from` to index `to` within a list
 * sorted by position.
 */
export function positionForMove(
  sortedPositions: readonly number[],
  from: number,
  to: number,
): number {
  const without = sortedPositions.filter((_, i) => i !== from);
  const before = to > 0 ? (without[to - 1] ?? null) : null;
  const after = without[to] ?? null;
  return positionBetween(before, after);
}
