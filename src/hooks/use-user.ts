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
import { supabase } from '@/lib/supabase';
import { getProfile, signOut as apiSignOut } from '@/polymet/data/api';
import type { Profile } from '@/polymet/types';

interface UserState {
  user: Profile | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export function useUser(): UserState {
  const [user, setUser] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This function will be called when the component mounts and on auth state changes.
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        // If a session exists, fetch the user's profile.
        const profile = await getProfile(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    };

    // We check the session once on initial load.
    checkSession();

    // The onAuthStateChange listener will handle all auth events:
    // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          getProfile(session.user.id).then(profile => setUser(profile));
        } else {
          setUser(null);
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
  };

  return { user, isLoading, signOut };
}
