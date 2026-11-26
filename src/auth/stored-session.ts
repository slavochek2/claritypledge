/**
 * @file stored-session.ts
 * @description P1297: what AuthProvider needs to tell "nobody is signed in" apart from
 * "a stored session we could not confirm yet".
 *
 * On a cold load auth-js returns a stored session that is not near expiry without a network call
 * (near expiry it refreshes first), then the provider fetches the profile. A failed fetch, or a
 * refresh that fails on the network, used to settle the provider on the exact state every auth
 * gate redirects on. These helpers
 * let it see the stored credential, recognise a token the server refused, and leave a one-shot
 * notice for the login page when a stored session really is gone.
 */

/**
 * The key auth-js stores this app's session under. supabase-js derives it from the project URL
 * (`sb-<first hostname label>-auth-token`, SupabaseClient constructor); supabase.ts passes this
 * same value explicitly so the two cannot drift. Matching the exact key matters: a device that
 * has used two backends (the two TEST servers, or TEST and prod on localhost) holds a token for
 * each, and only one of them belongs to the client in use.
 */
export function authStorageKey(url: string | undefined = import.meta.env.VITE_SUPABASE_URL): string | null {
  if (!url) return null;
  try {
    return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  } catch {
    return null;
  }
}

/**
 * The raw stored auth token under any `*-auth-token` key, or null — P1240's measurement, unchanged
 * from before P1297 (its tests pin the any-key read; on a device that has used two backends it can
 * see the other one's token). P1297's own check is hasStoredAuthToken, which uses this client's
 * exact key. Index API, not Object.keys(localStorage): Storage exposes entries as own enumerable
 * properties in browsers but not in every implementation (under the test environment Object.keys
 * returns the method names). Throws when storage itself throws, so callers that care (P1240) can
 * tell "unreadable" from "absent".
 */
export function readStoredAuthTokenOrThrow(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.endsWith('-auth-token')) return localStorage.getItem(k);
  }
  return null;
}

/** Whether THIS client's auth token is in storage. Storage that throws counts as absent. */
export function hasStoredAuthToken(): boolean {
  const key = authStorageKey();
  try {
    return key ? !!localStorage.getItem(key) : !!readStoredAuthTokenOrThrow();
  } catch {
    return false;
  }
}

/**
 * Whether a token was stored when the app booted. Read once, at module load: supabase.ts imports
 * this module before it calls createClient, so the read happens before auth-js's boot recovery
 * can remove a session whose refresh the server refuses. A token present at boot and gone once
 * auth settles, with no sign-out by the person, is an expired session — not someone who never
 * signed in — and the login page says so.
 */
export const authTokenStoredAtBoot: boolean = typeof localStorage !== 'undefined' && hasStoredAuthToken();

/**
 * The server refused the access token itself (as opposed to being unreachable). PostgREST
 * answers 401 with PGRST301 (bad JWT) or PGRST303 (claims, e.g. expired by the server's clock).
 * Other 401s (no code, or 42501, an RLS denial for the anon role) are not a token problem.
 */
export function isTokenRejected(err: { status?: number; code?: string } | null | undefined): boolean {
  // Only PostgREST's own JWT codes. A bare 401 (a gateway refusing the API key, say) is a server
  // fault, and treating it as a refused token would sign people out for it.
  return !!err && (err.code === 'PGRST301' || err.code === 'PGRST303');
}

/**
 * A failure that can clear by itself: no HTTP answer at all (the network), a timeout, rate limiting,
 * or a server-side error. Any other HTTP answer — 400, 403 (not granted), 404 (function missing), a
 * 401 that is not a token refusal — comes back the same on every attempt.
 */
export function isTransientFailure(err: { status?: number; thrown?: boolean }): boolean {
  if (err.thrown) return false; // our own code threw: it will throw again
  const s = err.status;
  return !s || s === 408 || s === 429 || s >= 500;
}

/**
 * The auth server definitely refused the session: 401/403/404 (bad_jwt, session_not_found,
 * user_not_found), or auth-js holds no session to send. Anything else — unreachable, 429, 5xx — is
 * "cannot tell", and must not sign anyone out.
 */
export function isDefiniteAuthRefusal(err: { name?: string; status?: number } | null | undefined): boolean {
  if (!err) return false;
  if (err.name === 'AuthSessionMissingError') return true;
  return err.status === 401 || err.status === 403 || err.status === 404;
}

const SESSION_EXPIRED_NOTICE_KEY = 'p1297-session-expired';

/** [FOUNDER DECISION] copy — placeholder until approved. */
export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again.';

/**
 * Survives the full-page navigation to /login (a toast would not). Not written while the person is
 * already on /login: the page has mounted and will not read it, and a notice left behind would show
 * on a later, unrelated visit.
 */
