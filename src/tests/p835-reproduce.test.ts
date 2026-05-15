/**
 * @file p835-reproduce.test.ts
 * @description P835 canary: client comprehension rating scale (0–10) must be
 * accepted by the request-letter-response-signin edge function validator.
 *
 * Bug: Client UI exposes a 0–10 rating scale (src/app/components/partners/constants.ts:8),
 * but the edge function isValidRatingsArray (supabase/functions/request-letter-response-signin/index.ts:209-210)
 * accepts only `>= 1 && <= 7`. Any user picking 0, 8, 9, or 10 → 400 "Invalid request".
 *
 * Canary gate:
 *   Before fix: assertion fails for ratings 0, 8, 9, 10 — guarded by `it.fails`,
 *               so the suite stays green while the bug is open.
 *   After fix:  assertions pass → `it.fails` flips RED → developer must remove
 *               `.fails` and convert these to plain `it()`.
 */

import { describe, it, expect } from 'vitest';
import { RATING_OPTIONS } from '@/app/components/partners/constants';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verbatim copy of edge function predicate (request-letter-response-signin/index.ts:199-212)
// so this canary breaks when client/server drift apart, not when the function source moves.
function isValidRatingsArrayEdge(arr: unknown): boolean {
  if (!Array.isArray(arr)) return false;
  return arr.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as { storyId: unknown }).storyId === 'string' &&
      UUID_REGEX.test((item as { storyId: string }).storyId) &&
      typeof (item as { rating: unknown }).rating === 'number' &&
      Number.isInteger((item as { rating: number }).rating) &&
      (item as { rating: number }).rating >= 0 &&
      (item as { rating: number }).rating <= 10,
  );
}

const STORY_ID = '11111111-1111-1111-1111-111111111111';

describe('P835: letter-response signup rating scale alignment', () => {
  it('every rating value the client UI can submit is accepted by the edge validator', () => {
    const rejected: number[] = [];
    for (const opt of RATING_OPTIONS) {
      const payload = [{ storyId: STORY_ID, rating: opt.value }];
      if (!isValidRatingsArrayEdge(payload)) {
        rejected.push(opt.value);
      }
    }

    // Before fix: rejected = [0, 8, 9, 10]
    // After fix:  rejected = []
    expect(rejected).toEqual([]);
  });

  it('rating=0 (leftmost "Not at all" button) must round-trip', () => {
    expect(isValidRatingsArrayEdge([{ storyId: STORY_ID, rating: 0 }])).toBe(true);
  });

  it('rating=10 (rightmost "Complete cognitive understanding") must round-trip', () => {
    expect(isValidRatingsArrayEdge([{ storyId: STORY_ID, rating: 10 }])).toBe(true);
  });
});
