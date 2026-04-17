import type { LiveSessionState } from '@/app/types';

export const PARTNER_OWNED_KEYS = [
  'freeSliderCreator',
  'freeSliderJoiner',
  'livePositionsCreator',
  'livePositionsJoiner',
] as const;

export type PartnerOwnedKey = (typeof PARTNER_OWNED_KEYS)[number];

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

// P609/P741: Restores partner-key preservation inside the in-flight merge window.
// Merge order: incoming fills missing keys; prev/confirmedRef overlay for optimistic writes;
// partnerUpdates re-overlays partner-owned keys; ratingPhase last for monotonic guard (P671).
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
    nextState: { ...incoming, ...prev, ...partnerUpdates, ratingPhase: phaseToUse } as LiveSessionState,
    nextConfirmedRef: { ...incoming, ...confirmedRef, ...partnerUpdates, ratingPhase: confirmedPhase } as LiveSessionState,
  };
}
