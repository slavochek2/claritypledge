/**
 * @file home-readiness.ts
 * @description P1512: the ONE answer to "may this person see Home yet?", read by "/" (HomeRedirect),
 * "/home" (HomeRoute) and the chat provider, so the three can never disagree.
 *
 *   pending        the session (and its profile) is still resolving
 *   signed-in      a verified person with a loaded profile
 *   signed-out     no session, or a session whose person is not verified
 *   profile-error  a session exists but its profile could not be loaded, or resolving took too long:
 *                  an inline error with Retry, never an endless spinner
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { useNavAuthState } from '@/hooks/use-nav-auth-state';

export type HomeReadiness = 'pending' | 'signed-in' | 'signed-out' | 'profile-error';

/** How long "still resolving" may last before it is called an error. */
export const PENDING_TIMEOUT_MS = 15_000;

export function useHomeReadiness(): { state: HomeReadiness; retry: () => void } {
  const { sessionChecked, hasSession, isLoading, showUserMenu } = useNavAuthState();
  // The raw profile: the nav state hides it unless the person is verified, and an unverified person
  // is signed OUT here, not in error.
  const { refreshProfile, user: profile } = useAuth();
  const pending = !sessionChecked || (hasSession && isLoading);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!pending) {
      setStalled(false);
      return;
    }
    const t = setTimeout(() => setStalled(true), PENDING_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [pending]);

  let state: HomeReadiness;
  if (pending) state = stalled ? 'profile-error' : 'pending';
  else if (showUserMenu) state = 'signed-in';
  else if (hasSession && !profile) state = 'profile-error';
  else state = 'signed-out';

  const retry = () => {
    setStalled(false);
    // No session check yet means there is no profile to re-read: start over.
    if (!sessionChecked) window.location.reload();
    else void refreshProfile();
  };
  return { state, retry };
}
