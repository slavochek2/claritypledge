import { describe, it, expect } from 'vitest';

/**
 * P609: Free Mode Live Dots Not Updating — Regression Tests
 *
 * Tests the invariant that was violated: when partner updates arrive via Realtime
 * during an in-flight write, the confirmed state ref must include those updates
 * so the next write's optimistic update doesn't overwrite them with stale data.
 *
 * The actual bug was in clarity-live-page.tsx:
 * 1. In-flight Realtime merge updated React state but NOT confirmedLiveStateRef
 * 2. On write success, confirmedLiveStateRef was overwritten with pre-write snapshot
 *
 * These tests verify the merge patterns used in the fix.
 */

// Simulates the state management logic from clarity-live-page.tsx
// without the React/Supabase dependencies

interface MockLiveState {
  ratingPhase: string;
  freeSliderCreator?: number;
  freeSliderJoiner?: number;
  freePhase?: string;
  [key: string]: unknown;
}

const POSITION_KEYS = ['livePositionsCreator', 'livePositionsJoiner', 'freeSliderCreator', 'freeSliderJoiner'] as const;

/**
 * Simulates the in-flight Realtime merge logic (lines 1049-1068).
 * Returns the updated confirmed ref state.
 */
function inFlightRealtimeMerge(
  incoming: Record<string, unknown>,
  confirmedRef: MockLiveState
): { reactStateUpdate: Partial<MockLiveState> | null; newConfirmedRef: MockLiveState } {
  const partnerUpdates: Partial<MockLiveState> = {};
  let hasPartnerUpdate = false;

  for (const key of POSITION_KEYS) {
    if (key in incoming && incoming[key] !== undefined) {
      (partnerUpdates as Record<string, unknown>)[key] = incoming[key];
      hasPartnerUpdate = true;
    }
  }

  if (hasPartnerUpdate) {
    // P609 fix: update confirmed ref alongside React state
    return {
      reactStateUpdate: partnerUpdates,
      newConfirmedRef: { ...confirmedRef, ...partnerUpdates },
    };
  }

  return { reactStateUpdate: null, newConfirmedRef: confirmedRef };
}

/**
 * Simulates the updateLiveState write success (line 1294).
 * P609 fix: merges only the written keys, preserving partner updates in the ref.
 */
function writeSuccessRefUpdate(
  confirmedRef: MockLiveState,
  updates: Partial<MockLiveState>
): MockLiveState {
  return { ...confirmedRef, ...updates };
}

describe('P609: Free slider sync — confirmed ref preserves partner updates', () => {
  it('in-flight Realtime merge updates the confirmed ref with partner slider', () => {
    const confirmedRef: MockLiveState = {
      ratingPhase: 'idle',
      freeSliderCreator: 5,
      freeSliderJoiner: 3, // stale partner value
    };

    const realtimePayload = { freeSliderJoiner: 7 }; // partner moved to 7

    const result = inFlightRealtimeMerge(realtimePayload, confirmedRef);

    expect(result.newConfirmedRef.freeSliderJoiner).toBe(7);
    expect(result.reactStateUpdate).toEqual({ freeSliderJoiner: 7 });
  });

  it('next write after in-flight merge preserves partner slider value', () => {
    // Step 1: Initial state
    let confirmedRef: MockLiveState = {
      ratingPhase: 'idle',
      freeSliderCreator: 5,
      freeSliderJoiner: 3,
    };

    // Step 2: User A starts a write (slider to 6)
    const writeUpdates = { freeSliderCreator: 6 };
    // optimisticState = { ...confirmedRef, ...writeUpdates }
    const optimisticState = { ...confirmedRef, ...writeUpdates };

    // Step 3: During in-flight, partner's Realtime event arrives (slider to 7)
    const realtimeResult = inFlightRealtimeMerge({ freeSliderJoiner: 7 }, confirmedRef);
    confirmedRef = realtimeResult.newConfirmedRef;

    // Step 4: Write succeeds — merge only written keys into ref
    confirmedRef = writeSuccessRefUpdate(confirmedRef, writeUpdates);

    // CRITICAL ASSERTION: Partner's value (7) is preserved, not overwritten with stale (3)
    expect(confirmedRef.freeSliderJoiner).toBe(7);
    expect(confirmedRef.freeSliderCreator).toBe(6);

    // Step 5: User A moves slider again — optimistic state should include partner's 7
    const nextOptimistic = { ...confirmedRef, freeSliderCreator: 8 };
    expect(nextOptimistic.freeSliderJoiner).toBe(7); // NOT 3
    expect(nextOptimistic.freeSliderCreator).toBe(8);

    // Verify the OLD behavior would have failed:
    // Old: confirmedRef = optimisticState (from step 2, which has freeSliderJoiner: 3)
    const oldBehaviorRef = optimisticState; // This was the bug
    expect(oldBehaviorRef.freeSliderJoiner).toBe(3); // Stale! This was the root cause.
  });

  it('multiple rapid partner updates during in-flight are all preserved', () => {
    let confirmedRef: MockLiveState = {
      ratingPhase: 'idle',
      freeSliderCreator: 5,
      freeSliderJoiner: 3,
    };

    // User A writes
    const writeUpdates = { freeSliderCreator: 6 };

    // Partner sends multiple Realtime updates during in-flight
    const merge1 = inFlightRealtimeMerge({ freeSliderJoiner: 5 }, confirmedRef);
    confirmedRef = merge1.newConfirmedRef;

    const merge2 = inFlightRealtimeMerge({ freeSliderJoiner: 7 }, confirmedRef);
    confirmedRef = merge2.newConfirmedRef;

    const merge3 = inFlightRealtimeMerge({ freeSliderJoiner: 9 }, confirmedRef);
    confirmedRef = merge3.newConfirmedRef;

    // Write succeeds
    confirmedRef = writeSuccessRefUpdate(confirmedRef, writeUpdates);

    // Latest partner value preserved
    expect(confirmedRef.freeSliderJoiner).toBe(9);
    expect(confirmedRef.freeSliderCreator).toBe(6);
  });

  it('position keys are also preserved during in-flight merges', () => {
    let confirmedRef: MockLiveState = {
      ratingPhase: 'idle',
    };

    // Partner's position update arrives during in-flight
    const result = inFlightRealtimeMerge(
      { livePositionsJoiner: { 'point-1': 'agree' } },
      confirmedRef
    );
    confirmedRef = result.newConfirmedRef;

    expect((confirmedRef as Record<string, unknown>).livePositionsJoiner).toEqual({ 'point-1': 'agree' });
  });

  it('non-position keys in Realtime payload are ignored during in-flight merge', () => {
    const confirmedRef: MockLiveState = {
      ratingPhase: 'idle',
      freeSliderCreator: 5,
    };

    // Realtime delivers ratingPhase change during in-flight — should be ignored
    const result = inFlightRealtimeMerge(
      { ratingPhase: 'rating', freeSliderJoiner: 7 },
      confirmedRef
    );

    // Only slider key merged, not ratingPhase
    expect(result.reactStateUpdate).toEqual({ freeSliderJoiner: 7 });
    expect(result.newConfirmedRef.ratingPhase).toBe('idle'); // unchanged
    expect(result.newConfirmedRef.freeSliderJoiner).toBe(7);
  });
});
