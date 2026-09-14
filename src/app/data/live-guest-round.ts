/**
 * P1278 D — recording a guest round that the guest completed.
 *
 * A /live round's calibration row is written by the client that submits the round's SECOND rating
 * (clarity-live-page.tsx, the `bothSubmitted` branch of handleRatingSubmit). A guest's client has no
 * signed-in user, so when the guest rates last, nothing is written — measured in a real two-browser round
 * (e2e/p1278-real-browser-round.spec.ts, arm B): the round completed and zero rows landed. The database
 * admits a guest round only from the creator anyway (p1278_live_verification_admissible, arm 2).
 *
 * So the creator's client records such a round when it sees it arrive complete. This decides, from what
 * that client has observed, whether a round is waiting to be recorded.
 */

export interface ObservedLiveRound {
  checksCount: number;
  ratingPhase: string;
  checkerName?: string;
  checkerIsCreator?: boolean;
  checkerSubmitted: boolean;
  responderSubmitted: boolean;
  checkerRating?: number;
  responderRating?: number;
  selectedStoryId?: string | null;
}

export interface GuestRoundToRecord {
  storyId?: string;
  checkerName: string;
  /** The room's record of who asked — the row's speaker/listener sides are decided from this, never from names. */
  checkerIsCreator?: boolean;
  checkerRating: number;
  responderRating: number;
  /**
   * The round's count BEFORE it completed — the index the submit path keys its write on, so the two paths
   * share one dedup key and a round the creator's own submit already wrote is never written twice.
   */
  exchangeIndex: number;
}

export function guestRoundToRecord(input: {
  isCreator: boolean;
  joinerProfileId?: string | null;
  endedAt?: string | null;
  /** The round count this client had already seen in this room, or null before it has one. */
  previousChecksCount: number | null;
  state: ObservedLiveRound;
}): GuestRoundToRecord | null {
  const { isCreator, joinerProfileId, endedAt, previousChecksCount, state } = input;

  // Only the creator's client, only while a guest holds the joiner seat, only in an open room.
  if (!isCreator || joinerProfileId || endedAt) return null;

  // The round must complete WHILE this client watches. A first observation (a reload onto a room whose
  // round is already revealed) has no baseline and writes nothing, so a round is never recorded twice.
  if (previousChecksCount === null || state.checksCount <= previousChecksCount) return null;

  // Only the reveal of a rating round. The explain-back step also advances the count, later, with the
  // same two ratings still in state — recording it would count one round twice.
  if (state.ratingPhase !== 'revealed') return null;
  if (!state.checkerSubmitted || !state.responderSubmitted) return null;
  if (!state.checkerName || typeof state.checkerRating !== 'number' || typeof state.responderRating !== 'number') {
    return null;
  }

  return {
    storyId: state.selectedStoryId ?? undefined,
    checkerName: state.checkerName,
    checkerIsCreator: state.checkerIsCreator,
    checkerRating: state.checkerRating,
    responderRating: state.responderRating,
    exchangeIndex: state.checksCount - 1,
  };
}
