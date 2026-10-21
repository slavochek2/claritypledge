/**
 * @file use-nav-auth-state.ts
 * @description KISS Navigation Auth State
 *
 * SIMPLIFIED LOGIC:
 * - Verified user (profile exists + isVerified) → Full menu (Settings, Log Out)
 * - Everyone else (anonymous OR unverified) → Public menu (Home, Log In)
 *
 * Why KISS: Unverified users seeing "Verify Email" in menu caused race conditions
 * because profile might not be loaded yet when menu renders. By treating unverified
 * same as anonymous for menu purposes, we eliminate the race condition entirely.
 *
 * Unverified users can still verify via:
 * 1. /me page (if they navigate there)
 * 2. Email sent after meeting ends (P51)
 * 3. Taking the pledge
 */
import { useEffect, useState } from 'react';
import { useAuth } from '@/auth';
import { hasNavVerifiedHint, setNavVerifiedHint } from '@/lib/nav-verified-hint';
import { storedSessionUserId } from '@/lib/offline-read-cache';
import type { Profile } from '@/app/types';

interface NavAuthState {
  // What to show
  showUserMenu: boolean; // Verified user - show full menu
  showPublicCTAs: boolean; // Everyone else - show public CTAs

  // User data
  user: Profile | null;
  hasPledged: boolean;
  slug: string | null;

  // Session state
  hasSession: boolean;
  isVerified: boolean;

  // Loading states
  isLoading: boolean;
  sessionChecked: boolean;
  // P1421: a session exists, its profile is still in flight, AND this device last saw that
  // user resolve verified. Signed-in chrome then renders its final layout now (profile-
  // dependent slots as placeholders) so nothing reflows when the profile lands.
  isProfilePending: boolean;

  // Auth actions
  signOut: () => Promise<void>;
}

/**
 * KISS Navigation Auth State
 *
 * Two states only:
 * 1. Verified user → Full menu
 * 2. Everyone else → Public menu (same as anonymous)
 */
export function useNavAuthState(): NavAuthState {
  const { session, user, isLoading, sessionChecked, signOut } = useAuth();

  // KISS: Only verified users with loaded profile get the full menu
  const isVerifiedUser = !!user && user.isVerified === true;
  const showUserMenu = sessionChecked && !isLoading && isVerifiedUser;

  const sessionUserId = session?.user?.id ?? null;

  // P1421: record how this session's profile resolved, as evidence for the next load.
  // A missing/failed/unverified profile clears it — the next load keeps the old behaviour.
  // P1512: before the session check returns, the stored session (read synchronously, once per mount)
  // stands in, so a returning verified user's first paint is already the signed-in shell, not the
  // public top nav.
  const [storedUserId] = useState(storedSessionUserId);
  useEffect(() => {
    if (!sessionChecked || isLoading) return;
    if (sessionUserId) {
      setNavVerifiedHint(sessionUserId, isVerifiedUser && user?.id === sessionUserId);
    } else if (storedUserId) {
      // The stored session turned out dead (expired, revoked): drop its hint, or every later load
      // would paint the shell first and then fall back to the public nav.
      setNavVerifiedHint(storedUserId, false);
    }
  }, [sessionChecked, isLoading, sessionUserId, isVerifiedUser, user?.id, storedUserId]);

  const isProfilePending = sessionChecked
    ? !!sessionUserId && isLoading && hasNavVerifiedHint(sessionUserId)
    : !!storedUserId && hasNavVerifiedHint(storedUserId);

  // Everyone else sees public CTAs (anonymous OR unverified OR loading)
  const showPublicCTAs = !showUserMenu;

  return {
    showUserMenu,
    showPublicCTAs,
    user: showUserMenu ? user : null,
    hasPledged: user?.hasPledged ?? false,
    slug: user?.slug ?? null,
    hasSession: !!session,
    isVerified: isVerifiedUser,
    isLoading,
    sessionChecked,
    isProfilePending,
    signOut,
  };
}
