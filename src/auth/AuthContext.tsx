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
import { getProfileResult, signOut as apiSignOut, patchClaritySessionLiveState, clearSessionJoiner } from '@/app/data/api';
import { analytics } from '@/lib/mixpanel';
import { clearActiveSessionFromStorage } from '@/app/contexts/live-session-context';
import type { Profile } from '@/app/types';

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

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track previous user state to preserve data on transient network errors
  const previousUserRef = useRef<Profile | null>(null);

  // Track if initial session check is complete
  const [sessionChecked, setSessionChecked] = useState(false);

  // Effect 1: Session management only
  // This follows Supabase's recommended pattern - onAuthStateChange just updates session
  useEffect(() => {
    // Get initial session
    const initSession = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();

        if (error) {
          setSessionChecked(true);
          setIsLoading(false);
          return;
        }

        setSession(initialSession);
        setSessionChecked(true);

        // Only set loading false here if NO session (profile effect won't run)
        if (!initialSession) {
          setIsLoading(false);
        }
      } catch {
        setSessionChecked(true);
        setIsLoading(false);
      }
    };

    initSession();

    // Listen for auth changes - ONLY update session, don't fetch profile here
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);

        // Clear user immediately on sign out
        if (!newSession) {
          setUser(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Effect 2: Profile fetching - reacts to USER ID changes only
  // Use session.user.id as dependency (primitive string), not session object
  // This prevents re-fetching when Supabase fires multiple SIGNED_IN events
  const userId = session?.user?.id;

  // Shared profile fetch logic with retry for transient errors.
  // Uses getProfileResult to distinguish "not found" (no retry) from "server error" (retry).
  const fetchProfileForUser = useCallback(async (id: string): Promise<Profile | null> => {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const result = await getProfileResult(id);

      if (result.success) return result.data;

      // Profile genuinely doesn't exist — don't retry
      if (result.error === 'not_found') return null;

      // Server error — retry after delay (except on last attempt)
      if (attempt < MAX_RETRIES) {
        console.warn(`Profile fetch attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    console.error(`Profile fetch failed after ${MAX_RETRIES + 1} attempts for user ${id}`);
    return null;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchProfile = async () => {
      if (userId) {
        setIsLoading(true);
        const profile = await fetchProfileForUser(userId);

        if (!isMounted) return;

        // Only update user state if we got a valid profile OR if user was null
        // This prevents wiping existing user data on transient network errors
        if (profile !== null) {
          setUser(profile);
          previousUserRef.current = profile;

          // Identify user in analytics on session restore (returning users)
          // This ensures Mixpanel knows who the user is even without going through magic link
          analytics.identify(userId);
          // P1133: is_internal is NOT re-set here. It's a Mixpanel People property
          // (people.set), which is persistent current-state — once AuthCallbackPage
          // sets it at login, it stays on the profile. Re-setting it here on every
          // page load would be a redundant network call, and would trust
          // profile.email (user-writable via upsert_my_profile, unverified against
          // auth.users) instead of the session's authenticated email.
        } else if (previousUserRef.current === null) {
          // Profile not found and we have no cached user - this is a new/deleted user
          setUser(null);
        }
        // If profile fetch failed but we have cached user, keep the cached user
        // (handles transient network errors without logging user out)

        setIsLoading(false);
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
    return () => { isMounted = false; };
  }, [userId, fetchProfileForUser, sessionChecked]);

  // P537: useCallback keeps refreshProfile reference stable across renders
  const refreshProfile = useCallback(async () => {
    if (!userId) {
      return;
    }

    const profile = await fetchProfileForUser(userId);

    if (profile) {
      setUser(profile);
    }
    // On failure, keep existing user state (don't wipe on transient errors)
  }, [userId, fetchProfileForUser]);

  // P537: useCallback keeps signOut reference stable across renders
  const signOut = useCallback(async (options: { scope?: 'global' | 'local' } = {}) => {
    // Fix B: Clean up active live session before signing out
    const sessionId = sessionStorage.getItem('clarity_live_session_id');
    const isCreator = sessionStorage.getItem('clarity_live_is_creator') === 'true';
    if (sessionId) {
      try {
        if (isCreator) {
          await patchClaritySessionLiveState(sessionId, {
            sessionEnded: true,
            sessionEndedAt: new Date().toISOString(),
          });
        } else {
          await clearSessionJoiner(sessionId);
        }
      } catch {
        // Session cleanup is best-effort — proceed with sign-out regardless
      }
    }
    await apiSignOut(options);
    // Clear localStorage session info so the banner doesn't show stale data after sign-out
    clearActiveSessionFromStorage();
    // Reset analytics to clear user identity (prevents events attributed to wrong user)
    analytics.reset();
    // Only clear state after successful sign-out to prevent ghost sessions
    setUser(null);
    setSession(null);
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
