import type { LiveSessionState } from '@/app/types';

export const PARTNER_OWNED_KEYS = [
  'freeSliderCreator',
  'freeSliderJoiner',
  'livePositionsCreator',
  'livePositionsJoiner',
] as const;

export type PartnerOwnedKey = (typeof PARTNER_OWNED_KEYS)[number];

// P976: Boolean flags that must never regress true→false within the same ratingPhase.
// Shared between isStateRegression and mergeInFlight — update both call sites when adding flags.
export const MONOTONIC_BOOLEAN_FLAGS = [
  'checkerSubmitted',
  'responderSubmitted',
  'explainBackDone',
  'celebrationAcknowledgedByCreator',
  'celebrationAcknowledgedByJoiner',
] as const;

// Phase order used by isStateRegression — mirrors isPhaseRegression in clarity-live-page.tsx.
const PHASE_ORDER: Record<string, number> = {
  idle: 0, waiting: 1, rating: 2, revealed: 3, 'explain-back': 4, results: 5,
};

/**
 * P976: Shared regression guard for all Realtime/poll merge call sites.
 *
 * Returns true when applying `incoming` over `local` would be a regression:
 *   1. Phase regression: incoming.ratingPhase has a lower rank than local.ratingPhase
 *      (exception: 'idle' is always allowed — it's a deliberate round reset).
 *   2. Same-phase boolean-flag regression: at the same ratingPhase, any monotonic flag
 *      transitions true→false (stale echo cached before the partner submitted).
 */
export function isStateRegression(local: LiveSessionState, incoming: LiveSessionState): boolean {
  const localRank = PHASE_ORDER[local.ratingPhase] ?? -1;
  const incomingRank = PHASE_ORDER[incoming.ratingPhase] ?? -1;
  const isRoundReset = incoming.ratingPhase === 'idle' && localRank > 0;
  if (incomingRank < localRank && !isRoundReset) return true;
  if (incoming.ratingPhase !== local.ratingPhase) return false;
  for (const flag of MONOTONIC_BOOLEAN_FLAGS) {
    if (local[flag] === true && incoming[flag] !== true) return true;
  }
  return false;
}

export interface MergeInFlightArgs {
  incoming: Partial<LiveSessionState>;
  prev: LiveSessionState;
  confirmedRef: LiveSessionState;
  myKey: 'freeSliderCreator' | 'freeSliderJoiner';
  myPositionKey: 'livePositionsCreator' | 'livePositionsJoiner';
  isPhaseRegression: (local: string | undefined, incoming: string | undefined) => boolean;
}

export interface MergeInFlightResult {
  nextState: LiveSessionState;
  nextConfirmedRef: LiveSessionState;
}

// Extracts the max(prev, incoming) for each monotonic boolean flag — explicit guard
// that mirrors the not-in-flight isStateRegression check applied in the caller.
// The spread order { ...incoming, ...prev } already ensures local wins, but this
// makes the monotonic intent explicit and keeps mergeInFlight in sync with MONOTONIC_BOOLEAN_FLAGS.
function monoFlagOverrides(current: LiveSessionState): Partial<LiveSessionState> {
  const result: Partial<LiveSessionState> = {};
  for (const flag of MONOTONIC_BOOLEAN_FLAGS) {
    if (current[flag] === true) (result as Record<string, unknown>)[flag] = true;
  }
  return result;
}

// P609/P741: Restores partner-key preservation inside the in-flight merge window.
// Merge order: incoming fills missing keys; prev/confirmedRef overlay for optimistic writes;
// partnerUpdates re-overlays partner-owned keys; monoFlagOverrides guards monotonic boolean
// flags (P976); ratingPhase last for monotonic guard (P671).
export function mergeInFlight(args: MergeInFlightArgs): MergeInFlightResult {
  const { incoming, prev, confirmedRef, myKey, myPositionKey, isPhaseRegression } = args;

  const partnerUpdates: Partial<LiveSessionState> = {};
  for (const key of PARTNER_OWNED_KEYS) {
    if (key !== myKey && key !== myPositionKey && key in incoming && incoming[key] !== undefined) {
      (partnerUpdates as Record<string, unknown>)[key] = incoming[key];
    }
  }

  const phaseToUse = isPhaseRegression(prev.ratingPhase, incoming.ratingPhase)
    ? prev.ratingPhase                                    // incoming is behind local → keep local
    : (incoming.ratingPhase ?? prev.ratingPhase);        // server is ahead → advance

  const confirmedPhase = isPhaseRegression(confirmedRef.ratingPhase, incoming.ratingPhase)
    ? confirmedRef.ratingPhase                            // incoming is behind confirmed → keep confirmed
    : (incoming.ratingPhase ?? confirmedRef.ratingPhase);

  return {
    nextState: { ...incoming, ...prev, ...partnerUpdates, ...monoFlagOverrides(prev), ratingPhase: phaseToUse } as LiveSessionState,
    nextConfirmedRef: { ...incoming, ...confirmedRef, ...partnerUpdates, ...monoFlagOverrides(confirmedRef), ratingPhase: confirmedPhase } as LiveSessionState,
  };
}
