/**
 * @file session-end.ts
 * @description What AuthProvider does when a session ends: the P1240 measurement of a loss the
 * person did not choose, and the per-person state every session end must clear (P1369, P1421,
 * P1545, P1515). Module-level: none of it reads provider state beyond what the caller passes.
 */
import { analytics } from '@/lib/mixpanel';
import { clearOfflineReadCache } from '@/lib/offline-read-cache';
import { clearLinkTokens, clearLinkTokensExceptThisLoad } from '@/lib/canvas-link-token';
import { clearArtifactAttachmentCache } from '@/app/pages/chat/artifact-attachment-cache';
import { clearAllNavVerifiedHints } from '@/lib/nav-verified-hint';
import { readStoredAuthTokenOrThrow } from './stored-session';

/**
 * P1240: a session vanished that the person did not end. Recorded so the cause can be told apart:
 * a token still on disk means the client dropped it; gone means storage was cleared underneath us
 * (eviction, WebView spawn, browser setting); threw means storage is unreadable.
 */
export function trackUnexplainedSessionLoss(authEvent: string): void {
  let storedToken: string | null = null;
  try {
    // Index API, not Object.keys(localStorage) — see readStoredAuthTokenOrThrow. That is the one
    // field this whole measurement turns on, so it must not depend on which Storage
    // implementation is underneath.
    storedToken = readStoredAuthTokenOrThrow();
  } catch {
    // Storage can throw outright (private mode, blocked site data) — that IS a candidate cause,
    // so record it rather than swallowing it.
    storedToken = '__storage_threw__';
  }
  const hasDocument = typeof document !== 'undefined';
  analytics.track('session_lost_unexplained', {
    auth_event: authEvent,
    stored_token_present: storedToken === '__storage_threw__' ? 'threw' : !!storedToken,
    visibility: hasDocument ? document.visibilityState : 'unknown',
    was_hidden: hasDocument ? document.hidden : null,
    online: typeof navigator !== 'undefined' ? navigator.onLine : null,
    path: typeof window !== 'undefined' ? window.location.pathname : null,
  });
}

/**
 * P1369: every way a session ENDS — our signOut, a sign-out in another tab, supabase-js dropping a
 * revoked session — clears the offline read cache. api.ts signOut already cleared it for the
 * deliberate path; this covers the rest.
 *
 * P1515 `keepThisLoadsLinkToken`: true only during auth initialization (boot recovery: an expired,
 * unrefreshable stored session is dropped at startup) for a tab that never held a session — the
 * token the head script has just taken from the address must survive; tokens left by EARLIER loads
 * of this tab are the previous person's and go. Any other session loss clears ALL of them.
 */
export function clearSessionScopedState(keepThisLoadsLinkToken: boolean): void {
  void clearOfflineReadCache();
  // P1421: the nav's "this user was verified here" marker.
  clearAllNavVerifiedHints();
  // P1545: the chat artifact cards' answers, judged for the person who just left.
  clearArtifactAttachmentCache();
  // P1515: the canvas link tokens held in this tab (expiry, a sign-out in another tab and
  // revocation never go through api.signOut, and must not leave them for the next person).
  if (keepThisLoadsLinkToken) clearLinkTokensExceptThisLoad();
  else clearLinkTokens();
}

/**
 * P1297: a session ended that the person did not end — the server refused a refresh, or storage
 * was cleared underneath us — while this tab held one or was waiting on a restore. A sign-out they
 * chose (here, or in another tab via the shared marker) is not that.
 */
export function isUnchosenSessionEnd(e: {
  event: string;
  hadSession: boolean;
  restorePending: boolean;
  deliberate: boolean;
  recentDeliberate: boolean;
}): boolean {
  return e.event === 'SIGNED_OUT' && (e.hadSession || e.restorePending) && !e.deliberate && !e.recentDeliberate;
}
