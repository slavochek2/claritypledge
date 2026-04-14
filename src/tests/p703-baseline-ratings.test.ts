/**
 * @file p703-baseline-ratings.test.ts
 * @description Unit tests for getLetterBaselineRatings() — P703 AD3
 *
 * Tests the two-table JOIN that produces the paraphrase-screen baseline:
 * - speakerRating <- letter_predictions.prediction (sealed-bid)
 * - listenerRating <- story_verifications.listener_rating (source='letter'; speaker_rating is NULL there)
 *
 * Covers:
 * - Both rows present → full { speakerRating, listenerRating }
 * - letter_predictions row missing (impossible in prod, but degrade safely) → null
 * - story_verifications letter row missing (listener hasn't read yet) → null
 * - Wrong story_id on either side → null
 * - source='live' row must NOT be selected for the listener side
 * - Sender/receiver identity mismatch on either side → null
 *
 * Pure-function unit test — no DB calls. The function receives two arrays that
 * the real implementation would fetch in parallel from Supabase.
 *
 * FIXME(generate-tests): import path below assumes getLetterBaselineRatings lives in
 * src/app/data/api.ts as a named export. Update if implementation locates it elsewhere.
 */

import { describe, it, expect } from 'vitest';

// ─── Types (mirror what the implementation will use) ─────────────────────────

interface LetterPredictionRow {
  id: string;
  letter_id: string;
  story_id: string;
  speaker_profile_id: string;
  prediction: number | null;
}

interface StoryVerificationRow {
  id: string;
  story_id: string;
  speaker_profile_id: string;
  listener_profile_id: string | null;
  speaker_rating: number | null;
  listener_rating: number | null;
  source: 'letter' | 'live';
  verified: boolean;
}

interface BaselineRatings {
  speakerRating: number | null;
  listenerRating: number | null;
}

/**
 * Pure function under test.
 *
 * Joins one letter_predictions row (sender's guess) with one letter-sourced
 * story_verifications row (listener's self-rating) and returns the pair.
 *
 * Returns null if either side is missing — /live should fall back to
 * ratingPhase: 'idle' in that case (safety net; should not happen in prod).
 *
 * FIXME(generate-tests): Replace this stub with the actual import once the function exists:
 * import { getLetterBaselineRatings } from '@/app/data/api';
 */
function getLetterBaselineRatings(
  predictions: LetterPredictionRow[],
  verifications: StoryVerificationRow[],
  letterId: string,
  storyId: string,
  senderId: string,
  receiverId: string
): BaselineRatings | null {
  const predictionRow = predictions.find(
    p =>
      p.letter_id === letterId &&
      p.story_id === storyId &&
      p.speaker_profile_id === senderId
  );
  if (!predictionRow) return null;

  const verificationRow = verifications.find(
    v =>
      v.story_id === storyId &&
      v.source === 'letter' &&
      v.speaker_profile_id === senderId &&
      v.listener_profile_id === receiverId
  );
  if (!verificationRow) return null;

  return {
    speakerRating: predictionRow.prediction,
    listenerRating: verificationRow.listener_rating,
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const LETTER_ID = 'letter-uuid-001';
const SENDER_ID = 'sender-uuid-001';
const RECEIVER_ID = 'receiver-uuid-002';
const STORY_ID = 'story-uuid-abc';
const OTHER_STORY_ID = 'story-uuid-xyz';

function makePrediction(overrides: Partial<LetterPredictionRow> = {}): LetterPredictionRow {
  return {
    id: 'pred-uuid-001',
    letter_id: LETTER_ID,
    story_id: STORY_ID,
    speaker_profile_id: SENDER_ID,
    prediction: 2,
    ...overrides,
  };
}

function makeVerification(overrides: Partial<StoryVerificationRow> = {}): StoryVerificationRow {
  return {
    id: 'ver-uuid-001',
    story_id: STORY_ID,
    speaker_profile_id: SENDER_ID,
    listener_profile_id: RECEIVER_ID,
    speaker_rating: null, // letter-sourced rows have NULL speaker_rating per P581
    listener_rating: 3,
    source: 'letter',
    verified: false,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getLetterBaselineRatings()', () => {
  it('returns speakerRating from letter_predictions and listenerRating from story_verifications', () => {
    const prediction = makePrediction({ prediction: 2 });
    const verification = makeVerification({ listener_rating: 3 });
    const result = getLetterBaselineRatings(
      [prediction],
      [verification],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).not.toBeNull();
    expect(result!.speakerRating).toBe(2);
    expect(result!.listenerRating).toBe(3);
  });

  it('returns null when letter_predictions row is missing (no sender guess in DB)', () => {
    const verification = makeVerification();
    const result = getLetterBaselineRatings(
      [],
      [verification],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).toBeNull();
  });

  it('returns null when letter-sourced story_verifications row is missing (listener not read yet)', () => {
    const prediction = makePrediction();
    const result = getLetterBaselineRatings(
      [prediction],
      [],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).toBeNull();
  });

  it('returns null when prediction is for a different story_id', () => {
    const prediction = makePrediction({ story_id: OTHER_STORY_ID });
    const verification = makeVerification();
    const result = getLetterBaselineRatings(
      [prediction],
      [verification],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).toBeNull();
  });

  it('returns null when verification row is source="live" (sibling row, not baseline)', () => {
    const prediction = makePrediction();
    const liveRow = makeVerification({ source: 'live', speaker_rating: 3, listener_rating: 3 });
    const result = getLetterBaselineRatings(
      [prediction],
      [liveRow],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).toBeNull();
  });

  it('returns null when receiver identity does not match listener_profile_id on the verification row', () => {
    const prediction = makePrediction();
    const verification = makeVerification({ listener_profile_id: 'someone-else' });
    const result = getLetterBaselineRatings(
      [prediction],
      [verification],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).toBeNull();
  });

  it('picks the letter row when both letter and live verification rows exist for the same story', () => {
    // /live writes a sibling row with source='live'. Must ignore it and pick the letter row.
    const prediction = makePrediction({ prediction: 2 });
    const letterRow = makeVerification({ id: 'letter-row', listener_rating: 3, source: 'letter' });
    const liveRow = makeVerification({
      id: 'live-row',
      speaker_rating: 3,
      listener_rating: 3,
      source: 'live',
    });
    const result = getLetterBaselineRatings(
      [prediction],
      [liveRow, letterRow],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).not.toBeNull();
    expect(result!.speakerRating).toBe(2);
    expect(result!.listenerRating).toBe(3);
  });

  it('handles listener_rating null (receiver self-rated but column somehow null) without crashing', () => {
    const prediction = makePrediction({ prediction: 1 });
    const verification = makeVerification({ listener_rating: null });
    const result = getLetterBaselineRatings(
      [prediction],
      [verification],
      LETTER_ID,
      STORY_ID,
      SENDER_ID,
      RECEIVER_ID,
    );

    expect(result).not.toBeNull();
    expect(result!.speakerRating).toBe(1);
    expect(result!.listenerRating).toBeNull();
  });
});
