/**
 * P1658 review: the Problem shape says "the problem is", but "problem" is NOT a framing word. Exempting it (round 1 fix) let a best guess call
 * something a problem that the owner called easy (round 2, Opus N1). These pin both halves: the reversal is refused, and a guess still needs the
 * owner's own word for the claim.
 */
import { describe, expect, it } from 'vitest';
import { isPlainGuess } from '../../supabase/functions/_shared/canvas-support';

describe('P1658: "problem" is the claim, not framing', () => {
  it('refuses a Problem guess that reverses the owner (they called receipts easy)', () => {
    const owner = 'Receipts are easy to handle each month. I work for cafés.';
    expect(isPlainGuess('For cafés the problem is receipts.', 'Receipts are easy to handle each month', owner)).toBe(false);
  });
  it('keeps a Problem guess when the owner typed the claim word themselves', () => {
    const owner = 'For café owners the problem is receipts piling up every month.';
    expect(isPlainGuess('For café owners the problem is receipts piling up.', owner, owner)).toBe(true);
  });
});
