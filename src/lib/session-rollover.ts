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
  /** Creator tab: switch to the new row. */
  | 'follow'
  /** Guest tab: the seat now belongs to someone else's conversation. */
  | 'seat-lost'
  /** Not a rollover this tab should act on (leaving, ended, stale poll, no access). */
  | 'ignore';

/**
 * @param currentId     the session id the tab holds
 * @param fresh         the row the code resolves to now; a null `createdAt` marks the pre-join
 *                      view a non-participant receives (P1493)
 * @param polledCode    the code the poll asked for
 * @param currentCode   the code the tab holds now (a poll can outlive an exit)
 * @param isCreator     whether this tab is the creator's
 * @param leavingOrEnded the tab is leaving, or the session/partner has ended
 */
export function decideSessionIdChange(
  currentId: string | null,
  fresh: { id: string; createdAt?: string | null },
  polledCode: string,
  currentCode: string | null,
  isCreator: boolean,
  leavingOrEnded: boolean,
): RolloverDecision {
  if (currentId === fresh.id) return 'same';
  if (leavingOrEnded) return 'ignore';
  // The tab has since moved to another room (exit, then a new session): this answer is stale.
  if (currentId == null || currentCode == null || currentCode !== polledCode) return 'ignore';
  if (!isCreator) return 'seat-lost';
  return fresh.createdAt != null ? 'follow' : 'ignore';
}

/** Records that a tab followed or lost a rolled-over room; other decisions record nothing. Never throws. */
export function trackRollover(decision: RolloverDecision, fromId: string | null, toId: string): void {
  if (decision !== 'follow' && decision !== 'seat-lost') return;
  const role = decision === 'follow' ? 'creator' : 'guest';
  try {
    analytics.track('live_session_rolled_over', { from_session_id: fromId, to_session_id: toId, role, outcome: decision === 'follow' ? 'followed' : 'seat_lost' });
  } catch { /* never let analytics break the app */ }
}
