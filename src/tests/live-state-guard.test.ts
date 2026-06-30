import { describe, it, expect } from 'vitest';
import { isPhaseRegression } from '@/app/pages/clarity-live-page';

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
 * ─────────────────────────────────────────────────────────────────────────
 * DOCUMENTED PRODUCTION GAP — boolean-flag stale-echo regression is UNGUARDED.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The shipped guard (`isPhaseRegression`) only protects `ratingPhase`. There is
 * NO monotonic guard for the boolean submission flags. Evidence:
 *
 *   - clarity-live-page.tsx line ~1270: the Realtime handler skips the event ONLY
 *     when `isPhaseRegression(...)` is true (phase-based). Otherwise:
 *       • in-flight  → `mergeInFlight` (live-state-merge.ts) overlays `...prev`
 *         over `...incoming`, so local booleans survive — but ONLY incidentally,
 *         and ONLY while `updateInFlightRef.current` is true.
 *       • NOT in-flight → `setLiveState(mergedState)` does a WHOLESALE replace
 *         (clarity-live-page.tsx line ~1288-1291). An incoming `checkerSubmitted:
 *         false` at the SAME ratingPhase overwrites a local `true` with no guard.
 *   - The drift poll (clarity-live-page.tsx line ~1543-1545) has the identical
 *     wholesale-replace branch.
 *   - `mergeInFlight` (live-state-merge.ts line ~39-49) applies the monotonic
 *     guard to `ratingPhase` ONLY; boolean flags are never compared.
 *
 * Consequence: a stale Realtime echo arriving at the same phase, while no write
 * is in flight, can clobber a freshly-set `checkerSubmitted`/`responderSubmitted`
 * back to `false` — the original P671 "stuck session" failure mode, via a flag
 * rather than via the phase.
 *
 * The previous phantom test masked this by testing an inline function that DID
 * guard boolean regressions. The tests below describe the behavior a real guard
 * WOULD need. They are skipped, not deleted: fixing the production guard is a
 * separate decision and must not be silently implied by green tests here.
 */
describe.skip('GAP: boolean-flag stale-echo regression (NOT guarded in production)', () => {
  it.todo(
    'should reject a same-phase incoming checkerSubmitted:true→false (stale echo) — ' +
    'no production guard exists; isPhaseRegression is phase-only',
  );
  it.todo(
    'should reject a same-phase incoming responderSubmitted:true→false (stale echo)',
  );
  it.todo(
    'should reject a same-phase incoming explainBackDone:true→false (stale echo)',
  );
  it.todo(
    'should reject same-phase celebrationAcknowledgedByCreator/Joiner true→false',
  );
});
