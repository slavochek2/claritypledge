import { describe, it, expect } from 'vitest';
import { isPhaseRegression } from '@/app/pages/clarity-live-page';
import { isStateRegression } from '@/app/lib/live-state-merge';
import { DEFAULT_LIVE_STATE } from '@/app/types';
import type { LiveSessionState } from '@/app/types';

function state(overrides: Partial<LiveSessionState>): LiveSessionState {
  return { ...DEFAULT_LIVE_STATE, ...overrides };
}

/**
 * Monotonic State Guard — Unit Tests (P671 stuck-session class).
 *
 * Tests the REAL shipped guard `isPhaseRegression(localPhase, incomingPhase)`
 * exported from `src/app/pages/clarity-live-page.tsx`. This guard protects the
 * Realtime merge handler and the drift poll from stale echoes that would regress
 * the session's `ratingPhase` (see the merge path around clarity-live-page.tsx
 * line ~1254 and the `mergeInFlight` helper in `src/app/lib/live-state-merge.ts`).
 *
 * Production contract (verbatim from the source):
 *   const PHASE_ORDER = { idle: 0, waiting: 1, rating: 2, revealed: 3,
 *                         'explain-back': 4, results: 5 };
 *   localRank    = PHASE_ORDER[localPhase]    ?? -1
 *   incomingRank = PHASE_ORDER[incomingPhase] ?? -1
 *   isRoundReset = incomingPhase === 'idle' && localRank > 0
 *   return incomingRank < localRank && !isRoundReset
 *
 * In words: a regression is "incoming is ranked behind local" — EXCEPT an
 * incoming `idle` from any non-idle phase, which is an allowed round reset.
 *
 * NOTE: this guard is PHASE-ONLY. It does NOT inspect boolean flags
 * (checkerSubmitted / responderSubmitted / explainBackDone / celebration acks).
 * The previous version of this file tested a phantom inline `isStateRegression`
 * that DID check boolean-flag regressions — coverage that does not exist in
 * production. That gap is documented (and intentionally skipped) at the bottom
 * of this file.
 */

// Canonical production rank order — mirrors PHASE_ORDER in clarity-live-page.tsx.
const PHASE_ORDER = ['idle', 'waiting', 'rating', 'revealed', 'explain-back', 'results'] as const;

describe('isPhaseRegression — rank table is the production contract', () => {
  it('ranks phases idle<waiting<rating<revealed<explain-back<results', () => {
    // Adjacent forward steps are never regressions; this pins the exact ordering.
    expect(PHASE_ORDER).toEqual(['idle', 'waiting', 'rating', 'revealed', 'explain-back', 'results']);
  });
});

describe('isPhaseRegression — forward transitions are allowed', () => {
  it('every adjacent forward step returns false', () => {
    for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
      const local = PHASE_ORDER[i];
      const incoming = PHASE_ORDER[i + 1];
      expect(isPhaseRegression(local, incoming)).toBe(false);
    }
  });

  it('every forward jump (skipping phases) returns false', () => {
    for (let i = 0; i < PHASE_ORDER.length; i++) {
      for (let j = i + 1; j < PHASE_ORDER.length; j++) {
        const local = PHASE_ORDER[i];
        const incoming = PHASE_ORDER[j];
        expect(isPhaseRegression(local, incoming)).toBe(false);
      }
    }
  });
});

describe('isPhaseRegression — equal phases are not regressions', () => {
  it('returns false when incoming === local for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(isPhaseRegression(phase, phase)).toBe(false);
    }
  });
});

describe('isPhaseRegression — backward transitions are rejected (except idle reset)', () => {
  it('every backward pair returns true UNLESS the incoming phase is idle', () => {
    for (let i = 0; i < PHASE_ORDER.length; i++) {
      for (let j = 0; j < i; j++) {
        const local = PHASE_ORDER[i];      // higher rank
        const incoming = PHASE_ORDER[j];   // lower rank → would regress
        if (incoming === 'idle') {
          // Idle reset exception — handled in its own describe block below.
          expect(isPhaseRegression(local, incoming)).toBe(false);
        } else {
          expect(isPhaseRegression(local, incoming)).toBe(true);
        }
      }
    }
  });

  // Explicit named boundary cases (readability + regression anchors).
  it('rejects revealed → rating', () => {
    expect(isPhaseRegression('revealed', 'rating')).toBe(true);
  });

  it('rejects rating → waiting', () => {
    expect(isPhaseRegression('rating', 'waiting')).toBe(true);
  });

  it('rejects results → explain-back', () => {
    expect(isPhaseRegression('results', 'explain-back')).toBe(true);
  });

  it('rejects results → waiting (multi-step backward jump)', () => {
    expect(isPhaseRegression('results', 'waiting')).toBe(true);
  });

  it('rejects explain-back → revealed', () => {
    expect(isPhaseRegression('explain-back', 'revealed')).toBe(true);
  });
});

