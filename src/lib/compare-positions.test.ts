/**
 * @file compare-positions.test.ts
 * @description P1337: ordering, intersection and tie rules of the compare view helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  POSITION_ORDER,
  buildCompareRows,
  furthestApart,
  positionGap,
  type PositionKey,
} from './compare-positions';

const stmts = (...ids: string[]) => ids.map(id => ({ id, statement: `statement ${id}` }));
const pos = (entries: [string, PositionKey][]) => new Map(entries);

describe('positionGap', () => {
  it('is 0 for equal positions and symmetric', () => {
    expect(positionGap('agree', 'agree')).toBe(0);
    expect(positionGap('agree', 'disagree')).toBe(positionGap('disagree', 'agree'));
  });

  it('spans 6 between the two extremes and covers every enum value', () => {
    expect(positionGap('strongly_disagree', 'strongly_agree')).toBe(6);
    expect(POSITION_ORDER).toHaveLength(7);
    expect(new Set(POSITION_ORDER).size).toBe(7);
  });

  it('counts unsure as the midpoint', () => {
    expect(positionGap('unsure', 'strongly_agree')).toBe(3);
    expect(positionGap('unsure', 'strongly_disagree')).toBe(3);
  });
});

describe('buildCompareRows', () => {
  it('keeps only statements both people hold a position on', () => {
    const rows = buildCompareRows(
      stmts('a', 'b', 'c'),
      pos([['a', 'agree'], ['b', 'agree']]),
      pos([['b', 'disagree'], ['c', 'agree']]),
    );
    expect(rows.map(r => r.pointId)).toEqual(['b']);
  });

  it('sorts by gap descending and keeps agreements last but present', () => {
    const rows = buildCompareRows(
      stmts('same', 'near', 'far'),
      pos([['same', 'agree'], ['near', 'agree'], ['far', 'strongly_agree']]),
      pos([['same', 'agree'], ['near', 'somewhat_agree'], ['far', 'strongly_disagree']]),
    );
    expect(rows.map(r => [r.pointId, r.gap])).toEqual([['far', 6], ['near', 1], ['same', 0]]);
  });

  it('keeps input order on equal gaps', () => {
    const rows = buildCompareRows(
      stmts('x', 'y', 'z'),
      pos([['x', 'agree'], ['y', 'agree'], ['z', 'agree']]),
      pos([['x', 'disagree'], ['y', 'disagree'], ['z', 'disagree']]),
    );
    expect(rows.map(r => r.pointId)).toEqual(['x', 'y', 'z']);
  });

  it('carries the statement text and both positions', () => {
    const [row] = buildCompareRows(stmts('a'), pos([['a', 'agree']]), pos([['a', 'unsure']]));
    expect(row).toEqual({
      pointId: 'a',
      statement: 'statement a',
      mine: 'agree',
      theirs: 'unsure',
      gap: 2,
    });
  });

  it('returns nothing when there is no overlap or no statements', () => {
    expect(buildCompareRows([], pos([]), pos([]))).toEqual([]);
    expect(buildCompareRows(stmts('a'), pos([['a', 'agree']]), pos([]))).toEqual([]);
  });
});

describe('furthestApart', () => {
  it('returns the first row when it has a gap', () => {
    const rows = buildCompareRows(
      stmts('a', 'b'),
      pos([['a', 'agree'], ['b', 'agree']]),
      pos([['a', 'agree'], ['b', 'disagree']]),
    );
    expect(furthestApart(rows)?.pointId).toBe('b');
  });

  it('returns null when everything is agreed on, or there are no rows', () => {
    const rows = buildCompareRows(stmts('a'), pos([['a', 'agree']]), pos([['a', 'agree']]));
    expect(furthestApart(rows)).toBeNull();
    expect(furthestApart([])).toBeNull();
  });
});
