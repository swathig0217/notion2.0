import { describe, expect, it } from 'vitest';
import {
  POSITION_STEP,
  needsRebalance,
  positionBetween,
  positionForMove,
  positionsAfter,
  rebalance,
} from './position.ts';

describe('positionBetween', () => {
  it('starts an empty list at one step', () => {
    expect(positionBetween(null, null)).toBe(POSITION_STEP);
  });
  it('appends and prepends by one step', () => {
    expect(positionBetween(2048, null)).toBe(2048 + POSITION_STEP);
    expect(positionBetween(null, 1024)).toBe(0);
  });
  it('splits the gap between neighbours', () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
  });
});

describe('positionsAfter', () => {
  it('creates evenly spaced, increasing positions for bulk inserts', () => {
    expect(positionsAfter(null, 3)).toEqual([1024, 2048, 3072]);
    expect(positionsAfter(5000, 2)).toEqual([6024, 7048]);
  });
});

describe('positionForMove', () => {
  const list = [1024, 2048, 3072, 4096];
  it('moves an item down', () => {
    const p = positionForMove(list, 0, 2); // after 3072, before 4096
    expect(p).toBe(3584);
  });
  it('moves an item to the top', () => {
    expect(positionForMove(list, 3, 0)).toBe(0);
  });
  it('moves an item to the bottom', () => {
    expect(positionForMove(list, 0, 3)).toBe(4096 + POSITION_STEP);
  });
  it('produces a sortable order after the move', () => {
    const moved = positionForMove(list, 1, 3);
    const order = [
      ['a', 1024],
      ['b', moved],
      ['c', 3072],
      ['d', 4096],
    ] as const;
    const sorted = [...order].sort((x, y) => x[1] - y[1]).map((x) => x[0]);
    expect(sorted).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('rebalance', () => {
  it('detects collapsed gaps after many inserts at the same spot', () => {
    let lo = 1024;
    const hi = 2048;
    for (let i = 0; i < 60; i++) lo = positionBetween(lo, hi);
    expect(needsRebalance([lo, hi])).toBe(true);
    expect(needsRebalance(rebalance(5))).toBe(false);
  });
});
