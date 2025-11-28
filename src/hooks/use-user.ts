/*
 * CRITICAL AUTHENTICATION MODULE - READ ONLY
 * -----------------------------------------------------------------------------
 * This hook is the "Reader" of the authentication system.
 * It is responsible ONLY for:
 * 1. observing Supabase auth state changes
 * 2. fetching the user profile
 *
 * DO NOT add logic here to create users, update profiles, or handle redirects.
 * Any write operations must happen in the `auth-callback-page.tsx`.
 * -----------------------------------------------------------------------------
 */
import { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getProfile, signOut as apiSignOut } from '@/polymet/data/api';
import type { Profile } from '@/polymet/types';

interface UserState {
  user: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useUser(): UserState {
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
          getProfile(session.user.id).then(profile => setUser(profile));
        } else {
          setUser(null);
        }
        setIsLoading(false);
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
