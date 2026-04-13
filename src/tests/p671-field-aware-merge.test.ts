import { describe, it, expect } from 'vitest';
import { isPhaseRegression } from '@/app/pages/clarity-live-page';

/**
 * P671: Field-aware merge — unit tests.
 *
 * Verifies the logic used in the Realtime handler and drift poll
 * when `updateInFlightRef` is true. The merge rule:
 *   - ratingPhase: take the HIGHER value (server beats local if ahead)
 *   - All other fields: local wins (preserves optimistic values)
 *
 * The actual merge happens inside React state setters, but the phase
 * selection logic is testable via `isPhaseRegression`.
 */

describe('P671: field-aware merge phase selection', () => {
  /**
   * Simulates the merge logic from clarity-live-page.tsx:
   *
   *   const phaseToUse = isPhaseRegression(serverPhase, localPhase)
   *     ? serverPhase   // server is ahead
   *     : localPhase;   // local is ahead or equal
   */
  function selectPhase(serverPhase: string, localPhase: string): string {
    return isPhaseRegression(serverPhase, localPhase)
      ? serverPhase  // server is ahead
      : localPhase;  // local is ahead or equal
  }

  it('server revealed beats local waiting (the core P671 bug)', () => {
    // This is THE scenario: server auto-reveals, but local still has 'waiting'
    // from the optimistic write. The merge must pick 'revealed'.
    expect(selectPhase('revealed', 'waiting')).toBe('revealed');
  });

  it('equal phases: local wins (no-op)', () => {
    expect(selectPhase('waiting', 'waiting')).toBe('waiting');
    expect(selectPhase('revealed', 'revealed')).toBe('revealed');
  });

  it('local ahead of server: local wins', () => {
    // Local has already advanced past the server echo
    expect(selectPhase('waiting', 'revealed')).toBe('revealed');
    expect(selectPhase('idle', 'waiting')).toBe('waiting');
  });

  it('server at results beats local at revealed', () => {
    expect(selectPhase('results', 'revealed')).toBe('results');
  });

  it('idle reset from server is accepted (round reset)', () => {
    // idle is a deliberate round reset — isPhaseRegression returns false for idle
    // so local wins... but idle resets come through the normal (non-inflight) path
    // When in-flight with local at 'revealed' and server sends 'idle':
    // isPhaseRegression('idle', 'revealed') = false (idle exception), so local wins
    // This is correct: during an in-flight write, we don't want an idle reset
    // to clobber our optimistic state. The drift poll will handle it after write completes.
    expect(selectPhase('idle', 'revealed')).toBe('revealed');
  });

  it('full merge preserves non-phase local fields while taking server phase', () => {
    // Simulates the actual spread: { ...mergedState, ...prev, ratingPhase: phaseToUse }
    const serverState = {
      ratingPhase: 'revealed',
      checkerSubmitted: false,
      responderSubmitted: true,
      checkerRating: 0,
    };
    const localState = {
      ratingPhase: 'waiting',
      checkerSubmitted: true,
      checkerRating: 7,
      responderSubmitted: false,
    };

    const phaseToUse = selectPhase(serverState.ratingPhase, localState.ratingPhase);
    const merged = { ...serverState, ...localState, ratingPhase: phaseToUse };

    // Phase: server's 'revealed' (server is ahead)
    expect(merged.ratingPhase).toBe('revealed');
    // checkerSubmitted: local's true (optimistic, local wins)
    expect(merged.checkerSubmitted).toBe(true);
    // checkerRating: local's 7 (optimistic, local wins)
    expect(merged.checkerRating).toBe(7);
    // responderSubmitted: local's false (local wins — we don't have partner's submit yet)
    expect(merged.responderSubmitted).toBe(false);
  });
});
