/**
 * P1278 D — who a /live calibration row names.
 *
 * The round's checker is its speaker. Both participants are named by profile id, except when a guest
 * holds the joiner seat: a guest has no profile, so the row names only the signed-in creator and leaves
 * the guest's side null. Only the creator's client may write such a row — the database admits it from
 * nobody else (p1278_live_verification_admissible, arm 2) — and a guest's own client never writes,
 * because it has no signed-in user.
 */

export interface LiveVerificationSession {
  creatorName?: string | null;
  creatorProfileId?: string | null;
  joinerProfileId?: string | null;
  endedAt?: string | null;
}

export interface LiveVerificationParticipants {
  speakerId: string | null;
  listenerId: string | null;
}

/**
 * Returns the two participant ids to record, or null when this client must not record the round.
 * `writerId` is the signed-in user whose client would write.
 */
export function resolveVerificationParticipants(
  session: LiveVerificationSession,
  checkerName: string,
  writerId: string,
  /**
   * The room's own record of whether the checker is the creator (`live_state.checkerIsCreator`, written
   * when the round starts). Preferred over the name comparison below: nothing stops a guest typing the
   * creator's display name, and the database admits either orientation of a guest round, so a name-based
   * decision silently records the wrong person as the speaker (codex, 2026-09-12 — reproduced in a real
   * two-browser round before this was added). The name is the fallback for state that predates the flag.
   */
  checkerIsCreatorFlag?: boolean,
): LiveVerificationParticipants | null {
  const checkerIsCreator = checkerIsCreatorFlag ?? session.creatorName === checkerName;
  const speakerId = (checkerIsCreator ? session.creatorProfileId : session.joinerProfileId) ?? null;
  const listenerId = (checkerIsCreator ? session.joinerProfileId : session.creatorProfileId) ?? null;

  if (speakerId && listenerId) return { speakerId, listenerId };

  // The database also refuses a guest round in an ended room (a seat stamp outlives the session);
  // checked here too, so the client never sends a write it knows will be refused.
  const guestInJoinerSeat =
    !session.joinerProfileId && !!session.creatorProfileId && writerId === session.creatorProfileId
    && !session.endedAt;
  return guestInJoinerSeat ? { speakerId, listenerId } : null;
}
