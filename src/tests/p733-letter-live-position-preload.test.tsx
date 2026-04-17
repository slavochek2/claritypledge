/**
 * @file p733-letter-live-position-preload.test.tsx
 * @description Canary tests for P733 — letter-sourced /live pre-loaded positions + CTA removal.
 *
 * T1: toPositionRecord converts a Map<pointId, PointPosition> into Record<pointId, PositionType>
 * T2: Both creator and joiner position records are correctly shaped for bootstrapState
 * T3: PointRow does NOT render "Add your story" text (CTA removed)
 *
 * T3 is the failing canary — it asserts the CTA is absent, which fails until the CTA block
 * is removed from PointRow. T1/T2 specify the pure helper used in bootstrapLetterSourcedSession.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PointRow } from '@/app/components/partners/live-story-card-expanded';
import type { PointSummary, PositionType } from '@/app/types';

// ─── Pure helper spec (T1 + T2) ──────────────────────────────────────────────
// These specify the `toPositionRecord` function extracted from bootstrapLetterSourcedSession.
// After the fix, replace this inline definition with the real import.

interface PositionLike { position: string }

function toPositionRecord(map: Map<string, PositionLike>): Record<string, PositionType> {
  return Object.fromEntries(
    [...map.entries()].map(([id, v]) => [id, v.position as PositionType])
  );
}

describe('toPositionRecord() — bootstrap position converter', () => {
  it('T1: converts creator positions map to Record<pointId, PositionType>', () => {
    const creatorMap = new Map<string, PositionLike>([
      ['point-aaa', { position: 'agree' }],
      ['point-bbb', { position: 'strongly_disagree' }],
    ]);

    const record = toPositionRecord(creatorMap);

    expect(record['point-aaa']).toBe('agree');
    expect(record['point-bbb']).toBe('strongly_disagree');
    expect(Object.keys(record)).toHaveLength(2);
  });

  it('T2: both creator and joiner records are correctly shaped for bootstrapState', () => {
    const creatorMap = new Map<string, PositionLike>([
      ['point-1', { position: 'agree' }],
    ]);
    const joinerMap = new Map<string, PositionLike>([
      ['point-1', { position: 'disagree' }],
    ]);

    const livePositionsCreator = toPositionRecord(creatorMap);
    const livePositionsJoiner = toPositionRecord(joinerMap);

    // bootstrapState should include both keys with the correct values
    const bootstrapState = { livePositionsCreator, livePositionsJoiner };

    expect(bootstrapState.livePositionsCreator['point-1']).toBe('agree');
    expect(bootstrapState.livePositionsJoiner['point-1']).toBe('disagree');
  });
});

// ─── PointRow CTA canary (T3) ─────────────────────────────────────────────────
// This test FAILS before the fix (CTA "Add your story →" is present in PointRow).
// It PASSES after the CTA block is removed.

const minimalPoint: PointSummary = {
  id: 'point-canary-1',
  statement: 'Remote work improves productivity',
  tags: [],
  systemTags: [],
  visibility: 'public',
  // No userPosition — shouldShowStoryCTA returns 'show' for non-own, no-position case
};

describe('PointRow — story CTA removed (P733)', () => {
  it('T3: does NOT render "Add your story" text anywhere in PointRow', () => {
    render(
      <PointRow
        point={minimalPoint}
        authorName="Alice"
        // No letterMode, readOnly, isGuest, or hideStoryCTA — CTA was shown in these conditions
      />
    );

    // Before fix: "Add your story →" IS rendered → this assertion fails
    // After fix: CTA block removed → this assertion passes
    expect(screen.queryByText(/Add your story/)).toBeNull();
  });

  it('T3b: does NOT render "Available after the session" hint text', () => {
    render(
      <PointRow
        point={minimalPoint}
        authorName="Alice"
      />
    );

    expect(screen.queryByText(/Available after the session/)).toBeNull();
  });
});
