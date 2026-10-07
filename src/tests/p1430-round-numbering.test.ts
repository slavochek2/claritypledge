/**
 * P1430 — the host-picked round is the Demo and is not counted: the round after it reads Round 1.
 * `round_no` stays storage order; every surface names rounds through these helpers.
 */
import { describe, it, expect } from 'vitest';
import { countedRounds, displayRoundNo, nextDisplayNo, nextRoundLabel, roundLabel } from '@/lib/round-numbering';

const r = (roundNo: number, showcase = false) => ({ roundNo, showcase });

describe('round numbering', () => {
  it('with no Demo, the name is the storage number', () => {
    const rounds = [r(1), r(2), r(3)];
    expect(rounds.map(x => roundLabel(rounds, x))).toEqual(['Round 1', 'Round 2', 'Round 3']);
  });

  it('a Demo first reads "Demo", and the round after it reads Round 1', () => {
    const rounds = [r(1, true), r(2), r(3)];
    expect(rounds.map(x => roundLabel(rounds, x))).toEqual(['Demo', 'Round 1', 'Round 2']);
    expect(displayRoundNo(rounds, rounds[0])).toBeNull();
  });

  it('a Demo between rounds does not shift the rounds before it', () => {
    const rounds = [r(1), r(2, true), r(3)];
    expect(rounds.map(x => roundLabel(rounds, x))).toEqual(['Round 1', 'Demo', 'Round 2']);
  });

  it('the next round is named from the counted rounds, or "Demo"', () => {
    expect(nextRoundLabel([], false)).toBe('Round 1');
    expect(nextRoundLabel([], true)).toBe('Demo');
    const rounds = [r(1, true), r(2)];
    expect(countedRounds(rounds)).toBe(1);
    expect(nextDisplayNo(rounds, false)).toBe(2);
    expect(nextRoundLabel(rounds, false)).toBe('Round 2');
    expect(nextDisplayNo(rounds, true)).toBeNull();
  });
});
