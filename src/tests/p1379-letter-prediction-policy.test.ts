/**
 * @file p1379-letter-prediction-policy.test.ts
 * @description P1379: the one rule — predictions exist only for one-to-one letters —
 * and the compose/seal/summary helpers built on it.
 */

import { describe, it, expect } from 'vitest';
import {
  composePhaseAfterSetup,
  formatRatingSummary,
  letterUsesPredictions,
  predictionsForMode,
  previewPredictionsKey,
  publicRatingLine,
  resolveResponsesMode,
  sealGuardError,
  summarizeRatings,
} from '@/app/utils/letter-prediction-policy';

describe('letterUsesPredictions', () => {
  it('one-to-one uses predictions; one-to-many does not', () => {
    expect(letterUsesPredictions('one-to-one')).toBe(true);
    expect(letterUsesPredictions('one-to-many')).toBe(false);
  });
  it('unknown mode FAILS CLOSED — no prediction shown', () => {
    expect(letterUsesPredictions(null)).toBe(false);
    expect(letterUsesPredictions(undefined)).toBe(false);
  });
});

describe('compose flow (A1)', () => {
  it('one-to-many skips the prediction walk and goes to seal-confirm', () => {
    expect(composePhaseAfterSetup('one-to-many')).toBe('seal-confirm');
  });
  it('one-to-one still starts the prediction walk', () => {
    expect(composePhaseAfterSetup('one-to-one')).toBe('predict');
  });
});

describe('seal guard (A1)', () => {
  it('one-to-many seals with zero predictions', () => {
    expect(sealGuardError('one-to-many', 0, 3)).toBeNull();
  });
  it('one-to-one with a missing prediction is still blocked, same message as before', () => {
    expect(sealGuardError('one-to-one', 2, 3)).toBe('Please predict all 3 stories before sealing');
  });
  it('one-to-one with every prediction may seal', () => {
    expect(sealGuardError('one-to-one', 3, 3)).toBeNull();
  });
});

describe('predictionsForMode (defence in depth)', () => {
  const rows = [{ story_id: 's1', prediction: 7 }];
  it('drops stored predictions for one-to-many (old public letter)', () => {
    expect(predictionsForMode('one-to-many', rows)).toEqual([]);
  });
  it('keeps them for one-to-one only; unknown mode drops them (fail closed)', () => {
    expect(predictionsForMode('one-to-one', rows)).toEqual(rows);
    expect(predictionsForMode(null, rows)).toEqual([]);
    expect(predictionsForMode(undefined, rows)).toEqual([]);
  });
});

describe('author aggregate (A4) — UI Contract strings', () => {
  it('count = 0 → "No ratings yet"', () => {
    expect(formatRatingSummary(summarizeRatings([]))).toBe('No ratings yet');
    expect(formatRatingSummary(summarizeRatings([undefined, null]))).toBe('No ratings yet');
  });
  it('count = 1 → "1 reader · {n}"', () => {
    expect(formatRatingSummary(summarizeRatings([6]))).toBe('1 reader · 6');
  });
  it('odd count → middle value as median, range min–max', () => {
    expect(formatRatingSummary(summarizeRatings([9, 2, 5]))).toBe('3 readers · median 5 · range 2–9');
  });
  it('even count → mean of the two middle values', () => {
    expect(summarizeRatings([2, 4, 6, 9]).median).toBe(5);
    expect(formatRatingSummary(summarizeRatings([3, 4]))).toBe('2 readers · median 3.5 · range 3–4');
  });
  it('count > 1 with identical ratings → "{count} readers · all rated {n}" (no "range 7–7")', () => {
    expect(formatRatingSummary(summarizeRatings([7, 7, 7]))).toBe('3 readers · all rated 7');
  });
  it('ignores readers who have not rated', () => {
    expect(summarizeRatings([undefined, 4, null, 8]).count).toBe(2);
  });
});

describe('reader line', () => {
  it('"You said {n} out of 10."', () => {
    expect(publicRatingLine(7)).toBe('You said 7 out of 10.');
  });
});

describe('preview key', () => {
  it('matches the key the compose page has always written', () => {
    expect(previewPredictionsKey('doc-1')).toBe('clarity-preview-predictions-doc-1');
  });
});

describe('resolveResponsesMode (reading page)', () => {
  it('uses the stored value whenever the RPC returns it', () => {
    expect(resolveResponsesMode({ mode: 'one-to-one', responses_mode: 'off' })).toBe('off');
    expect(resolveResponsesMode({ mode: 'one-to-many', responses_mode: 'invite' })).toBe('invite');
  });
  it('missing on a one-to-one letter (token path before P1379): keeps explain-back (invite)', () => {
    expect(resolveResponsesMode({ mode: 'one-to-one' })).toBe('invite');
  });
  it('missing on a public letter: fails closed (off)', () => {
    expect(resolveResponsesMode({ mode: 'one-to-many' })).toBe('off');
  });
});

describe('single-reader summary', () => {
  it('"1 reader · {n}"', () => {
    expect(formatRatingSummary(summarizeRatings([undefined, 8, null]))).toBe('1 reader · 8');
  });
});
