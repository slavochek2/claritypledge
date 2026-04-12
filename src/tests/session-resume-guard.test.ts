/**
 * @file session-resume-guard.test.ts
 * @description Canary test for session resume guard bug on story 0.
 *
 * Bug: When currentStoryIndex === 0 but the user has rated story 0,
 * the old guard (currentStoryIndex > 0) returns false and progress is discarded.
 *
 * Fix: Add hasProgress check — if any story has rating !== null OR is past its
 * initial phase, the state should be restored even when stuck on story 0.
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Simplified state types (mirrors LetterReadingState internals)
// ---------------------------------------------------------------------------

interface MockStoryState {
  phase: string;
  rating: number | null;
  currentPointIndex: number;
  positions: Record<string, string>;
}

interface MockSavedState {
  currentStoryIndex: number;
  stories: MockStoryState[];
  isComplete: boolean;
}

// initial phases by number of visible points (mirrors initialPhase() in hook)
const INITIAL_PHASE_0_POINTS = 'story-rate';
const INITIAL_PHASE_1_POINT = 'story-rate';
const INITIAL_PHASE_2_PLUS = 'point-engage';

// ---------------------------------------------------------------------------
// The OLD guard (the bug)
// ---------------------------------------------------------------------------

function oldGuard(saved: MockSavedState, _snapshotsLength: number): boolean {
  return saved.stories.length === _snapshotsLength && saved.currentStoryIndex > 0;
}

// ---------------------------------------------------------------------------
// The NEW guard (the fix — mirrors the updated condition in useLetterReadingState.ts)
// ---------------------------------------------------------------------------

function newGuard(
  saved: MockSavedState,
  snapshotsLength: number,
  initialPhases: string[],
): boolean {
  const hasProgress = saved.stories.some(
    (s, i) => s.rating !== null || s.phase !== initialPhases[i],
  );
  return (
    saved.stories.length === snapshotsLength &&
    (saved.currentStoryIndex > 0 || hasProgress)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('session resume guard — story-0 progress lost on reload (Bug)', () => {
  it('old guard returns false when user rated story 0 (bug: progress lost)', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        { phase: 'story-revealed', rating: 3, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    // BUG: old guard ignores rating; returns false → state is discarded
    expect(oldGuard(saved, 1)).toBe(false);
  });
});

describe('session resume guard — fix: hasProgress detects story-0 completion', () => {
  it('new guard returns true when user rated story 0 (fix: progress restored)', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        { phase: 'story-revealed', rating: 3, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    // FIX: hasProgress detects rating → returns true → state is restored
    expect(newGuard(saved, 1, [INITIAL_PHASE_0_POINTS])).toBe(true);
  });

  it('new guard returns false for truly fresh state (no progress on story 0)', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        { phase: INITIAL_PHASE_0_POINTS, rating: null, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    // No progress at all → should NOT restore (avoid restoring a fresh stale session)
    expect(newGuard(saved, 1, [INITIAL_PHASE_0_POINTS])).toBe(false);
  });

  it('new guard detects progress via phase advance even without a rating', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        // User advanced past story-rate but hasn't submitted rating yet (edge case)
        { phase: 'story-revealed', rating: null, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    expect(newGuard(saved, 1, [INITIAL_PHASE_0_POINTS])).toBe(true);
  });

  it('new guard still returns true for story index > 0 (existing behavior preserved)', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 1,
      stories: [
        { phase: 'transition', rating: 3, positions: {}, currentPointIndex: 0 },
        { phase: INITIAL_PHASE_2_PLUS, rating: null, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    expect(newGuard(saved, 2, [INITIAL_PHASE_2_PLUS, INITIAL_PHASE_2_PLUS])).toBe(true);
  });

  it('new guard returns false for 2-point story in fresh state', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        { phase: INITIAL_PHASE_2_PLUS, rating: null, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    expect(newGuard(saved, 1, [INITIAL_PHASE_2_PLUS])).toBe(false);
  });

  it('new guard detects progress via position submitted (no rating yet)', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        {
          phase: 'point-revealed',
          rating: null,
          positions: { 'point-1': 'agree' },
          currentPointIndex: 0,
        },
      ],
      isComplete: false,
    };
    // phase !== initial phase → hasProgress = true
    expect(newGuard(saved, 1, [INITIAL_PHASE_2_PLUS])).toBe(true);
  });

  it('snapshots length mismatch always returns false (invariant unchanged)', () => {
    const saved: MockSavedState = {
      currentStoryIndex: 0,
      stories: [
        { phase: 'story-revealed', rating: 3, positions: {}, currentPointIndex: 0 },
      ],
      isComplete: false,
    };
    // Letter now has 2 stories but saved state has 1 — stale, must not restore
    expect(newGuard(saved, 2, [INITIAL_PHASE_0_POINTS, INITIAL_PHASE_1_POINT])).toBe(false);
  });
});
