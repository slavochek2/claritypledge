import { describe, it, expect } from 'vitest';
import { DEFAULT_LIVE_STATE } from '@/app/types';
import type { LiveSessionState } from '@/app/types';
import { isStateRegression } from '@/app/lib/live-state-merge';

/**
 * P976 — /live boolean-flag stale echo (P671 class).
 *
 * Contract the fix must satisfy:
 *   isStateRegression(local, incoming) === true  → reject/skip the incoming echo
 *
 * A regression is EITHER:
 *   1. a phase regression (delegates to isPhaseRegression), OR
 *   2. a SAME-PHASE monotonic boolean-flag regression: a submission flag that is
 *      `true` locally arrives as `false` in the incoming echo at the same ratingPhase.
 *
 * Forward phase transitions legitimately reset flags, so the flag check applies
 * ONLY when incoming.ratingPhase === local.ratingPhase.
 */

function state(overrides: Partial<LiveSessionState>): LiveSessionState {
  return { ...DEFAULT_LIVE_STATE, ...overrides };
}

describe('P976: same-phase boolean-flag stale echo must be rejected', () => {
  it('rejects checkerSubmitted true→false at the same ratingPhase', () => {
    const local = state({ ratingPhase: 'rating', checkerSubmitted: true });
    const incoming = state({ ratingPhase: 'rating', checkerSubmitted: false });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('rejects responderSubmitted true→false at the same ratingPhase', () => {
    const local = state({ ratingPhase: 'rating', responderSubmitted: true });
    const incoming = state({ ratingPhase: 'rating', responderSubmitted: false });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('rejects explainBackDone true→false at the same ratingPhase', () => {
    const local = state({ ratingPhase: 'explain-back', explainBackDone: true });
    const incoming = state({ ratingPhase: 'explain-back', explainBackDone: false });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('rejects celebrationAcknowledgedByCreator/Joiner true→false at the same ratingPhase', () => {
    const localCreator = state({ ratingPhase: 'results', celebrationAcknowledgedByCreator: true });
    const incomingCreator = state({ ratingPhase: 'results', celebrationAcknowledgedByCreator: false });
    expect(isStateRegression(localCreator, incomingCreator)).toBe(true);

    const localJoiner = state({ ratingPhase: 'results', celebrationAcknowledgedByJoiner: true });
    const incomingJoiner = state({ ratingPhase: 'results', celebrationAcknowledgedByJoiner: false });
    expect(isStateRegression(localJoiner, incomingJoiner)).toBe(true);
  });
});

describe('P976: legitimate transitions must NOT be flagged as regressions', () => {
  it('allows a true→false flag reset across a forward phase transition', () => {
    // New round: phase advances and flags legitimately reset. Not a regression.
    const local = state({ ratingPhase: 'rating', checkerSubmitted: true });
    const incoming = state({ ratingPhase: 'revealed', checkerSubmitted: false });
    expect(isStateRegression(local, incoming)).toBe(false);
  });

  it('allows a false→true flag advance at the same phase (partner just submitted)', () => {
    const local = state({ ratingPhase: 'rating', checkerSubmitted: false });
    const incoming = state({ ratingPhase: 'rating', checkerSubmitted: true });
    expect(isStateRegression(local, incoming)).toBe(false);
  });

  it('still rejects a pure phase regression (P671 behavior preserved)', () => {
    const local = state({ ratingPhase: 'revealed' });
    const incoming = state({ ratingPhase: 'waiting' });
    expect(isStateRegression(local, incoming)).toBe(true);
  });

  it('still allows the idle round-reset (P671 exception preserved)', () => {
    const local = state({ ratingPhase: 'revealed' });
    const incoming = state({ ratingPhase: 'idle' });
    expect(isStateRegression(local, incoming)).toBe(false);
  });
});
