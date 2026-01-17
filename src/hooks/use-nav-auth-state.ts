/**
 * @file use-nav-auth-state.ts
 * @description KISS Navigation Auth State
 *
 * SIMPLIFIED LOGIC:
 * - Verified user (profile exists + isVerified) → Full menu (View My Profile, Settings, Log Out)
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
import { useAuth } from '@/auth';
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
    signOut,
  };
}