describe('isPhaseRegression — idle round-reset exception', () => {
  it('allows incoming idle from every non-idle phase (round reset)', () => {
    for (const local of PHASE_ORDER) {
      if (local === 'idle') continue; // localRank must be > 0 for the reset branch
      expect(isPhaseRegression(local, 'idle')).toBe(false);
    }
  });

  it('idle → idle is not a regression (both rank 0)', () => {
    // incomingRank (0) < localRank (0) is false, so the guard returns false
    // regardless of the round-reset branch.
    expect(isPhaseRegression('idle', 'idle')).toBe(false);
  });

  it('the P671 scenario: stale waiting echo over revealed is rejected, but an idle reset is allowed', () => {
    // The exact stuck-session shape: local has advanced to 'revealed', a queued
    // stale echo carries the earlier 'waiting'. Must be rejected.
    expect(isPhaseRegression('revealed', 'waiting')).toBe(true);
    // A deliberate new-round reset to idle from the same 'revealed' is allowed.
    expect(isPhaseRegression('revealed', 'idle')).toBe(false);
  });
});

describe('isPhaseRegression — unknown / unmapped phases (rank -1)', () => {
  it('unknown incoming over a known local IS a regression (rank -1 < known rank)', () => {
    // An unrecognized incoming phase ranks -1, which is behind any mapped phase
    // and is NOT the idle exception → treated as a regression and rejected.
    expect(isPhaseRegression('rating', 'bogus-phase')).toBe(true);
  });

  it('known incoming over an unknown local is NOT a regression (rank >= -1)', () => {
    // localRank is -1; any mapped incoming rank (>= 0) is not < -1 → allowed.
    expect(isPhaseRegression('bogus-phase', 'rating')).toBe(false);
  });

  it('unknown over unknown is not a regression (-1 < -1 is false)', () => {
    expect(isPhaseRegression('bogus-a', 'bogus-b')).toBe(false);
  });
});

/**
 * P976 FIX: boolean-flag stale-echo regression is now guarded by `isStateRegression`.
 * The four cases below were previously it.todo entries documenting the gap;
 * they are now active tests verifying the fix is in place.
 */
describe('isStateRegression — same-phase boolean-flag stale echoes are rejected (P976)', () => {
  it('rejects a same-phase incoming checkerSubmitted:true→false (stale echo)', () => {
    const local = state({ ratingPhase: 'rating', checkerSubmitted: true });
    const incoming = state({ ratingPhase: 'rating', checkerSubmitted: false });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('rejects a same-phase incoming responderSubmitted:true→false (stale echo)', () => {
    const local = state({ ratingPhase: 'rating', responderSubmitted: true });
    const incoming = state({ ratingPhase: 'rating', responderSubmitted: false });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('rejects a same-phase incoming explainBackDone:true→false (stale echo)', () => {
    const local = state({ ratingPhase: 'explain-back', explainBackDone: true });
    const incoming = state({ ratingPhase: 'explain-back', explainBackDone: false });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('rejects same-phase celebrationAcknowledgedByCreator/Joiner true→false', () => {
    const localC = state({ ratingPhase: 'results', celebrationAcknowledgedByCreator: true });
    const incomingC = state({ ratingPhase: 'results', celebrationAcknowledgedByCreator: false });
    expect(isStateRegression(localC, incomingC)).toBe(true);

    const localJ = state({ ratingPhase: 'results', celebrationAcknowledgedByJoiner: true });
    const incomingJ = state({ ratingPhase: 'results', celebrationAcknowledgedByJoiner: false });
    expect(isStateRegression(localJ, incomingJ)).toBe(true);
  });

  it('delegates phase regressions to the existing isPhaseRegression contract', () => {
    // isStateRegression must return true for all backward-phase echoes
    const local = state({ ratingPhase: 'revealed' });
    const incoming = state({ ratingPhase: 'waiting' });
    expect(isStateRegression(local, incoming)).toBe(true);
    // idle round-reset exception preserved
    expect(isStateRegression(local, state({ ratingPhase: 'idle' }))).toBe(false);
  });
});
