/**
 * @file p800-sealed-letter-regression.test.ts
 * @description P800: Sealed letter regression — snapshotToStoryWithPoints must NOT
 *              reference points.superseded_by from the live DB.
 *
 * Sealed letters are frozen. A letter sealed when v1 was current must continue to
 * render v1 content even after v2 publishes. The letter-snapshot-mapper reads ONLY
 * from snapshot.point_config — never from live points. This test locks in that invariant.
 *
 * Design: letter-snapshot-mapper.ts is explicitly left untouched by P800 (see spec
 * Technical Analysis #8). These tests fail if the mapper ever starts consulting
 * live superseded_by data.
 *
 * Pattern: follows p749-hidden-points-snapshot-mapper.test.ts closely.
 */

import { describe, it, expect } from 'vitest';
import { snapshotToStoryWithPoints } from '@/app/utils/letter-snapshot-mapper';
import { countTotalPoints } from '@/app/utils/letter-reading-utils';
import type { LetterStorySnapshot } from '@/app/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Snapshot sealed when v1 was current. The statement text says "v1 content"
 * which helps us confirm it's not been substituted by a live lookup.
 */
function makeV1SealedSnapshot(): LetterStorySnapshot {
  return {
    letter_id: 'letter-p800-test',
    story_id: 'story-p800-test',
    version_id: 'v1',
    position: 0,
    point_config: {
      storyText: 'The story body at seal time',
      storyTitle: 'Story sealed with v1',
      points: [
        {
          id: 'point-v1',
          text: 'Superseded statement from v1',
          authorPosition: null,
        },
        {
          id: 'point-active',
          text: 'Active point — never superseded',
          authorPosition: null,
        },
      ],
    },
    visibility: 'public',
  };
}

/**
 * Same snapshot but the point data includes a superseded_by field —
 * simulating a future seal shape where the seal RPC might include it.
 * The mapper should ignore unknown fields and still render both points.
 */
function makeSnapshotWithSupersededByField(): LetterStorySnapshot {
  return {
    letter_id: 'letter-p800-test-2',
    story_id: 'story-p800-test-2',
    version_id: 'v1',
    position: 0,
    point_config: {
      storyText: 'Story body',
      storyTitle: 'Story with superseded_by in snapshot',
      points: [
        {
          id: 'point-with-field',
          text: 'Statement in snapshot that has superseded_by field',
          authorPosition: null,
          // Extra field — mapper must ignore, not filter on it
          superseded_by: 'some-other-point-id',
        } as LetterStorySnapshot['point_config']['points'][0] & { superseded_by: string },
        {
          id: 'point-clean',
          text: 'Normal point without extra fields',
          authorPosition: null,
        },
      ],
    },
    visibility: 'public',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('P800 — sealed letter regression: mapper ignores live superseded_by', () => {

  // Case 1: The v1 statement must be preserved verbatim in sealed letters
  it('snapshot with superseded point renders the v1 statement unchanged', () => {
    const result = snapshotToStoryWithPoints(makeV1SealedSnapshot(), 'Alice');

    // Both points must be in the output — sealed letters show all snapshot points
    const pointIds = result.points.map((p) => p.id);
    expect(pointIds).toContain('point-v1');
    expect(pointIds).toContain('point-active');

    // The v1 text must be preserved exactly as sealed
    const v1Point = result.points.find((p) => p.id === 'point-v1');
    expect(v1Point).toBeDefined();
    expect(v1Point?.statement).toBe('Superseded statement from v1');
  });

  // Case 2: A snapshot that happens to include superseded_by in the point data
  // (unknown field) must still return all points without filtering
  it('snapshot with superseded_by field in point data renders all points (unknown field ignored)', () => {
    const result = snapshotToStoryWithPoints(makeSnapshotWithSupersededByField(), 'Alice');

    // Both points must be returned — the mapper must not treat superseded_by as a filter
    expect(result.points).toHaveLength(2);

    const pointIds = result.points.map((p) => p.id);
    expect(pointIds).toContain('point-with-field');
    expect(pointIds).toContain('point-clean');
  });

  // Case 3: countTotalPoints must count all sealed points, including those that
  // would be "superseded" if looked up live
  it('countTotalPoints counts all points in sealed letter (including would-be-superseded)', () => {
    const total = countTotalPoints([makeV1SealedSnapshot()]);

    // The snapshot has 2 points; both must count regardless of live supersede state
    expect(total).toBe(2);
  });

  // Case 4: End-to-end preservation — a snapshot sealed with v1 content returns v1 text
  // even when the snapshot includes both a "superseded" and "active" point.
  // This catches any accidental introduction of a live-join in the mapper.
  it('sealed letter with two points returns both points in order (no live DB consultation)', () => {
    const result = snapshotToStoryWithPoints(makeV1SealedSnapshot(), 'Alice');

    // Order is preserved as in point_config.points
    expect(result.points[0].id).toBe('point-v1');
    expect(result.points[1].id).toBe('point-active');

    // No length reduction — filter would shrink the array
    expect(result.points).toHaveLength(2);
  });
});
