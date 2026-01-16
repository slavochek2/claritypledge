/**
 * @file navigation-menu.ts
 * @description SINGLE SOURCE OF TRUTH for navigation menu configuration
 *
 * This file defines what menu items each user type sees.
 * Both SimpleNavigation and LiveSessionBanner MUST read from this config.
 *
 * If you need to change what a user sees, change it HERE ONLY.
 */

// ============================================================================
// USER STATES (from P50)
// ============================================================================

export type UserState =
  | 'anonymous'           // No session
  | 'unverified'          // Session + profile, isVerified=false (e.g., /live users)
  | 'verified-non-pledger' // Session + profile, isVerified=true, hasPledged=false
  | 'verified-pledger';    // Session + profile, isVerified=true, hasPledged=true

// ============================================================================
// MENU ITEMS
// ============================================================================

export type MenuItemId =
  | 'log-in'
  | 'log-out'
  | 'view-profile'
  | 'take-pledge'
  | 'view-pledge'
  | 'settings'
  | 'home';

export interface MenuItem {
  id: MenuItemId;
  label: string;
  href?: string;          // For links
  action?: 'sign-out';    // For buttons
  icon: string;           // Lucide icon name
  testId: string;
}

// ============================================================================
// MENU CONFIGURATION
// ============================================================================

/**
 * What menu items each user state sees.
 * This is the SINGLE SOURCE OF TRUTH.
 *
 * Key UX principle: Unverified users ARE logged in (have session).
 * They should see logged-in menu items, not public menu.
 *
 * Rules:
 * - Anonymous: Log In, Take Pledge CTA
 * - Unverified: Log Out, Profile, Settings, Take Pledge (they ARE logged in!)
 * - Verified Non-Pledger: Log Out, Profile, Take Pledge, Settings
 * - Verified Pledger: Log Out, Profile, View Pledge, Settings (NO take pledge)
 */
export const MENU_CONFIG: Record<UserState, MenuItemId[]> = {
  'anonymous': [
    'home',
    'take-pledge',   // CTA
    'log-in',
  ],
  'unverified': [
    'home',
    'view-profile',  // Goes to /me which shows verification prompt
    'take-pledge',   // CTA to become a pledger
    'settings',      // Can update their info
    'log-out',       // They have a session, so they can log out
  ],
  'verified-non-pledger': [
    'home',
    'view-profile',
    'take-pledge',   // In menu
    'settings',
    'log-out',
  ],
  'verified-pledger': [
    'home',
    'view-profile',
    'view-pledge',
    'settings',
    'log-out',
  ],
};

// ============================================================================
// MENU ITEM DEFINITIONS
// ============================================================================

export const MENU_ITEMS: Record<MenuItemId, Omit<MenuItem, 'id'>> = {
  'log-in': {
    label: 'Log In',
    href: '/login',
    icon: 'LogIn',
    testId: 'login-option',
  },
  'log-out': {
    label: 'Log Out',
    action: 'sign-out',
    icon: 'LogOut',
    testId: 'sign-out',
  },
  'view-profile': {
    label: 'View My Profile',
    href: '/me',
    icon: 'User',
    testId: 'view-profile',
  },
  'take-pledge': {
    label: 'Take the Pledge',
    href: '/sign-pledge',  // Note: verified users get ?prefill=true added
    icon: 'FileText',
    testId: 'take-pledge',
  },
  'view-pledge': {
    label: 'View My Pledge',
    href: '/p/:slug/pledge',  // :slug replaced at runtime
    icon: 'Eye',
    testId: 'view-pledge',
  },
  'settings': {
    label: 'Settings',
    href: '/settings',
    icon: 'Settings',
    testId: 'settings',
  },
  'home': {
    label: 'Home',
    href: '/',
    icon: 'Home',
    testId: 'home-link',
  },
};

// ============================================================================
// HELPER: Determine user state from auth
// ============================================================================

export function getUserState(auth: {
  hasSession: boolean;
  isVerified: boolean;
  hasPledged: boolean;
}): UserState {
  if (!auth.hasSession) return 'anonymous';
  if (!auth.isVerified) return 'unverified';
  if (!auth.hasPledged) return 'verified-non-pledger';
  return 'verified-pledger';
}

// ============================================================================
// HELPER: Get menu items for user
// ============================================================================

export function getMenuItemsForUser(userState: UserState): MenuItem[] {
  const itemIds = MENU_CONFIG[userState];
  return itemIds.map(id => ({ id, ...MENU_ITEMS[id] }));
}

// ============================================================================
// HELPER: Check if user should see specific item
// ============================================================================

export function shouldShowMenuItem(userState: UserState, itemId: MenuItemId): boolean {
  return MENU_CONFIG[userState].includes(itemId);
}
