/**
 * @file seat-secret.ts
 * @description P1269 — client-side custody of the per-seat capability.
 *
 * A guest's seat on a /live room is proved by a secret minted server-side at claim time
 * (`claim_joiner_seat`), NOT by their display name. The name is published to any anonymous
 * caller holding the room code, so it authorizes nothing; see the migration
 * 20260911090000_p1269_guest_seat_secret_and_presence.sql.
 *
 * TWO RULES, both learned from P1058's reverted attempt:
 *
 * 1. IT MUST SURVIVE A RELOAD. P1058 held the secret in React state that no restore path
 *    ever repopulated, so the guest lost their own seat on the first refresh — which is the
 *    single most common thing that happens in a live room. localStorage, keyed by session
 *    id, is the whole fix for that.
 *
 * 2. IT MUST NOT ENTER THE APP'S SESSION OBJECT. The secret is deliberately absent from
 *    `ClaritySession`. Everything that touches that object — React state, analytics events,
 *    Sentry breadcrumbs, the realtime payload, live_state sync — would otherwise carry a
 *    bearer credential around the app and off the device. It lives here and is read only by
 *    the two api.ts functions that send it back to Postgres.
 *
 * Storage failures are swallowed on purpose: Safari private mode and "block all cookies"
 * make localStorage throw on access, and a guest in that mode must still be able to JOIN a
 * room. They lose only the ability to reclaim their seat after a reload, which degrades to
 * the 15-minute abandonment timer.
 *
 * P1224: the secret now also authorizes the guest's WRITES to the session, not only the
 * reclaim. So it is mirrored in memory for the life of the tab — a guest whose storage throws
 * can still act in the room they just joined — and whatever this module returns is handed to
 * the request layer (room-capability.ts), which presents it to the database on writes.
 */

import { holdSeatSecret, dropSeatSecret } from '@/lib/room-capability';

const KEY_PREFIX = 'cp.seatSecret.';

/** In-tab mirror of storage, so a storage failure never costs the guest their current seat. */
const memory = new Map<string, string>();

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/**
 * The secret for this seat, or null if we never held one.
 *
 * The in-tab value wins over storage: it is what this tab was handed most recently, while storage
 * can hold an older secret that a failed write never replaced (quota, private mode).
 */
export function getSeatSecret(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  const inTab = memory.get(sessionId);
  if (inTab) return inTab;
  try {
    return window.localStorage.getItem(key(sessionId));
  } catch {
    return null;
  }
}

export function setSeatSecret(sessionId: string | null | undefined, secret: string | null | undefined): void {
  if (!sessionId || !secret) return;
  // A replaced secret is dead server-side; stop presenting it.
  const previous = getSeatSecret(sessionId);
  if (previous && previous !== secret) dropSeatSecret(previous);
  memory.set(sessionId, secret);
  holdSeatSecret(secret);
  // Remove first, so a write that then fails cannot leave the old secret behind to be read back
  // after a reload.
  try {
    window.localStorage.removeItem(key(sessionId));
  } catch {
    /* storage unavailable — nothing stored to go stale */
  }
  try {
    window.localStorage.setItem(key(sessionId), secret);
  } catch {
    /* private mode — the guest keeps the seat for this tab, just cannot reclaim after a reload */
  }
}

/**
 * Present this seat's stored secret on writes again — the reload path. A no-op when the tab
 * holds no secret for the session (a signed-in participant, or a seat we never claimed).
 */
export function restoreSeatSecret(sessionId: string | null | undefined): void {
  holdSeatSecret(getSeatSecret(sessionId));
}

/**
 * Forget this seat. Called when the guest deliberately leaves, so a shared or public browser
 * does not hand the next person a working capability for a room they never joined.
 */
export function clearSeatSecret(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  // The in-tab and stored values can differ (a failed storage write); retire both.
  dropSeatSecret(memory.get(sessionId));
  memory.delete(sessionId);
  try {
    dropSeatSecret(window.localStorage.getItem(key(sessionId)));
    window.localStorage.removeItem(key(sessionId));
  } catch {
    /* nothing to do — see the note above */
  }
}

/** Test-only. */
export function _resetSeatSecretMemoryForTesting(): void {
  memory.clear();
}
