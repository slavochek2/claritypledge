/**
 * @file useAuth.ts
 * @module auth
 *
 * CRITICAL - DO NOT MODIFY WITHOUT E2E TEST APPROVAL
 *
 * Reader-only auth hook. Observes auth state, fetches profile.
 * Does NOT create profiles or handle redirects.
 *
 * This hook is the "Reader" of the authentication system.
 * It is responsible ONLY for:
 * 1. observing Supabase auth state changes
 * 2. fetching the user profile
 *
 * DO NOT add logic here to create users, update profiles, or handle redirects.
 * Any write operations must happen in AuthCallbackPage.tsx.
 */
import { useState, useEffect } from 'react';
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

export function useAuth(): AuthState {
  const [user, setUser] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // The onAuthStateChange listener will handle all auth events:
    // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, INITIAL_SESSION, etc.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session?.user) {
          // Set loading true before fetching to prevent blink on subsequent auth events
          setIsLoading(true);
          getProfile(session.user.id)
            .then(profile => {
              setUser(profile);
              setIsLoading(false);
            })
            .catch((error) => {
              // On transient errors, keep existing user data to avoid false logout appearance
              // Only log the error - session is still valid, just profile fetch failed
              console.error('Profile fetch failed:', error);
              setIsLoading(false);
              // Don't setUser(null) - keep existing user data if available
            });
        } else {
          setUser(null);
          setIsLoading(false);
        }
      }
    );

    // The cleanup function will unsubscribe from the listener when the component unmounts.
    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await apiSignOut();
    setUser(null);
    setSession(null);
  };

  return { user, session, isLoading, signOut };
}
