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
 */

const KEY_PREFIX = 'cp.seatSecret.';

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

/** The secret for this seat, or null if we never held one (or storage is unavailable). */
export function getSeatSecret(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  try {
    return window.localStorage.getItem(key(sessionId));
  } catch {
    return null;
  }
}

export function setSeatSecret(sessionId: string | null | undefined, secret: string | null | undefined): void {
  if (!sessionId || !secret) return;
  try {
    window.localStorage.setItem(key(sessionId), secret);
  } catch {
    /* private mode — the guest can still join, just not reclaim after a reload */
  }
}

/**
 * Forget this seat. Called when the guest deliberately leaves, so a shared or public browser
 * does not hand the next person a working capability for a room they never joined.
 */
export function clearSeatSecret(sessionId: string | null | undefined): void {
  if (!sessionId) return;
  try {
    window.localStorage.removeItem(key(sessionId));
  } catch {
    /* nothing to do — see the note above */
  }
}
