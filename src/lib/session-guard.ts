/**
 * @file session-guard.ts
 * @description P1441: never send a write as somebody other than the person the app shows.
 *
 * WHY. supabase-js attaches the session it reads from storage at request time, falling back to
 * the anon key when it finds none. The app's auth state (AuthContext) is a separate copy, fed by
 * auth events. Prod (Sentry JAVASCRIPT-REACT-3Q) caught the two disagreeing: ~1.6 s after a new
 * signup confirmed by email, every request went out anonymous (401 / 42501) while the page still
 * showed the person signed in — the auto-RSVP, then each "Reserve" tap, failed as "event full".
 * What removed the client's session was not reproduced; this guard does not depend on knowing.
 *
 * AuthContext reports every session it adopts here (`noteAppSession`). Before an identity-bound
 * write, `ensureClientSessionFor(profileId)` checks that the client holds that same user. If it
 * holds nobody, it tries ONE re-sync — handing the client the app's own copy of the session — and
 * reports `mismatch` if that does not restore it, or if the client holds a different user.
 * Callers then ask the person to sign in again instead of sending an anonymous insert.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** Thrown by an identity-bound write when the client cannot act as the expected user. */
export class SessionMismatchError extends Error {
  constructor(public readonly profileId: string) {
    super('Session does not match the signed-in user');
    this.name = 'SessionMismatchError';
  }
}

export function isSessionMismatch(err: unknown): err is SessionMismatchError {
  return err instanceof SessionMismatchError;
}

let appSession: Session | null = null;

/** A re-sync needs the app's access token to stay valid at least this long. */
const RESYNC_MIN_VALIDITY_MS = 60_000;

/** AuthContext calls this with every session it adopts (null on sign-out). */
export function noteAppSession(session: Session | null): void {
  appSession = session;
}

async function clientUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves 'ok' when the client will send requests as `profileId` (possibly after a re-sync),
 * 'mismatch' otherwise. Never throws.
 */
export async function ensureClientSessionFor(profileId: string): Promise<'ok' | 'mismatch'> {
  const current = await clientUserId();
  if (current === profileId) return 'ok';
  // The client holding SOMEONE ELSE is a real sign-in (another tab, another account) — never
  // overwrite it from this tab's copy. Only a client holding nobody is re-synced.
  if (current !== null) return 'mismatch';

  const snapshot = appSession;
  if (snapshot?.user?.id !== profileId || !snapshot.access_token || !snapshot.refresh_token) {
    return 'mismatch';
  }
  // Only a still-valid access token is handed back. An expired one would make setSession spend
  // the copy's refresh token, which another tab may already have rotated — replaying it can get
  // the whole session revoked. Asking the person to sign in again costs less.
  if (!snapshot.expires_at || snapshot.expires_at * 1000 - Date.now() < RESYNC_MIN_VALIDITY_MS) {
    return 'mismatch';
  }
  // Re-read right before writing: another tab may have signed someone in since the first read.
  // This narrows that window; it cannot close it (auth-js exposes no lock to hold across both).
  if ((await clientUserId()) !== null) return 'mismatch';
  try {
    const { error } = await supabase.auth.setSession({
      access_token: snapshot.access_token,
      refresh_token: snapshot.refresh_token,
    });
    if (error) return 'mismatch';
  } catch {
    return 'mismatch';
  }
  return (await clientUserId()) === profileId ? 'ok' : 'mismatch';
}

/**
 * The server's own verdict that a write went out anonymous: PostgREST answers an RLS denial with
 * 401 for the anon role (403 for a signed-in one). The pre-write check can pass and the session
 * still vanish before the request is sent, so callers also map this to SessionMismatchError.
 */
export function isAnonymousRlsDenial(error: { code?: string } | null, status: number): boolean {
  return !!error && error.code === '42501' && status === 401;
}

/** Whether the client currently holds ANY session (used to choose a safe recovery). */
export async function clientHasSession(): Promise<boolean> {
  return (await clientUserId()) !== null;
}

/** Where to send someone whose session was lost mid-RSVP, keeping the RSVP intent. */
export function signInAgainPath(eventSlug: string): string {
  const params = new URLSearchParams({ redirect: `/events/${eventSlug}`, action: 'rsvp' });
  return `/login?${params.toString()}`;
}

/** The one message shown when that happens. */
export const SIGN_IN_AGAIN_MESSAGE = 'Please sign in again to reserve your seat.';
