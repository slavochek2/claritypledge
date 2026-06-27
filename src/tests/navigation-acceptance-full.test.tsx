/**
 * @file navigation-acceptance-full.test.tsx
 * @description KISS Navigation Tests
 *
 * TWO STATES ONLY:
 * 1. Verified user → Full menu (Settings, Log Out)
 * 2. Everyone else → Public menu (Log In)
 *
 * "Everyone else" includes: anonymous, unverified /live users, loading states
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Nav tests cover menu visibility, auth states, and avatar behaviour — not unread counts.
// Running the real fetch path here couples nav tests to letter-service behaviour.
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0, loading: false }),
}));

// Mock analytics
const mockTrack = vi.fn();
vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: (...args: unknown[]) => mockTrack(...args),
  },
}));

import { SimpleNavigation } from '@/app/components/layout/simple-navigation';
import { WEBINAR_REGISTER_URL, WEBINAR_CTA_LABEL } from '@/app/content/webinar';
import { LiveSessionBanner } from '@/app/components/partners/live-session-banner';

// ============================================================================
// Test Utilities
// ============================================================================

const createMockUser = (overrides = {}) => ({
  id: 'test-user-id',
  slug: 'test-user',
  name: 'Test User',
  email: 'test@example.com',
  isVerified: true,
  hasPledged: false,
  signedAt: new Date().toISOString(),
  witnesses: [],
  reciprocations: 0,
  avatarColor: '#10b981',
  ...overrides,
});

// Helper to open desktop menu (specifically targets the desktop hamburger, not mobile)
async function openDesktopMenu() {
  // Desktop menu button has aria-label="Menu" and is not the mobile button (which has aria-label="Open menu")
  const menuButtons = screen.getAllByRole('button', { name: /menu/i });
  // The desktop button is the one with exact aria-label="Menu" (not "Open menu")
  const desktopMenuButton = menuButtons.find(btn => btn.getAttribute('aria-label') === 'Menu');
  if (!desktopMenuButton) throw new Error('Desktop menu button not found');
  await userEvent.click(desktopMenuButton);
}

// Helper to open mobile menu
async function openMobileMenu() {
  const menuButton = screen.getByRole('button', { name: /open menu/i });
  await userEvent.click(menuButton);
}

// Helper to open LiveSessionBanner menu
async function openLiveBannerMenu() {
  const menuButton = screen.getByTestId('menu-trigger');
  await userEvent.click(menuButton);
}

// ============================================================================
// KISS: Two States - Anonymous vs Verified
// ============================================================================

describe('KISS Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SimpleNavigation Desktop Menu', () => {
    describe('Anonymous User (no session)', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      // P856: Log in is a visible header link next to the main CTA (Airtable
      // pattern), no longer a desktop dropdown item.
      it('shows Log in as a visible header link, not in the dropdown', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
        await openDesktopMenu();
        expect(screen.queryByRole('menuitem', { name: /log in/i })).not.toBeInTheDocument();
      });

      it('does NOT show Log Out', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument();
      });

      it('does NOT show Settings', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.queryByRole('menuitem', { name: /settings/i })).not.toBeInTheDocument();
      });

      it('shows visible nav link: Co-founder Program', () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        expect(screen.getByRole('link', { name: 'Co-founder Program' })).toBeInTheDocument();
      });

      it('shows Events, Blog, Pledgers, Manifesto, About in dropdown menu', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.getByRole('menuitem', { name: /events/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /blog/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /pledgers/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /manifesto/i })).toBeInTheDocument();
        expect(screen.getByRole('menuitem', { name: /about/i })).toBeInTheDocument();
      });

      // P937/P951: the logged-out primary CTA is webinar-first. Every public page mirrors
      // the main landing's action — "Join a free webinar" → WEBINAR_REGISTER_URL — EXCEPT
      // "/coach", which serves a different audience and keeps the P856 CTA "Try a Clarity
      // Letter" → /letter/ck. "Start a Clarity Session" remains the logged-in CTA.
      // (jsdom path defaults to "/".)
      it('at "/" shows Register for the free webinar CTA (not Start a Clarity Session)', () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        const cta = screen.getByRole('link', { name: new RegExp(WEBINAR_CTA_LABEL, 'i') });
        expect(cta).toBeInTheDocument();
        // P957: pin the literal canonical path, not the constant — a constant-vs-constant
        // compare would pass tautologically even if WEBINAR_REGISTER_URL drifted to a wrong value.
        expect(cta).toHaveAttribute('href', '/events/experiment');
        expect(WEBINAR_REGISTER_URL).toBe('/events/experiment');
        expect(screen.queryByRole('link', { name: /apply for clarity program/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /start a clarity session/i })).not.toBeInTheDocument();
      });

      it('on a content route (/pledgers) shows the webinar CTA, not Try a Clarity Letter', () => {
        window.history.pushState({}, '', '/pledgers');
        try {
          render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
          const cta = screen.getByRole('link', { name: new RegExp(WEBINAR_CTA_LABEL, 'i') });
          expect(cta).toBeInTheDocument();
          expect(cta).toHaveAttribute('href', '/events/experiment'); // P957: pinned literal, not the constant
          expect(screen.queryByRole('link', { name: /try a clarity letter/i })).not.toBeInTheDocument();
        } finally {
          window.history.pushState({}, '', '/'); // restore for later tests
        }
      });

      it('on "/coach" keeps the Try a Clarity Letter CTA → /letter/ck (the one exception)', () => {
        window.history.pushState({}, '', '/coach');
        try {
          render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
          const cta = screen.getByRole('link', { name: /try a clarity letter/i });
          expect(cta).toBeInTheDocument();
          // pin the alias contract — a broken target would otherwise pass all nav tests
          expect(cta).toHaveAttribute('href', '/letter/ck');
          expect(screen.queryByRole('link', { name: new RegExp(WEBINAR_CTA_LABEL, 'i') })).not.toBeInTheDocument();
        } finally {
          window.history.pushState({}, '', '/'); // restore for later tests
        }
      });

      it('does NOT show Take the Pledge as visible CTA (moved to menu)', () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        // Take the Pledge should be in menu, not as a visible button
        // Before opening menu, it should not be visible
        const pledgeLinks = screen.queryAllByRole('link', { name: /take the pledge/i });
        // Filter out any that might be in the mobile menu (hidden by CSS)
        const visiblePledgeButtons = pledgeLinks.filter(link =>
          !link.closest('[id="mobile-navigation-menu"]')
        );
        expect(visiblePledgeButtons.length).toBe(0);
      });
    });

    describe('Verified Non-Pledger', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ hasPledged: false }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Settings', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
      });

      it('shows Log Out', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
      });

      it('does NOT show Log In', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.queryByRole('menuitem', { name: /log in/i })).not.toBeInTheDocument();
      });
    });

    describe('Verified Pledger', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ hasPledged: true }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Settings', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
      });

      it('shows Log Out', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
      });
    });

    describe('KISS: Unverified users see same as anonymous', () => {
      beforeEach(() => {
        // Unverified user: has session but isVerified=false
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'unverified-user-id' } },
          user: createMockUser({ isVerified: false, slug: null }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Log in visible header link (same as anonymous)', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        expect(screen.getByRole('link', { name: /log in/i })).toBeInTheDocument();
        await openDesktopMenu();
        expect(screen.queryByRole('menuitem', { name: /log in/i })).not.toBeInTheDocument();
      });

      it('does NOT show Log Out (KISS: treated as anonymous)', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.queryByRole('menuitem', { name: /log out/i })).not.toBeInTheDocument();
      });
    });

    describe('Loading state shows skeleton (prevents wrong-state flash)', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: true,
          sessionChecked: false,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows skeleton instead of public or user menu during loading', () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        // No dropdown menu button during loading — skeleton replaces it
        const menuButtons = screen.queryAllByRole('button', { name: /menu/i });
        const desktopMenuButton = menuButtons.find(btn => btn.getAttribute('aria-label') === 'Menu');
        expect(desktopMenuButton).toBeUndefined();
      });
    });
  });

  describe('SimpleNavigation Mobile Menu', () => {
    describe('Anonymous User', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Log In in mobile menu', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openMobileMenu();
        // P856: scope to the menu — the desktop header Log in link also renders (CSS-hidden)
        const mobileMenu = document.getElementById('mobile-navigation-menu')!;
        expect(within(mobileMenu).getByRole('link', { name: /log in/i })).toBeInTheDocument();
      });
    });

    describe('Verified User', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser(),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Log Out in mobile menu', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openMobileMenu();
        expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
      });
    });
  });

  // ============================================================================
  // Desktop/Mobile Menu Consistency Tests
  // ============================================================================
  describe('Desktop/Mobile Menu Consistency', () => {
    describe('Anonymous User - menus should be consistent', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Take the Pledge in desktop menu', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();
        expect(screen.getByRole('menuitem', { name: /take the pledge/i })).toBeInTheDocument();
      });

      it('shows Take the Pledge in mobile menu', async () => {
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openMobileMenu();
        expect(screen.getByRole('link', { name: /take the pledge/i })).toBeInTheDocument();
      });
    });

    // Guard against duplicate menu items
    describe('No duplicate menu items', () => {
      it('verified user desktop menu has no duplicate items', async () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ hasPledged: false }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();

        // Each of these should appear exactly once
        expect(screen.getAllByRole('menuitem', { name: /settings/i })).toHaveLength(1);
        expect(screen.getAllByRole('menuitem', { name: /log out/i })).toHaveLength(1);
      });

      it('verified user mobile menu has no duplicate items', async () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ hasPledged: false }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openMobileMenu();

        // Each of these should appear exactly once
        expect(screen.getAllByRole('link', { name: /settings/i })).toHaveLength(1);
        expect(screen.getAllByRole('button', { name: /log out/i })).toHaveLength(1);
      });

      it('anonymous user desktop menu has no duplicate items', async () => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openDesktopMenu();

        expect(screen.getAllByRole('menuitem', { name: /take the pledge/i })).toHaveLength(1);
        // P856: Log in is a visible header link, not a dropdown item — exactly one in the document
        expect(screen.getAllByRole('link', { name: /log in/i })).toHaveLength(1);
        expect(screen.getAllByRole('menuitem', { name: /create account/i })).toHaveLength(1);
      });

      it('anonymous user mobile menu has no duplicate items', async () => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);
        await openMobileMenu();

        expect(screen.getAllByRole('link', { name: /take the pledge/i })).toHaveLength(1);
        // P856: the desktop header Log in link also renders (hidden via CSS),
        // so scope the mobile-menu check to the menu container
        const mobileMenu = document.getElementById('mobile-navigation-menu')!;
        expect(within(mobileMenu).getAllByRole('link', { name: /log in/i })).toHaveLength(1);
        expect(screen.getAllByRole('link', { name: /create account/i })).toHaveLength(1);
      });
    });
  });

  describe('LiveSessionBanner', () => {
    describe('Anonymous User', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Log In', async () => {
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);
        await openLiveBannerMenu();
        expect(screen.getByTestId('login-option')).toBeInTheDocument();
      });

      it('shows Sound toggle', async () => {
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);
        await openLiveBannerMenu();
        expect(screen.getByTestId('sound-toggle')).toBeInTheDocument();
      });

      it('does not show Leave button when isLiveMeeting=false', () => {
        render(<BrowserRouter><LiveSessionBanner isLiveMeeting={false} /></BrowserRouter>);
        expect(screen.queryByTestId('leave-meeting')).not.toBeInTheDocument();
      });
    });

    describe('Verified User', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser(),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Settings', async () => {
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);
        await openLiveBannerMenu();
        expect(screen.getByTestId('settings')).toBeInTheDocument();
      });

      it('shows Log Out', async () => {
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);
        await openLiveBannerMenu();
        expect(screen.getByTestId('sign-out')).toBeInTheDocument();
      });

      it('does NOT show Log In', async () => {
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);
        await openLiveBannerMenu();
        expect(screen.queryByTestId('login-option')).not.toBeInTheDocument();
      });
    });

    describe('KISS: Unverified users see Log In', () => {
      beforeEach(() => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'unverified-user-id' } },
          user: createMockUser({ isVerified: false, slug: null }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
      });

      it('shows Log In (same as anonymous)', async () => {
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);
        await openLiveBannerMenu();
        expect(screen.getByTestId('login-option')).toBeInTheDocument();
      });

    });
  });

  // ============================================================================
  // P67: Avatar Trigger - Avatar replaces hamburger for verified users
  // ============================================================================
  describe('P67: Avatar Trigger', () => {
    describe('SimpleNavigation Desktop - Avatar as menu trigger', () => {
      it('shows avatar with initials for verified user', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Slava Kuzmich', avatarColor: '#10b981' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Should show avatar with two initials (SK) - both desktop and mobile show it
        const avatars = screen.getAllByText('SK');
        expect(avatars.length).toBeGreaterThanOrEqual(1);
      });

      it('shows photo avatar for user with avatarUrl', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({
            name: 'Slava Kuzmich',
            avatarUrl: 'https://example.com/photo.jpg',
          }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Should show photo avatar - both desktop and mobile show it
        const avatars = screen.getAllByAltText("Slava Kuzmich's avatar");
        expect(avatars.length).toBeGreaterThanOrEqual(1);
      });

      it('shows hamburger for signed out user', () => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Should show hamburger menu icon (desktop button with aria-label="Menu")
        const menuButtons = screen.getAllByRole('button', { name: /menu/i });
        const desktopButton = menuButtons.find(btn => btn.getAttribute('aria-label') === 'Menu');
        expect(desktopButton).toBeInTheDocument();
        // Should NOT have avatar initials
        expect(screen.queryByText('SK')).not.toBeInTheDocument();
      });

      it('shows skeleton during auth loading (prevents logged-out flash)', () => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: true,
          sessionChecked: false,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // No interactive menu button during loading — skeleton replaces hamburger/avatar
        const menuButtons = screen.queryAllByRole('button', { name: /menu/i });
        const desktopButton = menuButtons.find(btn => btn.getAttribute('aria-label') === 'Menu');
        expect(desktopButton).toBeUndefined();
      });

      it('clicking avatar opens same dropdown menu', async () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Slava Kuzmich' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Click the avatar - use first one (desktop)
        const avatars = screen.getAllByText('SK');
        await userEvent.click(avatars[0]);

        // Menu should open with expected items
        expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
      });

      it('shows "?" for user with empty name (edge case)', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: '' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Should show "?" as fallback initial when name is empty
        const fallbackInitials = screen.getAllByText('?');
        expect(fallbackInitials.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('SimpleNavigation Mobile - Avatar as menu trigger', () => {
      it('shows avatar for verified user in mobile', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Test User', avatarColor: '#10b981' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Mobile menu button should show avatar (TU initials)
        // Both desktop and mobile show TU, so we check for at least one
        const avatars = screen.getAllByText('TU');
        expect(avatars.length).toBeGreaterThanOrEqual(1);
      });

      it('shows X icon when mobile menu is open (replaces avatar)', async () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Test User' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Open mobile menu
        await openMobileMenu();

        // Should show X icon, not avatar
        expect(screen.getByRole('button', { name: /close menu/i })).toBeInTheDocument();
      });
    });

    describe('LiveSessionBanner - Avatar as menu trigger', () => {
      it('shows avatar for verified user', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Test User', avatarColor: '#10b981' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);

        // Should show avatar with initials
        expect(screen.getByText('TU')).toBeInTheDocument();
      });

      it('shows hamburger for anonymous user', () => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);

        // Should show hamburger
        expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
        // Should NOT have avatar
        expect(screen.queryByText('TU')).not.toBeInTheDocument();
      });

      it('shows hamburger for unverified user (KISS)', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ isVerified: false, name: 'Unverified User' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);

        // Should show hamburger (unverified = treated as anonymous)
        expect(screen.getByTestId('menu-trigger')).toBeInTheDocument();
        // Should NOT have avatar initials
        expect(screen.queryByText('UU')).not.toBeInTheDocument();
      });
    });

    describe('Analytics - nav_menu_opened trigger tracking', () => {
      beforeEach(() => {
        mockTrack.mockClear();
      });

      it('tracks trigger=avatar when verified user opens desktop menu', async () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Test User' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Click avatar to open menu
        await openDesktopMenu();

        expect(mockTrack).toHaveBeenCalledWith('nav_menu_opened', {
          trigger: 'avatar',
          device: 'desktop',
        });
      });

      it('tracks trigger=hamburger when anonymous user opens desktop menu', async () => {
        mockUseAuth.mockReturnValue({
          session: null,
          user: null,
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        await openDesktopMenu();

        expect(mockTrack).toHaveBeenCalledWith('nav_menu_opened', {
          trigger: 'hamburger',
          device: 'desktop',
        });
      });

      it('tracks trigger=avatar with device=mobile when verified user opens mobile menu', async () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Test User' }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        await openMobileMenu();

        expect(mockTrack).toHaveBeenCalledWith('nav_menu_opened', {
          trigger: 'avatar',
          device: 'mobile',
        });
      });

      describe('LiveSessionBanner analytics', () => {
        it('tracks trigger=avatar when verified user opens menu', async () => {
          mockUseAuth.mockReturnValue({
            session: { user: { id: 'test-user-id' } },
            user: createMockUser({ name: 'Test User' }),
            isLoading: false,
            sessionChecked: true,
            signOut: vi.fn(),
            refreshProfile: vi.fn(),
          });
          render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);

          await openLiveBannerMenu();

          expect(mockTrack).toHaveBeenCalledWith('nav_menu_opened', {
            trigger: 'avatar',
            device: 'desktop',
          });
        });

        it('tracks trigger=hamburger when anonymous user opens menu', async () => {
          mockUseAuth.mockReturnValue({
            session: null,
            user: null,
            isLoading: false,
            sessionChecked: true,
            signOut: vi.fn(),
            refreshProfile: vi.fn(),
          });
          render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);

          await openLiveBannerMenu();

          expect(mockTrack).toHaveBeenCalledWith('nav_menu_opened', {
            trigger: 'hamburger',
            device: 'desktop',
          });
        });

        it('tracks trigger=hamburger for unverified user (KISS)', async () => {
          mockUseAuth.mockReturnValue({
            session: { user: { id: 'test-user-id' } },
            user: createMockUser({ isVerified: false }),
            isLoading: false,
            sessionChecked: true,
            signOut: vi.fn(),
            refreshProfile: vi.fn(),
          });
          render(<BrowserRouter><LiveSessionBanner /></BrowserRouter>);

          await openLiveBannerMenu();

          expect(mockTrack).toHaveBeenCalledWith('nav_menu_opened', {
            trigger: 'hamburger',
            device: 'desktop',
          });
        });
      });
    });
  });

  // ============================================================================
  // P76: Pledger Avatar Distinction (ring only, no badge)
  // ============================================================================
  describe('P76: Pledger Avatar Distinction', () => {
    describe('SimpleNavigation - pledger avatar shows ring', () => {
      it('shows ring for pledger avatar', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Pledger User', hasPledged: true }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Should show blue ring around avatar (there are 2: desktop and mobile)
        const avatars = screen.getAllByTestId('gravatar-avatar');
        expect(avatars.length).toBeGreaterThanOrEqual(1);
        expect(avatars[0].className).toMatch(/ring-(blue-500|2)/);
      });

      it('shows no ring for non-pledger avatar', () => {
        mockUseAuth.mockReturnValue({
          session: { user: { id: 'test-user-id' } },
          user: createMockUser({ name: 'Regular User', hasPledged: false }),
          isLoading: false,
          sessionChecked: true,
          signOut: vi.fn(),
          refreshProfile: vi.fn(),
        });
        render(<BrowserRouter><SimpleNavigation /></BrowserRouter>);

        // Should NOT show blue ring
        const avatars = screen.getAllByTestId('gravatar-avatar');
        expect(avatars[0].className).not.toMatch(/ring-blue-500/);
      });
    });
  });
});
