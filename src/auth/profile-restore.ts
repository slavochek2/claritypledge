/**
 * @file profile-restore.ts
 * @description P1297: restoring the signed-in person's profile on a load. Moved out of
 * AuthProvider's profile effect (which owns the setup and the commit) so each step can be read on
 * its own. A failed round is "cannot tell", never "nobody is signed in": the loop keeps going until
 * the server answers either way, with bounded, jittered retries that run only while the tab is
 * visible (metered-services rules 3 and 4).
 */
import type { MutableRefObject } from 'react';
import * as Sentry from '@sentry/react';
import { supabase } from '@/lib/supabase';
import { getProfileResult } from '@/app/data/api';
import { isRetryableAuthError } from '@/lib/session-guard';
import type { ApiResult } from '@/app/data/api-result';
import type { Profile } from '@/app/types';
import {
  isTokenRejected,
  isTransientFailure,
  isDefiniteAuthRefusal,
  setSessionExpiredNotice,
  recentDeliberateSignOut,
  storedAuthEntry,
  unconfirmedRetryDelayMs,
  withJitter,
  waitForRetry,
  whenVisible,
} from './stored-session';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * P1297: profile attempts in the first round, 1 s apart. After that the restore counts as
 * unconfirmed and retries one attempt at a time on the unconfirmedRetryDelayMs schedule.
 */
const FIRST_ROUND_ATTEMPTS = 3;
const FIRST_ROUND_DELAY_MS = 1000;

/** P1297: what a profile-restore step decided — finished, ask again now, or wait and retry. */
type RestoreStep = 'done' | 'retry' | 'wait';

/**
 * Up to `attempts` profile requests, FIRST_ROUND_DELAY_MS apart. Stops early on success, on
 * not_found, on a refused token and on any other answer that repeats (retrying cannot help), and when `signal`
 * aborts. Returns the last result so the caller can tell "unreachable" from "refused" from
 * "absent". The restore loop passes waitForRetry, so its waits run only while the tab is visible;
 * refreshProfile uses plain timed waits, so an awaited refresh in a hidden tab still ends. Only the first round logs:
 * a later round is one attempt in a long outage, and logging each would be a line a minute.
 */
export async function fetchProfileRound(
  id: string,
  attempts = FIRST_ROUND_ATTEMPTS,
  signal: AbortSignal = new AbortController().signal,
  wait: (ms: number, signal: AbortSignal) => Promise<void> = sleep,
): Promise<ApiResult<Profile>> {
  const log = attempts > 1;
  let result: ApiResult<Profile> = { success: false, error: 'server_error' };
  for (let attempt = 0; attempt < attempts; attempt++) {
    result = await getProfileResult(id);
    if (result.success || result.error === 'not_found' || isTokenRejected(result) || !isTransientFailure(result)) return result;
    if (attempt < attempts - 1) {
      if (log) console.warn(`Profile fetch attempt ${attempt + 1} failed, retrying in ${FIRST_ROUND_DELAY_MS}ms...`);
      try {
        await wait(FIRST_ROUND_DELAY_MS, signal);
      } catch {
        return result; // aborted: the caller sees it is stale and stops
      }
    }
  }
  if (log) console.warn(`Profile fetch failed after ${attempts} attempt(s)`);
  return result;
}

export interface RestoreDeps {
  userId: string;
  /** Aborts on unmount, user change or sign-out. */
  signal: AbortSignal;
  /** The session moved on (sign-out, another account) or the provider unmounted. Checked after every
   * await, before any commit or auth side effect (P1297/P1560). */
  stale: () => boolean;
  previousUserRef: MutableRefObject<Profile | null>;
  /** P1240: set around a sign-out this code chose, so its SIGNED_OUT is not counted as unexplained. */
  deliberateSignOutRef: MutableRefObject<boolean>;
  setUser: (user: Profile | null) => void;
  setIsLoading: (loading: boolean) => void;
  /** Commits a profile that belongs to this session's user. */
  acceptProfile: (profile: Profile) => void;
}

