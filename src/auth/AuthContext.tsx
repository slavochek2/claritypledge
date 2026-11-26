/**
 * @file AuthContext.tsx
 * @module auth
 *
 * Single source of truth for authentication state.
 *
 * Pattern follows Supabase best practices:
 * - useEffect #1: Manages session (getSession + onAuthStateChange)
 * - useEffect #2: Fetches profile ONLY when session changes
 *
 * This separation prevents race conditions from multiple onAuthStateChange events.
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { signOut as apiSignOut, patchClaritySessionLiveState, clearSessionJoiner } from '@/app/data/api';
import { analytics } from '@/lib/mixpanel';
import { clearActiveSessionFromStorage } from '@/app/contexts/live-session-context';
import type { Profile } from '@/app/types';
import { noteAppSession, isRetryableAuthError } from '@/lib/session-guard';
import {
  hasStoredAuthToken,
  authTokenStoredAtBoot,
  setSessionExpiredNotice,
  clearSessionExpiredNotice,
  markDeliberateSignOut,
  clearDeliberateSignOut,
  recentDeliberateSignOut,
} from './stored-session';
import { trackUnexplainedSessionLoss, clearSessionScopedState, isUnchosenSessionEnd } from './session-end';
import { fetchProfileRound, restoreProfile } from './profile-restore';

interface AuthState {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  /** True once initial session check completes (before profile fetch) */
  sessionChecked: boolean;
  /** P520: pass `{ scope: 'local' }` after account erasure — the server session no longer exists */
  signOut: (options?: { scope?: 'global' | 'local' }) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** P1515: how long after getSession() settles we wait for INITIAL_SESSION before treating auth as initialized anyway. */
