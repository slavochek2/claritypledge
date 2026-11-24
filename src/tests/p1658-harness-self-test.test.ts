import { describe, expect, it } from 'vitest';
import { selfTest } from '../../scripts/p1658-rules-ab-eval.ts';

/**
 * P1658 round-3 review: the revision-4 measure (words per point, chained, solution-kind, solution-offer, falsified-change) produced the
 * A/B numbers in the spec, and its own positive and negative controls lived only behind `--self-test`, run by hand. This runs them in the
 * suite. selfTest makes no model call; it builds a temporary directory for the --check-md and --out controls and removes it.
 */
describe('P1658 A/B harness self-test', () => {
  it('every control of the revision-4 and v9 measures holds', () => {
    expect(selfTest()).toEqual([]);
  }, 60_000);
});