export async function restoreProfile(d: RestoreDeps): Promise<void> {
  const { userId, signal, stale, previousUserRef, deliberateSignOutRef, setUser, setIsLoading, acceptProfile } = d;
  // P1297: per-restore state for the steps below.
  const restore = {
    // One refresh per restore for a refused token, whatever its outcome — a refresh holds the
    // auth lock (every database request waits on it), so one that failed on the network is
    // left to auth-js's own retry, not repeated here.
    refreshTried: false,
    refreshedForRejection: false,
    // The data server refused a freshly issued token, and the auth server was asked whether it
    // still accepts it. Asked once; "accepted" means the fault is the data server's.
    authServerAsked: false,
    // A profile without the owner's email can be a read made as nobody (see onProfile). Once a
    // session was confirmed right before a read, its answer is taken as it is.
    selfReadConfirmed: false,
    // A local sign-out of an unusable session failed on the network: try it again on the next
    // refusal rather than wait for good.
    clearPending: false,
  };

  // Wait for a visible tab before a sign-out (it calls the logout endpoint). Another tab may have
  // signed in again or refreshed the session meanwhile; that session is not the one this restore
  // judged, so read again with it instead of clearing it.
  const sessionChangedWhileHidden = async (): Promise<boolean> => {
    const judged = storedAuthEntry();
    await whenVisible(signal); // a request: never from a hidden tab (metered-services rule 3)
    return !stale() && storedAuthEntry() !== judged;
  };

  // Settle with no profile, as before P1297 — keeping a profile already shown for this user.
  const settleWithoutProfile = (): RestoreStep => {
    if (previousUserRef.current?.id !== userId) setUser(null);
    setIsLoading(false);
    return 'done';
  };

  // The stored session is unusable. Clear it, so later loads do not look like a person who
  // never signed in. A local sign-out still calls the logout endpoint while a token is stored
  // (auth-js _signOut), so it waits for a visible tab. auth-js ignores a 401/403/404 from that
  // call and removes the session; on a network error, or a throw, it keeps it, and the next
  // refusal tries again.
  const clearUnusableSession = async (): Promise<RestoreStep> => {
    if (await sessionChangedWhileHidden()) return 'retry';
    if (stale()) return 'done';
    deliberateSignOutRef.current = true; // P1240: an explained loss, not session_lost_unexplained
    let error: unknown = null;
    try {
      ({ error } = await supabase.auth.signOut({ scope: 'local' }));
    } catch (thrown) {
      error = thrown; // e.g. the auth lock: same as a failed call, never a stuck flag
    }
    // auth-js removes the session and emits SIGNED_OUT before its last storage step, so a call
    // that throws or errors after that has still ended the session: judge by what is stored.
    if (error && storedAuthEntry() !== null) {
      deliberateSignOutRef.current = false; // session kept; a later loss is unexplained again
      restore.clearPending = true;
      return stale() ? 'done' : 'wait';
    }
    restore.clearPending = false;
    // Written only now that the session is gone, and never for a sign-out the person chose.
    if (!recentDeliberateSignOut()) setSessionExpiredNotice();
    if (stale()) return 'done';
    // auth-js emits SIGNED_OUT inside signOut(), which makes this stale. If it has not reached
    // the listener yet, settle here; the deliberate flag stays armed for that SIGNED_OUT.
    return settleWithoutProfile();
  };

  // getSession() found no stored session at all (storage cleared under a running tab): nobody
  // is signed in. A local sign-out emits SIGNED_OUT, so the listener's end-of-session path runs.
  const endMissingSession = async (): Promise<RestoreStep> => {
    if (await sessionChangedWhileHidden()) return 'retry';
    if (stale()) return 'done';
    await supabase.auth.signOut({ scope: 'local' });
    return stale() ? 'done' : settleWithoutProfile();
  };

  const onProfile = async (profile: Profile, confirmed: boolean): Promise<RestoreStep> => {
    if (profile.email || confirmed) {
      acceptProfile(profile);
      setIsLoading(false);
      return 'done';
    }
    // With no usable token (a refresh that failed on the network) supabase-js sends the anon
    // key, and the profile function answers that read too — without the owner's email, which
    // only the owner is given. That is not this person's own read. Confirm a session exists,
    // then read once more and take the answer as it is (an owner row can lack an email).
    // getSession() refreshes a token near expiry, so it waits for a visible tab too.
    await whenVisible(signal);
    if (stale()) return 'done';
    const { data: current, error } = await supabase.auth.getSession();
    if (stale()) return 'done';
    if (current.session) {
      restore.selfReadConfirmed = true;
      return 'retry';
    }
    if (error) return 'wait'; // read as nobody, and auth-js could not tell: still unconfirmed
    return endMissingSession();
  };

  // First refusal: a refresh that works hands the next attempt a new token. A refresh the
  // server refuses makes auth-js remove the stored session and emit SIGNED_OUT before
  // refreshSession() returns, which has already made this restore stale. A refresh that fails
  // on the network leaves the question open.
  const refreshOnce = async (): Promise<RestoreStep> => {
    await whenVisible(signal); // a request: never from a hidden tab (metered-services rule 3)
    if (stale()) return 'done';
    const { error } = await supabase.auth.refreshSession();
    restore.refreshTried = true; // after the call: one that throws is tried again next round
    if (!error && !stale()) {
      restore.refreshedForRejection = true;
      return 'retry';
    }
    // auth-js's own test: it drops the stored session on any refresh error that is not retryable
    // (a refused refresh token is a 400), then emits SIGNED_OUT.
    const refused = !!error && !isRetryableAuthError(error);
    if (stale()) return 'done'; // auth-js removed the session; the listener wrote the notice
    // Refused, and no SIGNED_OUT came (e.g. the stored session was already missing): clear it
    // ourselves rather than leave a loader up for good.
    return refused ? clearUnusableSession() : 'wait';
  };

  // Refused again with a freshly issued token. Either the session is unusable, or the data
  // server is misconfigured (its signing key out of step with the auth server's), which would
  // sign out everyone who loads the app. Ask the auth server, once.
  const askAuthServer = async (): Promise<RestoreStep> => {
    await whenVisible(signal); // a request: never from a hidden tab (metered-services rule 3)
    if (stale()) return 'done';
    const { data: checked, error } = await supabase.auth.getUser();
    if (stale()) return 'done';
    if (!error && checked.user) {
      // The fault is the data server's: keep the session; the restore stays unconfirmed. Only a
      // verdict ends the asking: a call that throws, or answers 429/5xx, is asked again.
      restore.authServerAsked = true;
      console.warn('Profile request refused a token the auth server accepts; keeping the session');
      return 'wait';
    }
    // Unreachable, rate limited (429) or failing: no verdict. Ask again next round.
    if (!isDefiniteAuthRefusal(error)) return 'wait';
    return clearUnusableSession();
  };

  const onTokenRejected = (): Promise<RestoreStep> | RestoreStep => {
    if (restore.clearPending) return clearUnusableSession();
    if (!restore.refreshTried) return refreshOnce();
    if (restore.refreshedForRejection && !restore.authServerAsked) return askAuthServer();
    return 'wait';
  };

  // An answer that will repeat on every attempt (the function missing or not granted, a
  // request the server rejects). Retrying cannot help, and an endless loader would hide it:
  // settle as before P1297 and report it once.
  const onRepeatingFailure = (result: { status?: number; code?: string }): RestoreStep => {
    Sentry.captureMessage('AuthProvider: profile request failed with a non-transient answer', {
      level: 'warning',
      tags: { source: 'auth.profile' },
      extra: { status: result.status, code: result.code },
    });
    return settleWithoutProfile();
  };

  const nextStep = (result: ApiResult<Profile>): Promise<RestoreStep> | RestoreStep => {
    const confirmed = restore.selfReadConfirmed;
    restore.selfReadConfirmed = false; // a confirmation covers only the read made right after it
    if (result.success && result.data) return onProfile(result.data, confirmed);
    // An empty success reads as no profile row, as it did before P1297; a missing row is not
    // a signed-up user (unchanged).
    if (result.success || result.error === 'not_found') return settleWithoutProfile();
    if (isTokenRejected(result)) return onTokenRejected();
    if (!isTransientFailure(result)) return onRepeatingFailure(result);
    // A network or server failure for a profile we already showed: keep it (transient errors
    // must not log the person out mid-session — existing behaviour).
    if (previousUserRef.current?.id === userId) {
      setIsLoading(false);
      return 'done';
    }
    return 'wait';
  };

  // P1297: keep going until the server answers either way. A failed round is "cannot tell",
  // never "nobody is signed in" — the old code settled user=null here, which every auth gate
  // reads as signed out, and never tried again. While this loop runs, isLoading stays true,
  // so gates wait on the page the person asked for. Offline readers do not wait on it
  // (they read `session`, or open their gate on `offline` — story-detail, letter-reading).
  // Every request waits for the tab to be visible (metered-services rule 3): the profile read
  // here, refreshSession and getUser in their own steps — including a follow-up to an answer
  // that landed while the tab was hidden.
  const runRound = async (round: number): Promise<RestoreStep> => {
    await whenVisible(signal);
    const result = await fetchProfileRound(userId, round === 0 ? FIRST_ROUND_ATTEMPTS : 1, signal, waitForRetry);
    if (stale()) return 'done';
    return nextStep(result);
  };
  for (let round = 0; ; round++) {
    let step: RestoreStep;
    try {
      step = await runRound(round);
    } catch {
      // Aborted (unmount, user change, sign-out), or an auth call threw (lock, storage): the
      // latter is "cannot tell", so wait and try again.
      if (signal.aborted || stale()) return;
      step = 'wait';
    }
    if (step === 'done') return;
    if (step === 'retry') continue;
    try {
      await waitForRetry(withJitter(unconfirmedRetryDelayMs(round)), signal);
    } catch {
      return; // effect cleaned up (unmount, user change, sign-out)
    }
  }
}
