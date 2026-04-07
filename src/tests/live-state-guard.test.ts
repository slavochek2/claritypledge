import { describe, it, expect } from 'vitest';

/**
 * P674: Monotonic State Guard — Unit Tests
 *
 * Tests the `isStateRegression()` pure function that protects against
 * stale Realtime echoes clobbering live session state. This is the core
 * architectural fix for P671-class bugs.
 *
 * The function will be implemented in `src/app/pages/live-state-guard.ts`.
 * These tests define the contract before implementation (test-first).
 *
 * Guard rules:
 * 1. If incoming `phase` is behind current `phase` in enum order → reject
 *    (exception: `idle` reset after `celebration` when both acked)
 * 2. If incoming `phase` equals current `phase` and any boolean flag
 *    regresses from `true` to `false` → reject
 * 3. Drift poll applies identical guard — no bypass path
 */

// ─── Types (mirroring src/app/pages/live-state-guard.ts) ─────────────

type Phase = 'idle' | 'rating' | 'waiting' | 'revealed' | 'paraphrase' | 'sliders' | 'celebration';

const PHASE_ORDER: Phase[] = [
  'idle',
  'rating',
  'waiting',
  'revealed',
  'paraphrase',
  'sliders',
  'celebration',
];

/** Boolean flags that must never regress from true → false within the same phase */
const MONOTONIC_BOOLEANS = [
  'ratingASubmitted',
  'ratingBSubmitted',
  'explainBackStarted',
  'explainBackDone',
  'celebrationAckedCreator',
  'celebrationAckedJoiner',
] as const;

interface LiveState {
  phase: Phase;
  ratingASubmitted?: boolean;
  ratingBSubmitted?: boolean;
  explainBackStarted?: boolean;
  explainBackDone?: boolean;
  celebrationAckedCreator?: boolean;
  celebrationAckedJoiner?: boolean;
  [key: string]: unknown;
}

// ─── Pure function under test ────────────────────────────────────────
// TODO: Import from src/app/pages/live-state-guard.ts once implemented.
// For now, inline the expected logic so tests define the contract.

