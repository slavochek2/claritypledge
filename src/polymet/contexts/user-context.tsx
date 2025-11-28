import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { getProfile, signOut as apiSignOut } from '@/polymet/data/api';
import type { Profile } from '@/polymet/types';

interface UserState {
  user: (Profile & { isPending?: boolean }) | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserState | undefined>(undefined);

export const PROFILE_UPDATED_EVENT = 'polymet:profile-updated'; // Deprecated but kept for compatibility

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<(Profile & { isPending?: boolean }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let authListener: { data: { subscription: { unsubscribe: () => void } } } | null = null;

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

    // Main initialization function
    const initialize = async () => {
      safeSetLoading(true);

      try {
        // Check for existing session first
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // User is authenticated - fetch their profile
          try {
            const profile = await getProfile(session.user.id);
            safeSetUser(profile);
          } catch (error) {
            console.error('Error fetching profile:', error);
            safeSetUser(null);
          }
        } else {
          // No session
          safeSetUser(null);
        }
      } catch (err) {
        console.error('Error initializing user session:', err);
      } finally {
        safeSetLoading(false);
      }
    };

    // Set up auth state change listener
    const setupAuthListener = () => {
      authListener = supabase.auth.onAuthStateChange(
        async (_event, session) => {
          if (!isMountedRef.current) return;

          safeSetLoading(true);

          try {
            if (session?.user) {
              // User signed in or session refreshed
              try {
                const profile = await getProfile(session.user.id);
                safeSetUser(profile);
              } catch (error) {
                console.error('Error fetching profile on auth change:', error);
                safeSetUser(null);
              }
            } else {
              // User signed out
              safeSetUser(null);
            }
          } finally {
            safeSetLoading(false);
          }
        }
      );
    };

    // Run initialization
    setupAuthListener();
    initialize();

    // Cleanup function
    return () => {
      isMountedRef.current = false;
      if (authListener?.data.subscription) {
        authListener.data.subscription.unsubscribe();
      }
    };
  }, []); // Empty dependency array - only run once

  const signOut = async () => {
    await apiSignOut();
    setUser(null);
  };

  return (
    <UserContext.Provider value={{ user, isLoading, signOut }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUserContext() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
}

