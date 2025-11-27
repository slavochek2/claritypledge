import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getProfile, signOut as apiSignOut } from '@/polymet/data/api';
import type { Profile } from '@/polymet/types';

interface UserState {
  user: (Profile & { isPending?: boolean }) | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

export const PROFILE_UPDATED_EVENT = 'polymet:profile-updated';

export function useUser(): UserState {
  const [user, setUser] = useState<(Profile & { isPending?: boolean }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let authSubscription: { subscription: { unsubscribe: () => void } } | null = null;

    // Helper to safely update state only if mounted
    const safeSetUser = (newUser: (Profile & { isPending?: boolean }) | null) => {
      if (isMountedRef.current) {
        setUser(newUser);
      }
    };

    const safeSetLoading = (loading: boolean) => {
      if (isMountedRef.current) {
        setIsLoading(loading);
      }
    };

    // Helper to load pending profile from localStorage
    const getPendingProfile = (): (Profile & { isPending: boolean }) | null => {
      try {
        const pendingProfileStr = localStorage.getItem('pendingProfile');
        if (pendingProfileStr) {
          const pendingProfile = JSON.parse(pendingProfileStr);
          return { ...pendingProfile, isPending: true };
        }
      } catch (error) {
        console.error('Error parsing pendingProfile:', error);
      }
      return null;
    };

    // Handle PROFILE_UPDATED_EVENT
    const handleProfileUpdate = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        // If we have an active session, don't override with pending profile
        return;
      }

      // No session - check for pending profile
      const pendingProfile = getPendingProfile();
      if (pendingProfile) {
        safeSetUser(pendingProfile);
      } else {
        safeSetUser(null);
      }
    };

    // Main initialization function
    const initialize = async () => {
      safeSetLoading(true);

      // Check for existing session first
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        // User is authenticated - fetch their profile
        try {
          const profile = await getProfile(session.user.id);
          safeSetUser(profile);
          // Clear any pending profile since we have a real session
          localStorage.removeItem('pendingProfile');
        } catch (error) {
          console.error('Error fetching profile:', error);
          safeSetUser(null);
        }
      } else {
        // No session - check for pending profile
        const pendingProfile = getPendingProfile();
        safeSetUser(pendingProfile);
      }

      safeSetLoading(false);
    };

    // Set up auth state change listener
    const setupAuthListener = () => {
      authSubscription = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (!isMountedRef.current) return;

          safeSetLoading(true);

          if (session?.user) {
            // User signed in or session refreshed
            try {
              const profile = await getProfile(session.user.id);
              safeSetUser(profile);
              localStorage.removeItem('pendingProfile');
            } catch (error) {
              console.error('Error fetching profile on auth change:', error);
              safeSetUser(null);
            }
          } else {
            // User signed out - check for pending profile
            const pendingProfile = getPendingProfile();
            safeSetUser(pendingProfile);
          }

          safeSetLoading(false);
        }
      );
    };

    // Set up event listeners
    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate);

    // Run initialization
    setupAuthListener();
    initialize();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      if (authSubscription?.subscription) {
        authSubscription.subscription.unsubscribe();
      }
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate);
    };
  }, []); // Empty dependency array - only run once

  const signOut = async () => {
    await apiSignOut();
    localStorage.removeItem('pendingProfile');
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    setUser(null);
  };

  return { user, isLoading, signOut };
}