export const INITIAL_SESSION_FALLBACK_MS = 8000;

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track previous user state to preserve data on transient network errors. P1297/P1560: only
  // ever used for the SAME user id — another account's profile is never a fallback.
  const previousUserRef = useRef<Profile | null>(null);
  // P1297: the user id the session currently belongs to. Every profile commit checks it, so a
  // result that resolves after a sign-out or an account switch is dropped, never shown.
  const currentUserIdRef = useRef<string | undefined>(undefined);

  // Track if initial session check is complete
  const [sessionChecked, setSessionChecked] = useState(false);

  // P1297: bumped by every auth event that carries a real change. initSession() reads the session
  // with getSession(), which can resolve AFTER a newer event; a stale result must not overwrite it.
  const authEventGenRef = useRef(0);
  // P1297: the last session an auth event delivered (INITIAL_SESSION included).
  const eventSessionRef = useRef<Session | null>(null);
  // P1297 (B): getSession() could not tell — the stored token needed a refresh and the refresh
  // failed on the network. auth-js keeps the session and keeps trying on its own (a 30 s ticker
  // while visible, and on every hidden -> visible change), and reports the verdict as an auth
  // event: TOKEN_REFRESHED on success, SIGNED_OUT when the server refuses the refresh. Until that
  // event, the restore is pending and sessionChecked stays false, so no gate redirects. The
  // provider does NOT poll getSession() here: each call holds the auth lock for a full refresh
  // cycle, and every database request waits behind that lock.
  const restorePendingRef = useRef(false);

  // P1240: distinguish a session the person ENDED from one that vanished on them.
  // Set only by the signOut() below; every other transition to a null session is
  // unexplained by construction. Three hypotheses for the founder's recurring
  // "my phone forgot me" report were each falsified cheaply (in-app WebView spawn,
  // PKCE cross-browser, refresh-token reuse revocation — the last by direct test
  // against the test project, 2026-09-04). Nothing in the product recorded the event,
  // so there was no way to tell which remaining cause it is, or whether it is real
  // at all. This is the measurement, not a fix.
  const deliberateSignOutRef = useRef(false);
  const hadSessionRef = useRef(false);
  // P1515: true once this subscriber has had its INITIAL_SESSION. auth-js recovers the stored session first (an expired one
  // that cannot be refreshed is removed and reported as SIGNED_OUT), and only then emits INITIAL_SESSION to each subscriber
  // (GoTrueClient _initialize -> _recoverAndRefresh -> _removeSession -> SIGNED_OUT, then onAuthStateChange awaits
  // initializePromise and calls _emitInitialSession). A session loss before it is boot recovery; after it, a real one.
  // getSession() settling is NOT that signal: it also waits on initializePromise and can win the race against the
  // INITIAL_SESSION emit, so it only arms a fallback in case INITIAL_SESSION never comes.
  const authInitializedRef = useRef(false);

  // Effect 1: Session management only
  // This follows Supabase's recommended pattern - onAuthStateChange just updates session
  useEffect(() => {
    let initFallbackTimer: ReturnType<typeof setTimeout> | undefined;
    const initAbort = new AbortController();
    // The boot read failed: auth is checked. P1297: a session an auth event delivered meanwhile is
    // the profile restore's to settle, so loading is left to it.
    const settleBootWithoutSession = () => {
      setSessionChecked(true);
      if (!eventSessionRef.current) setIsLoading(false);
    };
    // Get initial session
    const initSession = async () => {
      const genAtStart = authEventGenRef.current;
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (initAbort.signal.aborted) return;

        // P1297: a token was stored at boot and auth-js has since dropped it (its refresh was
        // refused, possibly inside this very getSession(), which then returns an error). That is an
        // expired session, not a person who never signed in — say so on /login.
        if (!initialSession && authTokenStoredAtBoot && !hasStoredAuthToken() && !recentDeliberateSignOut()) {
          setSessionExpiredNotice();
        }

        if (error && isRetryableAuthError(error) && hasStoredAuthToken()) {
          // An auth event may already have delivered the session (auth-js's own INITIAL_SESSION
          // read can succeed where this one failed). Then the restore is done; otherwise wait.
          if (eventSessionRef.current) {
            setSessionChecked(true);
          } else {
            restorePendingRef.current = true;
          }
          return;
        }

        if (error) {
          settleBootWithoutSession();
          return;
        }

        // P1297: an auth event delivered while getSession() was pending is newer than this read;
        // it has already set the session, so only the "checked" flag is ours to set.
        if (authEventGenRef.current === genAtStart) {
          currentUserIdRef.current = initialSession?.user?.id;
          setSession(initialSession);
          noteAppSession(initialSession); // P1441: the guard's re-sync source
          hadSessionRef.current = !!initialSession;  // P1240: seed, so the first
          // transition after mount is classified against a real prior state
        }
        setSessionChecked(true);

        // Only set loading false here if NO session (profile effect won't run)
        if (!initialSession && authEventGenRef.current === genAtStart) {
          setIsLoading(false);
        }
      } catch {
        if (initAbort.signal.aborted) return;
        settleBootWithoutSession();
      } finally {
        if (!authInitializedRef.current && !initAbort.signal.aborted) {
          initFallbackTimer = setTimeout(() => { authInitializedRef.current = true; }, INITIAL_SESSION_FALLBACK_MS);
        }
      }
    };

    initSession();

    // The profile on screen belongs to the session's user, or to nobody.
    const dropProfileNotOwnedBy = (newSession: Session | null) => {
      // Clear user immediately on sign out
      if (!newSession) {
        setUser(null);
      } else if (previousUserRef.current && previousUserRef.current.id !== newSession.user?.id) {
        // P1297/P1560: another account. Drop the previous profile in the SAME render as the new
        // session, so no frame shows account A under B's session — and mark loading, so that
        // frame is not read as "nobody signed in" either. Effect 2 then loads B's profile.
        previousUserRef.current = null;
        setUser(null);
        setIsLoading(true);
      }
    };

    // Listen for auth changes - ONLY update session, don't fetch profile here
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        const hadSessionBefore = hadSessionRef.current;
        // P1297: checked first — the P1240 block below resets deliberateSignOutRef. Tell them on
        // /login instead of showing a bare form.
        if (isUnchosenSessionEnd({
          event,
          hadSession: hadSessionBefore,
          restorePending: restorePendingRef.current,
          deliberate: deliberateSignOutRef.current,
          recentDeliberate: recentDeliberateSignOut(),
        })) {
          setSessionExpiredNotice();
        }
        // P1240: fire BEFORE state updates — this is the only moment where the
        // previous session and the new absence are both observable.
        if (hadSessionBefore && !newSession) {
          if (deliberateSignOutRef.current) deliberateSignOutRef.current = false;
          else trackUnexplainedSessionLoss(event);
        }
        // P1369/P1515: every session end clears per-person state. Not on INITIAL_SESSION with no
        // session: that is an anonymous boot, and its cached reads are the anonymous reader's.
        if (event === 'SIGNED_OUT' || (hadSessionBefore && !newSession)) {
          clearSessionScopedState(!authInitializedRef.current && !hadSessionBefore);
        }
        hadSessionRef.current = !!newSession;
        if (event === 'INITIAL_SESSION') authInitializedRef.current = true;
        // P1297: INITIAL_SESSION replays what getSession() reads; anything else is a newer state.
        else authEventGenRef.current += 1;
        eventSessionRef.current = newSession;
        // P1297/P1560: set here, not only in Effect 2. Effect 2 runs after the render this event
        // causes; a profile request for the previous account that resolves in between must already
        // read as stale.
        currentUserIdRef.current = newSession?.user?.id;
        // P1297: a new sign-in ends the deliberate-sign-out window — a later loss is not that sign-out.
        // Not on the SIGNED_IN auth-js replays (to every tab) whenever a tab holding a session is shown.
        if (event === 'SIGNED_IN' && newSession && !hadSessionBefore) clearDeliberateSignOut();
        // P1297 (B): auth-js has given its verdict on a restore getSession() could not settle — a
        // session (any event), or a definite end (any event but the INITIAL_SESSION replay, which
        // in this state is the same failed read reported again).
        if (restorePendingRef.current && (newSession || event !== 'INITIAL_SESSION')) {
          restorePendingRef.current = false;
          setSessionChecked(true);
        }

        setSession(newSession);
        noteAppSession(newSession);
        dropProfileNotOwnedBy(newSession);
      }
    );

    return () => {
      clearTimeout(initFallbackTimer);
      initAbort.abort();
      subscription.unsubscribe();
    };
  }, []);

  // Effect 2: Profile fetching - reacts to USER ID changes only
  // Use session.user.id as dependency (primitive string), not session object
  // This prevents re-fetching when Supabase fires multiple SIGNED_IN events
  const userId = session?.user?.id;

  // Shared profile fetch logic with retry for transient errors.
  // Uses getProfileResult to distinguish "not found" (no retry) from "server error" (retry).
  const fetchProfileForUser = useCallback(async (id: string): Promise<Profile | null> => {
    const result = await fetchProfileRound(id);
    return result.success ? result.data : null;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const abort = new AbortController();
    currentUserIdRef.current = userId;

    const acceptProfile = (profile: Profile) => {
      if (currentUserIdRef.current !== profile.id) return; // P1297: the session moved on
      setUser(profile);
      previousUserRef.current = profile;
      // Identify user in analytics on session restore (returning users)
      // This ensures Mixpanel knows who the user is even without going through magic link
      analytics.identify(profile.id);
      // P1133: is_internal is NOT re-set here. It's a Mixpanel People property
      // (people.set), which is persistent current-state — once AuthCallbackPage
      // sets it at login, it stays on the profile. Re-setting it here on every
      // page load would be a redundant network call, and would trust
      // profile.email (user-writable via upsert_my_profile, unverified against
      // auth.users) instead of the session's authenticated email.
    };

    const fetchProfile = async () => {
      if (userId) {
        setIsLoading(true);
        // P1297/P1560: the profile on screen belongs to this session's user, or to nobody.
        // A direct switch (A -> B without a sign-out between) must not keep showing A.
        if (previousUserRef.current && previousUserRef.current.id !== userId) {
          previousUserRef.current = null;
          setUser(null);
        }
        await restoreProfile({
          userId,
          signal: abort.signal,
          stale: () => !isMounted || currentUserIdRef.current !== userId,
          previousUserRef,
          deliberateSignOutRef,
          setUser,
          setIsLoading,
          acceptProfile,
        });
      } else {
        setUser(null);
        previousUserRef.current = null;
        // Only flip loading false when we've confirmed there is no session.
        // On mount, userId is briefly undefined before Effect 1's getSession
        // resolves — in that window, isLoading must stay true or protected-page
        // guards will see sessionChecked=true+isLoading=false+user=null and
        // redirect to /login.
        if (sessionChecked) {
          setIsLoading(false);
        }
      }
    };

    fetchProfile();
    return () => {
      isMounted = false;
      abort.abort();
    };
  }, [userId, sessionChecked]);

  // P537: useCallback keeps refreshProfile reference stable across renders
  const refreshProfile = useCallback(async () => {
    if (!userId) {
      return;
    }

    let profile = await fetchProfileForUser(userId);

    // P1297: a read without the owner's email may have gone out with no usable token (the anon
    // key). Never let it replace a profile that has one; otherwise confirm a session exists and
    // read once more, as the restore loop does.
    if (profile && !profile.email) {
      if (previousUserRef.current?.email) return;
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!data.session) return;
      profile = await fetchProfileForUser(userId);
    }
    // P1297/P1560: commit only if the session still belongs to the user it was fetched for.
    if (profile && currentUserIdRef.current === userId && profile.id === userId) {
      setUser(profile);
      previousUserRef.current = profile;
    }
    // On failure, keep existing user state (don't wipe on transient errors)
  }, [userId, fetchProfileForUser]);

  // P537: useCallback keeps signOut reference stable across renders
  const signOut = useCallback(async (options: { scope?: 'global' | 'local' } = {}) => {
    // Fix B: Clean up active live session before signing out
    const sessionId = sessionStorage.getItem('clarity_live_session_id');
    // P1058: release_joiner_seat needs the room code to authorize an ANONYMOUS release. This
    // path only runs while signing OUT, so the caller is signed in and is authorized on
    // auth.uid() alone — the code is read for symmetry with the other two call sites and is
    // harmless when absent. clarity-live-page.tsx writes both keys to the same sessionStorage.
    const sessionCode = sessionStorage.getItem('clarity_live_session_code');
    const isCreator = sessionStorage.getItem('clarity_live_is_creator') === 'true';
    if (sessionId) {
      try {
        if (isCreator) {
          await patchClaritySessionLiveState(sessionId, {
            sessionEnded: true,
            sessionEndedAt: new Date().toISOString(),
          });
        } else {
          await clearSessionJoiner(sessionId, sessionCode);
        }
      } catch {
        // Session cleanup is best-effort — proceed with sign-out regardless
      }
    }
    deliberateSignOutRef.current = true;  // P1240: this one is expected — don't record it
    clearSessionExpiredNotice();           // P1297: and it is not an expiry,
    markDeliberateSignOut();               // in this tab or in any other
    await apiSignOut(options);
    // Clear localStorage session info so the banner doesn't show stale data after sign-out
    clearActiveSessionFromStorage();
    // Reset analytics to clear user identity (prevents events attributed to wrong user)
    analytics.reset();
    // Only clear state after successful sign-out to prevent ghost sessions
    setUser(null);
    setSession(null);
    noteAppSession(null);
  }, []);

  // P537: useMemo prevents context consumers from re-rendering when values haven't changed
  const contextValue = useMemo(
    () => ({ user, session, isLoading, sessionChecked, signOut, refreshProfile }),
    [user, session, isLoading, sessionChecked, signOut, refreshProfile]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
