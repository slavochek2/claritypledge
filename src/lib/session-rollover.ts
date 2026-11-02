import { analytics } from '@/lib/mixpanel';

/**
 * What a /live tab does when the room code it polls resolves to a different session id than
 * the one it holds.
 *
 * A takeover of an abandoned guest seat ends the old row and opens a new one under the same
 * room code. The creator's tab keeps polling by code, so a different id for the same code is
 * the signal. Pure so the decision is testable without rendering the page.
 */
export type RolloverDecision =
  /** Same row. */
  | 'same'
  /** The tab holds a seat in the new row (the creator, or a guest whose claim opened it): switch to it. */
  | 'follow'
  /** Guest tab: the seat now belongs to someone else's conversation. */
  | 'seat-lost'
  /** Not a rollover this tab should act on (leaving, ended, stale poll, no access). */
  | 'ignore';

/**
 * @param currentId     the session id the tab holds now
 * @param heldWhenAsked the session id the tab held when the poll asked (the answer is stale if it differs)
 * @param fresh         the row the code resolves to now; a null `createdAt` marks the pre-join
 *                      view a non-participant receives (P1493)
 * @param polledCode    the code the poll asked for
 * @param currentCode   the code the tab holds now (a poll can outlive an exit)
 * @param isCreator     whether this tab is the creator's
 * @param leavingOrEnded the tab is leaving, or the session/partner has ended
 */
export function decideSessionIdChange(
  currentId: string | null,
  heldWhenAsked: string | null,
  fresh: { id: string; createdAt?: string | null },
  polledCode: string,
  currentCode: string | null,
  isCreator: boolean,
  leavingOrEnded: boolean,
): RolloverDecision {
  if (isSupersededPoll(heldWhenAsked, currentId)) return 'ignore';
  if (currentId === fresh.id) return 'same';
  if (leavingOrEnded) return 'ignore';
  // The tab has since moved to another room (exit, then a new session): this answer is stale.
  if (currentId == null || currentCode == null || currentCode !== polledCode) return 'ignore';
  if (fresh.createdAt != null) return 'follow';
  return isCreator ? 'ignore' : 'seat-lost';
}

/** Records that a tab followed or lost a rolled-over room; other decisions record nothing. Never throws. */
export function trackRollover(decision: RolloverDecision, fromId: string | null, toId: string, isCreator: boolean): void {
  if (decision !== 'follow' && decision !== 'seat-lost') return;
  const role = isCreator ? 'creator' : 'guest';
  try {
    analytics.track('live_session_rolled_over', { from_session_id: fromId, to_session_id: toId, role, outcome: decision === 'follow' ? 'followed' : 'seat_lost' });
  } catch { /* never let analytics break the app */ }
}

/**
 * A write that began on one session must not touch the conversation the tab has moved to since:
 * on completion it would merge into, and on failure revert, the new conversation's state.
 */
export function isStaleWrite(startedOnId: string, currentId: string | null): boolean {
  return currentId !== startedOnId;
}

/**
 * A poll answers for the session the tab held when it asked. If the tab holds another by the time
 * the answer arrives (it followed, exited or re-joined meanwhile), the answer is about a row the
 * tab has left and must not be acted on, least of all by following back to the finished one.
 */
export function isSupersededPoll(heldWhenAsked: string | null, heldNow: string | null): boolean {
  return heldWhenAsked !== heldNow;
}

/**
 * Whether a write that began on `startedOnId` may move the tab into the session its re-join opened:
 * only while the tab still holds the session the write began on and is not leaving or ended.
 */
export function mayFollowRolledOver(startedOnId: string, heldNow: string | null, leavingOrEnded: boolean): boolean {
  return !leavingOrEnded && !isStaleWrite(startedOnId, heldNow);
}
