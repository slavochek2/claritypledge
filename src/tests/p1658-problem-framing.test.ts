/** P1658 review: the Problem shape says "the problem is", so "problem" is a framing word and must not by itself refuse a best-guess point. */
import { describe, expect, it } from 'vitest';
import { isPlainGuess } from '../../supabase/functions/_shared/canvas-support';

const OWNER = 'Café owners drown in receipts piling up every month.';
describe('P1658: Problem-shape framing', () => {
  it('keeps a Problem guess whose only added words are the shape\'s own ("For ... the problem is")', () => {
    expect(isPlainGuess('For café owners the problem is receipts piling up.', OWNER, OWNER)).toBe(true);
  });
  it('still refuses a Problem guess that adds a claim of its own', () => {
    expect(isPlainGuess('For café owners the problem is receipts piling up and tax penalties.', OWNER, OWNER)).toBe(false);
  });
});
