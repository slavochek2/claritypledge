import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const checkPendingProfile = () => {
      const pendingProfileStr = localStorage.getItem('pendingProfile');
      if (pendingProfileStr) {
        const pendingProfile = JSON.parse(pendingProfileStr);
        setUser({ ...pendingProfile, isPending: true });
        setIsLoading(false);
        // Do not return here, let the auth state check override if a session exists
      }
    };

    const handleProfileUpdate = () => {
      const pendingProfileStr = localStorage.getItem('pendingProfile');
      if (pendingProfileStr) {
        const pendingProfile = JSON.parse(pendingProfileStr);
        setUser({ ...pendingProfile, isPending: true });
        setIsLoading(false);
      } else {
        // If pending profile is removed, we need to check if we have a session
        // If not, clear the user
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session) {
            setUser(null);
          }
        });
      }
    };

    window.addEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate);

    checkPendingProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setIsLoading(true);
        if (session?.user) {
          const profile = await getProfile(session.user.id);
          setUser(profile);
          // If a real session is found, clear any pending profile
          localStorage.removeItem('pendingProfile');
        } else {
          // If no session, check for pending profile again, otherwise set user to null
          const pendingProfileStr = localStorage.getItem('pendingProfile');
          if (pendingProfileStr) {
            const pendingProfile = JSON.parse(pendingProfileStr);
            setUser({ ...pendingProfile, isPending: true });
          } else {
            setUser(null);
          }
        }
        setIsLoading(false);
      }
    );

    // Initial check for user session
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        if (!user || user.id !== session.user.id) { // Avoid refetching if user is already set
          const profile = await getProfile(session.user.id);
          setUser(profile);
          localStorage.removeItem('pendingProfile');
        }
      } else {
         checkPendingProfile();
      }
      setIsLoading(false);
    };

    checkUser();


    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener(PROFILE_UPDATED_EVENT, handleProfileUpdate);
    };
  }, []);

  const signOut = async () => {
    await apiSignOut();
    localStorage.removeItem('pendingProfile');
    window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    setUser(null);
  };

  return { user, isLoading, signOut };
}