function isStateRegression(incoming: LiveState, current: LiveState): boolean {
  const incomingIdx = PHASE_ORDER.indexOf(incoming.phase);
  const currentIdx = PHASE_ORDER.indexOf(current.phase);

  // Rule: idle reset after celebration is allowed ONLY when both acked
  if (
    incoming.phase === 'idle' &&
    current.phase === 'celebration' &&
    incoming.celebrationAckedCreator &&
    incoming.celebrationAckedJoiner
  ) {
    return false; // Not a regression — valid reset
  }

  // Rule 1: Phase regression → reject
  if (incomingIdx < currentIdx) {
    return true;
  }

  // Rule 2: Same phase, boolean flag regression → reject
  if (incomingIdx === currentIdx) {
    for (const flag of MONOTONIC_BOOLEANS) {
      if (current[flag] === true && incoming[flag] === false) {
        return true;
      }
    }
  }

  return false;
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('isStateRegression — Phase ordering', () => {
  it('allows forward phase transitions', () => {
    for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
      const current: LiveState = { phase: PHASE_ORDER[i] };
      const incoming: LiveState = { phase: PHASE_ORDER[i + 1] };
      expect(isStateRegression(incoming, current)).toBe(false);
    }
  });

  it('rejects backward phase transitions', () => {
    for (let i = 1; i < PHASE_ORDER.length; i++) {
      const current: LiveState = { phase: PHASE_ORDER[i] };
      const incoming: LiveState = { phase: PHASE_ORDER[i - 1] };
      // Exception: celebration → idle with both acked (tested separately)
      if (current.phase === 'celebration' && incoming.phase === 'sliders') {
        expect(isStateRegression(incoming, current)).toBe(true);
      } else {
        expect(isStateRegression(incoming, current)).toBe(true);
      }
    }
  });

  it('allows same-phase updates when no boolean regression', () => {
    const current: LiveState = { phase: 'rating' };
    const incoming: LiveState = { phase: 'rating', ratingASubmitted: true };
    expect(isStateRegression(incoming, current)).toBe(false);
  });

  it('rejects regression from revealed back to idle', () => {
    const current: LiveState = { phase: 'revealed' };
    const incoming: LiveState = { phase: 'idle' };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects regression from sliders back to rating', () => {
    const current: LiveState = { phase: 'sliders' };
    const incoming: LiveState = { phase: 'rating' };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('allows skipping phases (e.g., rating → revealed)', () => {
    const current: LiveState = { phase: 'rating' };
    const incoming: LiveState = { phase: 'revealed' };
    expect(isStateRegression(incoming, current)).toBe(false);
  });
});

describe('isStateRegression — Boolean flag regression', () => {
  it('rejects ratingASubmitted true → false within same phase', () => {
    const current: LiveState = { phase: 'rating', ratingASubmitted: true };
    const incoming: LiveState = { phase: 'rating', ratingASubmitted: false };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects ratingBSubmitted true → false within same phase', () => {
    const current: LiveState = { phase: 'waiting', ratingBSubmitted: true };
    const incoming: LiveState = { phase: 'waiting', ratingBSubmitted: false };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects explainBackDone true → false within same phase', () => {
    const current: LiveState = { phase: 'paraphrase', explainBackDone: true };
    const incoming: LiveState = { phase: 'paraphrase', explainBackDone: false };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects celebrationAckedCreator true → false within same phase', () => {
    const current: LiveState = { phase: 'celebration', celebrationAckedCreator: true };
    const incoming: LiveState = { phase: 'celebration', celebrationAckedCreator: false };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects celebrationAckedJoiner true → false within same phase', () => {
    const current: LiveState = { phase: 'celebration', celebrationAckedJoiner: true };
    const incoming: LiveState = { phase: 'celebration', celebrationAckedJoiner: false };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('allows boolean flag false → true (forward progress)', () => {
    const current: LiveState = { phase: 'rating', ratingASubmitted: false };
    const incoming: LiveState = { phase: 'rating', ratingASubmitted: true };
    expect(isStateRegression(incoming, current)).toBe(false);
  });

  it('allows boolean flag undefined → true', () => {
    const current: LiveState = { phase: 'rating' };
    const incoming: LiveState = { phase: 'rating', ratingASubmitted: true };
    expect(isStateRegression(incoming, current)).toBe(false);
  });

  it('allows boolean flag true → true (no change)', () => {
    const current: LiveState = { phase: 'rating', ratingASubmitted: true };
    const incoming: LiveState = { phase: 'rating', ratingASubmitted: true };
    expect(isStateRegression(incoming, current)).toBe(false);
  });

  it('ignores boolean flag regression when phase advances (forward phase wins)', () => {
    const current: LiveState = { phase: 'rating', ratingASubmitted: true };
    const incoming: LiveState = { phase: 'waiting', ratingASubmitted: false };
    expect(isStateRegression(incoming, current)).toBe(false);
  });
});

describe('isStateRegression — P671 scenario: stale echo after rating submission', () => {
  it('rejects stale echo that clobbers ratingASubmitted in waiting phase', () => {
    // P671 exact scenario: partner submits rating, moves to waiting.
    // A stale Realtime echo arrives with ratingASubmitted: false.
    const current: LiveState = {
      phase: 'waiting',
      ratingASubmitted: true,
      ratingBSubmitted: false,
    };
    const incoming: LiveState = {
      phase: 'waiting',
      ratingASubmitted: false, // stale echo
      ratingBSubmitted: false,
    };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('allows legitimate update where second participant submits', () => {
    const current: LiveState = {
      phase: 'waiting',
      ratingASubmitted: true,
      ratingBSubmitted: false,
    };
    const incoming: LiveState = {
      phase: 'waiting',
      ratingASubmitted: true,
      ratingBSubmitted: true, // second participant submitted
    };
    expect(isStateRegression(incoming, current)).toBe(false);
  });
});

describe('isStateRegression — Idle reset exception (celebration → idle)', () => {
  it('allows idle reset when both celebration acks are true', () => {
    const current: LiveState = {
      phase: 'celebration',
      celebrationAckedCreator: true,
      celebrationAckedJoiner: true,
    };
    const incoming: LiveState = {
      phase: 'idle',
      celebrationAckedCreator: true,
      celebrationAckedJoiner: true,
    };
    expect(isStateRegression(incoming, current)).toBe(false);
  });

  it('rejects idle reset when only creator acked', () => {
    const current: LiveState = {
      phase: 'celebration',
      celebrationAckedCreator: true,
      celebrationAckedJoiner: false,
    };
    const incoming: LiveState = {
      phase: 'idle',
      celebrationAckedCreator: true,
      celebrationAckedJoiner: false,
    };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects idle reset when only joiner acked', () => {
    const current: LiveState = {
      phase: 'celebration',
      celebrationAckedCreator: false,
      celebrationAckedJoiner: true,
    };
    const incoming: LiveState = {
      phase: 'idle',
      celebrationAckedCreator: false,
      celebrationAckedJoiner: true,
    };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects idle reset when neither acked', () => {
    const current: LiveState = { phase: 'celebration' };
    const incoming: LiveState = { phase: 'idle' };
    expect(isStateRegression(incoming, current)).toBe(true);
  });

  it('rejects idle reset from non-celebration phase', () => {
    const current: LiveState = { phase: 'sliders' };
    const incoming: LiveState = { phase: 'idle' };
    expect(isStateRegression(incoming, current)).toBe(true);
  });
});

describe('isStateRegression — Multiple simultaneous boolean regressions', () => {
  it('rejects when multiple flags regress simultaneously', () => {
    const current: LiveState = {
      phase: 'celebration',
      celebrationAckedCreator: true,
      celebrationAckedJoiner: true,
    };
    const incoming: LiveState = {
      phase: 'celebration',
      celebrationAckedCreator: false,
      celebrationAckedJoiner: false,
    };
    expect(isStateRegression(incoming, current)).toBe(true);
  });
});

describe('isStateRegression — Non-boolean fields pass through', () => {
  it('allows numeric field changes within same phase (e.g., sliderCreator)', () => {
    const current: LiveState = { phase: 'sliders', sliderCreator: 5 };
    const incoming: LiveState = { phase: 'sliders', sliderCreator: 3 };
    expect(isStateRegression(incoming, current)).toBe(false);
  });

  it('allows string field changes within same phase (e.g., selectedStoryId)', () => {
    const current: LiveState = { phase: 'idle', selectedStoryId: 'abc' };
    const incoming: LiveState = { phase: 'idle', selectedStoryId: 'def' };
    expect(isStateRegression(incoming, current)).toBe(false);
  });
});

describe('PHASE_ORDER completeness', () => {
  it('contains all 7 phases in the correct order', () => {
    expect(PHASE_ORDER).toEqual([
      'idle',
      'rating',
      'waiting',
      'revealed',
      'paraphrase',
      'sliders',
      'celebration',
    ]);
  });

  it('has no duplicate phases', () => {
    const unique = new Set(PHASE_ORDER);
    expect(unique.size).toBe(PHASE_ORDER.length);
  });
});
