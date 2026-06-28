/**
 * P967: Calibration Breakdown — Faithfulness Unit Tests
 *
 * Guards three critical mathematical invariants for the breakdown page:
 *
 * 1. SIGN — col3 = speaker_rating − listener_rating (actual − self),
 *    which matches the displayed bar sign. The raw service calibrationGap
 *    is self − actual (opposite sign); the breakdown MUST NOT use it.
 *
 * 2. DENOMINATOR — the footer average divides by row count (verification
 *    records), NOT distinct sessions. One /live session produces N rows.
 *
 * 3. ELIGIBILITY — rows with null speaker_rating OR null listener_rating
 *    are excluded from both count and average. No NaN must emerge.
 *
 * These tests import pure helper functions from the hook/page — they do
 * NOT call the RPC (that's the integration test's job).
 */

import { describe, it, expect } from 'vitest';

// ─── Types mirroring the RPC return shape ────────────────────────────────────
// These match what get_my_listener_calibration_diffs() returns.
// If the hook renames or restructures, update both here and the hook.
interface CalibrationDiffRow {
  listener_rating: number | null;
  speaker_rating: number | null;
  speaker_name: string;
  speaker_slug: string;
  story_title: string;
  created_at: string;
}

// ─── The functions under test ─────────────────────────────────────────────────
// These must be exported from the hook or a co-located util.
// If not yet exported, /dev must add named exports — tests must not be changed.
//
// computeDiff(row): number | null — returns speaker_rating − listener_rating, or null if ineligible
// computeFooter(rows): { sum: number; count: number; avg: number } | null
// isEligible(row): boolean — both ratings non-null
//
// Import path: update once /dev creates the hook.
import {
  computeDiff,
  computeFooter,
  isEligible,
} from '@/app/data/use-listener-calibration-diffs';

// ─────────────────────────────────────────────────────────────────────────────

