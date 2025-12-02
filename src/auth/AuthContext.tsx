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
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getProfile, signOut as apiSignOut } from '@/app/data/api';
import type { Profile } from '@/app/types';

interface AuthState {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Effect 1: Session management only
  // This follows Supabase's recommended pattern - onAuthStateChange just updates session
  useEffect(() => {
    // Get initial session
    const initSession = async () => {
      const { data: { session: initialSession } } = await supabase.auth.getSession();
      console.log('🔐 AuthContext: Initial session:', initialSession ? 'Found' : 'None');
      setSession(initialSession);

      // Only set loading false here if NO session (profile effect won't run)
      if (!initialSession) {
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

  useEffect(() => {
    const fetchProfile = async () => {
      if (userId) {
        console.log('🔐 AuthContext: Fetching profile for:', userId);
        setIsLoading(true);

        try {
          const profile = await getProfile(userId);
          console.log('🔐 AuthContext: Profile loaded:', profile?.name ?? 'Not found');
          setUser(profile);
        } catch (error) {
          console.error('🔐 AuthContext: Failed to fetch profile:', error);
          setUser(null);
        } finally {
          setIsLoading(false);
        }
      } else {
        // No session = no user, loading complete
        setUser(null);
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [userId]); // Only runs when user ID actually changes (primitive comparison)

  const signOut = async () => {
    // Clear state immediately for instant UI feedback
    setUser(null);
    setSession(null);
    await apiSignOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
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
