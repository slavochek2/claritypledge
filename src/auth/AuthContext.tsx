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
import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getProfile, signOut as apiSignOut } from '@/app/data/api';
import type { Profile } from '@/app/types';

interface AuthState {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
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

  // Effect 1: Session management only
  // This follows Supabase's recommended pattern - onAuthStateChange just updates session
  useEffect(() => {
    // Get initial session
    const initSession = async () => {
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('🔐 AuthContext: Error getting session:', error);
          setIsLoading(false);
          return;
        }

        console.log('🔐 AuthContext: Initial session:', initialSession ? 'Found' : 'None');
        setSession(initialSession);

        // Only set loading false here if NO session (profile effect won't run)
        if (!initialSession) {
          setIsLoading(false);
        }
      } catch (error) {
        console.error('🔐 AuthContext: Failed to get session:', error);
        setIsLoading(false);
      }
    };

    initSession();

    // Listen for auth changes - ONLY update session, don't fetch profile here
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('🔐 AuthContext: Auth event:', event);
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

  // Shared profile fetch logic - used by both effect and manual refresh
  const fetchProfileForUser = async (id: string): Promise<Profile | null> => {
    console.log('🔐 AuthContext: Fetching profile for:', id);
    try {
      const profile = await getProfile(id);
      console.log('🔐 AuthContext: Profile loaded:', profile?.name ?? 'Not found');
      return profile;
    } catch (error) {
      console.error('🔐 AuthContext: Failed to fetch profile:', error);
      // Return null on error, but caller decides whether to update state
      return null;
    }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      if (userId) {
        setIsLoading(true);
        const profile = await fetchProfileForUser(userId);

        // Only update user state if we got a valid profile OR if user was null
        // This prevents wiping existing user data on transient network errors
        if (profile !== null) {
          setUser(profile);
          previousUserRef.current = profile;
        } else if (previousUserRef.current === null) {
          // Profile not found and we have no cached user - this is a new/deleted user
          setUser(null);
        }
        // If profile fetch failed but we have cached user, keep the cached user
        // (handles transient network errors without logging user out)

        setIsLoading(false);
      } else {
        // No session = no user, loading complete
        setUser(null);
        previousUserRef.current = null;
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [userId]); // Only runs when user ID actually changes (primitive comparison)

  // Manual refresh - called by AuthCallbackPage after profile upsert
  const refreshProfile = async () => {
    if (!userId) {
      console.warn('🔐 AuthContext: Cannot refresh profile - no user ID');
      return;
    }

    console.log('🔐 AuthContext: Manual profile refresh requested');
    const profile = await fetchProfileForUser(userId);

    if (profile) {
      setUser(profile);
    }
    // On failure, keep existing user state (don't wipe on transient errors)
  };

  const signOut = async () => {
    try {
      await apiSignOut();
      // Only clear state after successful sign-out to prevent ghost sessions
      setUser(null);
      setSession(null);
    } catch (error) {
      console.error('🔐 AuthContext: Sign-out failed:', error);
      // Don't clear state if sign-out failed - token may still be valid
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