describe('P967 — Faithfulness invariants', () => {

  // ── SIGN INVARIANT ──────────────────────────────────────────────────────────

  describe('computeDiff — sign: col3 = speaker_rating − listener_rating', () => {
    it('returns positive when speaker rates higher than listener (actual > self)', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: 8,
        listener_rating: 6,
        speaker_name: 'Partner A',
        speaker_slug: 'partner-a',
        story_title: 'Story 1',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(computeDiff(row)).toBe(2); // 8 − 6 = +2
    });

    it('returns negative when speaker rates lower than listener (actual < self = overconfident)', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: 5,
        listener_rating: 8,
        speaker_name: 'Partner A',
        speaker_slug: 'partner-a',
        story_title: 'Story 2',
        created_at: '2026-01-02T00:00:00Z',
      };
      expect(computeDiff(row)).toBe(-3); // 5 − 8 = −3
    });

    it('does NOT negate: raw service calibrationGap is self−actual, computeDiff must be actual−self', () => {
      // Trap: calibration-service-real.ts:174 stores calibrationGap = self − actual.
      // profile-page-v2.tsx:143 negates it to get the displayed bar value.
      // computeDiff must produce the SAME sign as the displayed bar, i.e. actual − self.
      const row: CalibrationDiffRow = {
        speaker_rating: 3, // actual
        listener_rating: 7, // self
        speaker_name: 'Partner B',
        speaker_slug: 'partner-b',
        story_title: 'Trap story',
        created_at: '2026-01-03T00:00:00Z',
      };
      const diff = computeDiff(row);
      expect(diff).toBe(-4); // 3 − 7 = −4 (correct)
      expect(diff).not.toBe(4); // +4 would be the wrong (raw service) sign
    });

    it('returns null for ineligible row (null speaker_rating)', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: null,
        listener_rating: 7,
        speaker_name: 'Partner C',
        speaker_slug: 'partner-c',
        story_title: 'Letter story',
        created_at: '2026-01-04T00:00:00Z',
      };
      expect(computeDiff(row)).toBeNull();
    });

    it('returns null for ineligible row (null listener_rating)', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: 7,
        listener_rating: null,
        speaker_name: 'Partner C',
        speaker_slug: 'partner-c',
        story_title: 'Pending story',
        created_at: '2026-01-04T00:00:00Z',
      };
      expect(computeDiff(row)).toBeNull();
    });
  });

  // ── DENOMINATOR INVARIANT ───────────────────────────────────────────────────

  describe('computeFooter — denominator: divides by ROW count, not session count', () => {
    it('known fixture: 7 rows across 3 sessions producing sum −10, avg −1.4285…', () => {
      // The spec example: sum −10 ÷ 7 diffs = −1.4285…
      // All rows are eligible (both ratings non-null).
      const rows: CalibrationDiffRow[] = [
        // Session A (2 rows)
        { speaker_rating: 5, listener_rating: 7, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S1', created_at: '2026-01-01T00:00:00Z' }, // diff = −2
        { speaker_rating: 6, listener_rating: 8, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S2', created_at: '2026-01-01T00:00:00Z' }, // diff = −2
        // Session B (3 rows)
        { speaker_rating: 4, listener_rating: 6, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'S3', created_at: '2026-01-02T00:00:00Z' }, // diff = −2
        { speaker_rating: 5, listener_rating: 6, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'S4', created_at: '2026-01-02T00:00:00Z' }, // diff = −1
        { speaker_rating: 6, listener_rating: 7, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'S5', created_at: '2026-01-02T00:00:00Z' }, // diff = −1
        // Session C (2 rows)
        { speaker_rating: 5, listener_rating: 6, speaker_name: 'P3', speaker_slug: 'p3', story_title: 'S6', created_at: '2026-01-03T00:00:00Z' }, // diff = −1
        { speaker_rating: 4, listener_rating: 5, speaker_name: 'P3', speaker_slug: 'p3', story_title: 'S7', created_at: '2026-01-03T00:00:00Z' }, // diff = −1
        // Sum: −2−2−2−1−1−1−1 = −10; count = 7; avg = −10/7 ≈ −1.4285...
      ];

      const footer = computeFooter(rows);
      expect(footer).not.toBeNull();
      expect(footer!.count).toBe(7); // row count, not session count (3)
      expect(footer!.sum).toBe(-10);
      expect(footer!.avg).toBeCloseTo(-10 / 7, 5);
    });

    it('the spec canonical fixture: bar = −1.4 comes from row avg not session avg', () => {
      // A concrete fixture where session-average ≠ row-average, proving denominator matters.
      // Session A: 2 rows with diffs −2, −2 → session avg = −2.0
      // Session B: 1 row with diff 0 → session avg = 0.0
      // Wrong (session avg of session avgs): (−2 + 0) / 2 = −1.0
      // Correct (row avg): (−2 −2 + 0) / 3 = −1.333…
      const rows: CalibrationDiffRow[] = [
        { speaker_rating: 5, listener_rating: 7, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S1', created_at: '2026-01-01T00:00:00Z' },
        { speaker_rating: 5, listener_rating: 7, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S2', created_at: '2026-01-01T00:00:00Z' },
        { speaker_rating: 7, listener_rating: 7, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'S3', created_at: '2026-01-02T00:00:00Z' },
      ];

      const footer = computeFooter(rows);
      expect(footer!.count).toBe(3);
      expect(footer!.sum).toBe(-4);
      expect(footer!.avg).toBeCloseTo(-4 / 3, 5);
      expect(footer!.avg).not.toBeCloseTo(-1.0, 1); // would be session-avg-of-avgs (wrong)
    });
  });

  // ── ELIGIBILITY / NaN GUARD ─────────────────────────────────────────────────

  describe('isEligible — both ratings must be non-null', () => {
    it('eligible when both ratings are numbers', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: 7,
        listener_rating: 8,
        speaker_name: 'P1',
        speaker_slug: 'p1',
        story_title: 'S1',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(isEligible(row)).toBe(true);
    });

    it('ineligible when speaker_rating is null (today letter rows)', () => {
      // Letter rows: P581 RPC inserts only listener_rating; speaker_rating = NULL.
      const row: CalibrationDiffRow = {
        speaker_rating: null,
        listener_rating: 8,
        speaker_name: 'P1',
        speaker_slug: 'p1',
        story_title: 'Letter',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(isEligible(row)).toBe(false);
    });

    it('ineligible when listener_rating is null', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: 7,
        listener_rating: null,
        speaker_name: 'P1',
        speaker_slug: 'p1',
        story_title: 'Pending',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(isEligible(row)).toBe(false);
    });

    it('ineligible when both ratings are null', () => {
      const row: CalibrationDiffRow = {
        speaker_rating: null,
        listener_rating: null,
        speaker_name: 'P1',
        speaker_slug: 'p1',
        story_title: 'Empty',
        created_at: '2026-01-01T00:00:00Z',
      };
      expect(isEligible(row)).toBe(false);
    });
  });

  describe('computeFooter — NaN guard: ineligible rows excluded from count AND average', () => {
    it('does not NaN when some rows have null speaker_rating', () => {
      const rows: CalibrationDiffRow[] = [
        { speaker_rating: 8, listener_rating: 6, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S1', created_at: '2026-01-01T00:00:00Z' }, // eligible, diff = +2
        { speaker_rating: null, listener_rating: 7, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'Letter', created_at: '2026-01-02T00:00:00Z' }, // ineligible
      ];

      const footer = computeFooter(rows);
      expect(footer).not.toBeNull();
      expect(footer!.count).toBe(1); // only 1 eligible row
      expect(footer!.sum).toBe(2);
      expect(footer!.avg).toBe(2);
      expect(Number.isNaN(footer!.avg)).toBe(false);
    });

    it('returns null when ALL rows are ineligible (no eligible rows)', () => {
      const rows: CalibrationDiffRow[] = [
        { speaker_rating: null, listener_rating: 7, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'L1', created_at: '2026-01-01T00:00:00Z' },
        { speaker_rating: null, listener_rating: 8, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'L2', created_at: '2026-01-02T00:00:00Z' },
      ];

      const footer = computeFooter(rows);
      expect(footer).toBeNull(); // no eligible rows → no footer to show
    });

    it('returns null for empty row array', () => {
      expect(computeFooter([])).toBeNull();
    });

    it('footer count excludes ineligible rows; sum and avg computed over eligible only', () => {
      const rows: CalibrationDiffRow[] = [
        { speaker_rating: 4, listener_rating: 8, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S1', created_at: '2026-01-01T00:00:00Z' }, // diff = −4
        { speaker_rating: 6, listener_rating: 8, speaker_name: 'P1', speaker_slug: 'p1', story_title: 'S2', created_at: '2026-01-01T00:00:00Z' }, // diff = −2
        { speaker_rating: null, listener_rating: 5, speaker_name: 'P2', speaker_slug: 'p2', story_title: 'Letter', created_at: '2026-01-02T00:00:00Z' }, // EXCLUDED
        { speaker_rating: 5, listener_rating: 7, speaker_name: 'P3', speaker_slug: 'p3', story_title: 'S3', created_at: '2026-01-03T00:00:00Z' }, // diff = −2
        { speaker_rating: 8, listener_rating: 6, speaker_name: 'P3', speaker_slug: 'p3', story_title: 'S4', created_at: '2026-01-03T00:00:00Z' }, // diff = +2
      ];

      const footer = computeFooter(rows);
      // 4 eligible rows, letter row excluded
      // sum = −4 + −2 + −2 + 2 = −6; count = 4; avg = −6/4 = −1.5
      expect(footer!.count).toBe(4);
      expect(footer!.sum).toBe(-6);
      expect(footer!.avg).toBeCloseTo(-1.5, 5);
    });
  });
});
