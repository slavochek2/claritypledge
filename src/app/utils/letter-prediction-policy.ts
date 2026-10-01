/**
 * @file letter-prediction-policy.ts
 * @description P1379: whether a letter carries the author's per-story prediction.
 *
 * One rule, keyed on the letter's MODE (never on doc visibility, never on whether a
 * prediction value happens to be null):
 *   - one-to-one: the author predicts every story; the reader sees the calibration
 *     verdict, the two-marker scale and the gap. Unchanged by P1379.
 *   - one-to-many (public): no prediction step in compose, and no author number,
 *     gap or "{Author} thinks…" line anywhere a reader or the author looks.
 *
 * Keying on mode rather than `prediction === null` matters: a one-to-one letter
 * with a genuinely missing prediction must keep showing "Calibration data
 * unavailable." (a visible bug signal), not silently turn into the public reveal.
 *
 * The server enforces the same rule (migration 20260930120000_p1379_…); this module
 * is the client's defence in depth, so an old public letter that still stores
 * predictions never renders one even if a stale response carried it.
 */

import type { LetterMode } from '@/app/types';

/**
 * True when a letter of this mode shows/collects the author's per-story prediction.
 * FAILS CLOSED: only an explicit 'one-to-one' shows one. An unknown mode (a failed
 * metadata read, a missing field) shows no prediction — a hidden one-to-one number
 * is a cosmetic loss; a leaked public one breaks the sealed-bid guarantee.
 */
export function letterUsesPredictions(mode: LetterMode | null | undefined): boolean {
  return mode === 'one-to-one';
}

/** Compose phase right after the mode/recipients are known. */
export function composePhaseAfterSetup(mode: LetterMode): 'predict' | 'seal-confirm' {
  return letterUsesPredictions(mode) ? 'predict' : 'seal-confirm';
}

/**
 * The client seal guard. Returns an error message when sealing must be blocked,
 * or null when it may proceed. One-to-many letters seal with no predictions.
 */
export function sealGuardError(
  mode: LetterMode,
  predictionCount: number,
  storyCount: number,
): string | null {
  if (!letterUsesPredictions(mode)) return null;
  if (predictionCount < storyCount) {
    return `Please predict all ${storyCount} stories before sealing`;
  }
  return null;
}

/** localStorage key holding the author's compose-time predictions for the preview page. */
export function previewPredictionsKey(docId: string): string {
  return `clarity-preview-predictions-${docId}`;
}

/**
 * Drops any prediction for a one-to-many letter. Used on every read path that
 * receives predictions from the server or storage.
 */
export function predictionsForMode<T>(mode: LetterMode | null | undefined, predictions: T[]): T[] {
  return letterUsesPredictions(mode) ? predictions : [];
}

export interface RatingSummary {
  count: number;
  median: number | null;
  min: number | null;
  max: number | null;
}

/** Per-story aggregate for the author's overview of a one-to-many letter (A4). */
export function summarizeRatings(ratings: Array<number | null | undefined>): RatingSummary {
  const values = ratings
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r))
    .sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  if (min === undefined || max === undefined) return { count: 0, median: null, min: null, max: null };
  const mid = Math.floor(values.length / 2);
  const upper = values[mid] ?? max;
  const lower = values[mid - 1] ?? upper;
  const median = values.length % 2 === 1 ? upper : (lower + upper) / 2;
  return { count: values.length, median, min, max };
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** UI Contract: "{count} readers · median {m} · range {min}–{max}" / "1 reader · {n}" / "No ratings yet". */
export function formatRatingSummary(summary: RatingSummary): string {
  if (summary.count === 0 || summary.median === null || summary.min === null || summary.max === null) {
    return 'No ratings yet';
  }
  if (summary.count === 1) return `1 reader · ${formatNumber(summary.median)}`;
  if (summary.min === summary.max) return `${summary.count} readers · all rated ${summary.min}`;
  return `${summary.count} readers · median ${formatNumber(summary.median)} · range ${summary.min}–${summary.max}`;
}

/** UI Contract: reader reveal / results line for a one-to-many letter. */
export function publicRatingLine(rating: number): string {
  return `You said ${rating} out of 10.`;
}

/**
 * P1379 (review B): the reading page's responses_mode. Every reading RPC now returns it;
 * if one ever does not, fall back BY MODE: a public letter fails closed ('off', the
 * "Just read" default), a one-to-one letter keeps its historical 'invite' so a claimed
 * receiver never silently loses explain-back.
 */
export function resolveResponsesMode(letter: {
  responses_mode?: 'off' | 'invite' | 'push' | null;
  mode?: LetterMode | null;
}): 'off' | 'invite' | 'push' {
  return letter.responses_mode ?? (letter.mode === 'one-to-many' ? 'off' : 'invite');
}
