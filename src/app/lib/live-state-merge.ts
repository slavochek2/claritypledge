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

// Rank order for the rating flow. Single definition — `clarity-live-page.tsx`
// re-exports `isPhaseRegression` from here rather than keeping its own copy,
// because two copies of this table are what let P1080 survive: a fix applied to
// one path would leave the other still rejecting the same edge.
const PHASE_ORDER: Record<string, number> = {
  idle: 0, waiting: 1, rating: 2, revealed: 3, 'explain-back': 4, results: 5,
};

/**
 * Backward phase edges that are LEGITIMATE, not stale echoes.
 *
 * The rank table above models the round as a linear pass, but the guided round is
 * a CYCLE. Two edges close it, and both must be allowed or the receiving client
 * silently drops the update and both participants strand:
 *
 *   results → idle          round complete, speaker starts a new check
 *   results → explain-back  P1080: the clarify loop — listener paraphrases again
 *                           after the speaker re-rated below 10
 *
 * P1080: the second edge was missing. Round 1 is a single monotonic pass so it
 * worked; from round 2 the listener's `explain-back` write arrived at a client
 * already on `results`, was ranked 4 < 5, and was rejected as a stale echo. The
 * drift poller applies the same guard, so nothing healed it — both sides then sat
 * on waiting indicators with only "Speak freely" available.
 *
 * Why allowing these is the safe direction: a wrongly-ACCEPTED backward edge is
 * self-healing — the next legitimate write (or the 1s drift poll) carries the
 * session forward again, since forward transitions are never blocked. A wrongly-
 * REJECTED one is terminal: the guard that dropped it also blocks every
 * subsequent attempt to deliver the same state. The costs are not symmetric.
 */
const CYCLE_EDGES: ReadonlyArray<readonly [from: string, to: string]> = [
  ['results', 'explain-back'],
];

/**
 * P671: Monotonic phase ordering for the rating flow.
 *
 * Returns true when applying `incomingPhase` over `localPhase` would be a
 * regression — i.e. a stale Realtime echo arriving after a later write's echo.
 * Round-closing edges (see CYCLE_EDGES and the `idle` reset) are not regressions.
 */
export function isPhaseRegression(
  localPhase: string | undefined,
  incomingPhase: string | undefined,
): boolean {
  const localRank = PHASE_ORDER[localPhase ?? ''] ?? -1;
  const incomingRank = PHASE_ORDER[incomingPhase ?? ''] ?? -1;
  if (incomingRank >= localRank) return false;
  // Deliberate round reset.
  if (incomingPhase === 'idle' && localRank > 0) return false;
  // P1080: round-closing loop edges.
  if (CYCLE_EDGES.some(([from, to]) => from === localPhase && to === incomingPhase)) return false;
  return true;
}

/**
 * P976: Shared regression guard for all Realtime/poll merge call sites.
 *
 * Returns true when applying `incoming` over `local` would be a regression:
 *   1. Phase regression: see isPhaseRegression above.
 *   2. Same-phase boolean-flag regression: at the same ratingPhase, any monotonic flag
 *      transitions true→false (stale echo cached before the partner submitted).
 */
export function isStateRegression(local: LiveSessionState, incoming: LiveSessionState): boolean {
  if (isPhaseRegression(local.ratingPhase, incoming.ratingPhase)) return true;
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