export function setSessionExpiredNotice(): void {
  try {
    if (typeof location !== 'undefined' && location.pathname.startsWith('/login')) return;
    sessionStorage.setItem(SESSION_EXPIRED_NOTICE_KEY, '1');
  } catch {
    // storage blocked: the person still lands on login, just without the explanation
  }
}

/** Returns the message to show once, or null. */
export function takeSessionExpiredNotice(): string | null {
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_NOTICE_KEY) === null) return null;
    sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
    return SESSION_EXPIRED_MESSAGE;
  } catch {
    return null;
  }
}

/** A deliberate sign-out must not leave an "expired" notice behind. */
export function clearSessionExpiredNotice(): void {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_NOTICE_KEY);
  } catch {
    // nothing to clear
  }
}

/**
 * A sign-out the person chose reaches every other tab as a plain SIGNED_OUT (auth-js broadcasts
 * it). Those tabs cannot see the signing-out tab's own flag, so the choice is recorded in shared
 * storage for a minute: a session that ends right after it is not an "expiry".
 */
const DELIBERATE_SIGN_OUT_KEY = 'p1297-deliberate-sign-out-at';
const DELIBERATE_SIGN_OUT_WINDOW_MS = 60_000;

export function markDeliberateSignOut(): void {
  try {
    localStorage.setItem(DELIBERATE_SIGN_OUT_KEY, String(Date.now()));
  } catch {
    // storage blocked: another tab may say "expired" for this sign-out — harmless
  }
}

/** A new sign-in ends the window: a session that is lost after it is not the old sign-out. */
export function clearDeliberateSignOut(): void {
  try {
    localStorage.removeItem(DELIBERATE_SIGN_OUT_KEY);
  } catch {
    // nothing to clear
  }
}

export function recentDeliberateSignOut(): boolean {
  try {
    const at = Number(localStorage.getItem(DELIBERATE_SIGN_OUT_KEY));
    return at > 0 && Date.now() - at < DELIBERATE_SIGN_OUT_WINDOW_MS;
  } catch {
    return false;
  }
}

/**
 * Retries of an unconfirmed restore after the first round double from 1 s to a 60 s cap for this
 * many rounds (1+2+4+8+16+32 s, then 6 x 60 s = 423 s, about 7 minutes, before jitter), then slow to one every
 * SLOW_RETRY_MS while the tab is visible. Metered-services rule 4: bounded, with backoff — at most
 * 15 requests an hour after the first 6 to 7 minutes (at the shortest jitter, 240 s apart). The slow timer is needed because a server-side
 * outage ending fires no browser event (rule 2's written reason), and without it a visible tab
 * would wait until the person reloaded.
 */
export const FAST_RETRY_ROUNDS = 12;
export const SLOW_RETRY_MS = 5 * 60_000;

/** Wait before retry `round` (0-based) of an unconfirmed restore. Each retry is one request. */
export function unconfirmedRetryDelayMs(round: number): number {
  if (round >= FAST_RETRY_ROUNDS) return SLOW_RETRY_MS;
  return Math.min(60_000, 1_000 * 2 ** round);
}

/**
 * Spread retries by +/-20 %, so tabs that lost the server in the same outage do not all come back
 * on the same second (metered-services rule 4: jitter).
 */
export function withJitter(ms: number, random: () => number = Math.random): number {
  return Math.round(ms * (0.8 + 0.4 * random()));
}

/**
 * Resolves only while the tab is visible (metered-services rule 3: a hidden tab makes no
 * requests): after `ms`, or earlier when the browser comes back online or the tab is shown — the
 * moments a retry is most likely to work. Hiding the tab cancels the timer; showing it again ends
 * the wait at once. Rejects with AbortError on abort.
 */
export function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup: Array<() => void> = [];
    const settle = (ok: boolean) => {
      clearTimeout(timer);
      cleanup.forEach((off) => off());
      if (ok) resolve();
      else reject(new DOMException('aborted', 'AbortError'));
    };
    const visible = () => document.visibilityState === 'visible';
    const onOnline = () => {
      if (visible()) settle(true); // hidden: showing the tab will end the wait
    };
    const onVisibility = () => {
      if (visible()) settle(true);
      else clearTimeout(timer);
    };
    const onAbort = () => settle(false);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    signal.addEventListener('abort', onAbort);
    cleanup.push(
      () => window.removeEventListener('online', onOnline),
      () => document.removeEventListener('visibilitychange', onVisibility),
      () => signal.removeEventListener('abort', onAbort),
    );
    if (visible()) timer = setTimeout(() => settle(true), ms);
  });
}

/**
 * Resolves at once while the tab is visible; in a hidden tab, when it is shown (metered-services
 * rule 3: a hidden tab makes no requests). Rejects with AbortError on abort.
 */
export function whenVisible(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
  if (document.visibilityState === 'visible') return Promise.resolve();
  return waitForRetry(0, signal);
}
