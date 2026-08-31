/**
 * @file p885-partners-nav.test.tsx
 * @description P885: "Partners" navigation item with invitation badge.
 *
 * UI Contract under test:
 * - Mobile bottom nav (logged-in): 5 items — Home, Letters, Partners, Events, My Profile
 * - Partners links to /p/{slug}/partners; active state on that route
 * - Badge: blue pill, hidden at 0, "99+" cap — identical to Letters badge
 * - Desktop logged-in nav shows a Partners entry linking to the same page
 * - Logged-out users never see Partners
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock Setup
// ============================================================================

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseNavAuthState = vi.fn();
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => mockUseNavAuthState(),
}));

const mockUseLiveSession = vi.fn();
vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => mockUseLiveSession(),
}));

const mockUseUnreadLetterCount = vi.fn();
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => mockUseUnreadLetterCount(),
}));

const mockUseOpenLiveInvite = vi.fn();
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({
  useOpenLiveInvite: () => mockUseOpenLiveInvite(),
}));

const mockUsePendingPartnerInvitationCount = vi.fn();
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({
  usePendingPartnerInvitationCount: () => mockUsePendingPartnerInvitationCount(),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: {
    track: vi.fn(),
  },
}));

import { BottomNav } from '@/app/components/layout/bottom-nav';
import { SimpleNavigation } from '@/app/components/layout/simple-navigation';

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
  avatarColor: '#10b981',
  ...overrides,
});

function mockLoggedIn({ slug = 'test-user' as string | null } = {}) {
  const user = createMockUser({ slug });
  mockUseAuth.mockReturnValue({
    session: { user: { id: user.id } },
    user,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  });
  mockUseNavAuthState.mockReturnValue({
    showUserMenu: true,
    showPublicCTAs: false,
    user,
    hasPledged: false,
    slug,
    signOut: vi.fn(),
    isLoading: false,
    sessionChecked: true,
    hasSession: true,
  });
}

function mockLoggedOut() {
  mockUseAuth.mockReturnValue({
    session: null,
    user: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  });
  mockUseNavAuthState.mockReturnValue({
    showUserMenu: false,
    showPublicCTAs: true,
    user: null,
    hasPledged: false,
    slug: null,
    signOut: vi.fn(),
    isLoading: false,
    sessionChecked: true,
    hasSession: false,
  });
}

function renderBottomNav(route = '/feed') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav />
    </MemoryRouter>
  );
}

function bottomNavLabels() {
  const nav = screen.getByRole('navigation', { name: /mobile navigation/i });
  return Array.from(nav.querySelectorAll('a span:not(.relative):not([data-badge])'))
    .map((el) => el.textContent)
    .filter((t): t is string => !!t && t !== '99+' && !/^\d+$/.test(t));
}

function partnersLink() {
  return screen.getByRole('link', { name: /partners/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLiveSession.mockReturnValue({ isLive: false });
  mockUseUnreadLetterCount.mockReturnValue({ count: 0, loading: false });
  mockUseOpenLiveInvite.mockReturnValue({ invite: null, loading: false });
  mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 0, loading: false });
});

// ============================================================================
// Mobile bottom nav
// ============================================================================

describe('P885 — BottomNav Partners item', () => {
  it('shows 5 items in order: Home, Letters, Partners, Groups, My Profile', () => {
    mockLoggedIn();
    renderBottomNav();
    // P1193: the 4th item is "Groups" (→ /groups) since the Clarity Group rename.
    expect(bottomNavLabels()).toEqual(['Home', 'Letters', 'Partners', 'Groups', 'My Profile']);
  });

  it('Partners links to /p/{slug}/partners', () => {
    mockLoggedIn();
    renderBottomNav();
    expect(partnersLink()).toHaveAttribute('href', '/p/test-user/partners');
  });

  it('Partners tab shows active state on its route', () => {
    mockLoggedIn();
    renderBottomNav('/p/test-user/partners');
    expect(partnersLink()).toHaveAttribute('aria-current', 'page');
  });

  it('Partners tab is NOT active on other routes', () => {
    mockLoggedIn();
    renderBottomNav('/feed');
    expect(partnersLink()).not.toHaveAttribute('aria-current');
  });

  it('hides the badge when invitation count is 0', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 0, loading: false });
    renderBottomNav();
    expect(partnersLink().querySelector('[data-badge]')).toBeNull();
  });

  it('shows the invitation count in a badge when > 0', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 3, loading: false });
    renderBottomNav();
    const badge = partnersLink().querySelector('[data-badge]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('3');
    // Identical style to Letters badge: blue pill, white text
    expect(badge!.className).toMatch(/bg-blue-500/);
    expect(badge!.className).toMatch(/text-white/);
  });

  it('caps the badge at 99+', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 150, loading: false });
    renderBottomNav();
    expect(partnersLink().querySelector('[data-badge]')!.textContent).toBe('99+');
  });

  it('partner invitations do NOT leak into the Letters badge', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 5, loading: false });
    renderBottomNav();
    const letters = screen.getByRole('link', { name: /letters/i });
    expect(letters.querySelector('[data-badge]')).toBeNull();
  });

  it('renders nothing for logged-out users', () => {
    mockLoggedOut();
    renderBottomNav();
    expect(screen.queryByRole('navigation', { name: /mobile navigation/i })).toBeNull();
  });

  it('omits the Partners item when the user has no slug (no broken link)', () => {
    mockLoggedIn({ slug: null });
    renderBottomNav();
    expect(screen.queryByRole('link', { name: /partners/i })).toBeNull();
    // Other items still render
    expect(screen.getByRole('link', { name: /letters/i })).toBeInTheDocument();
  });
});

// ============================================================================
// Desktop nav
// ============================================================================

describe('P885 — Desktop nav Partners entry', () => {
  it('shows Partners between Letters and Events for logged-in users, linking to the partners page', () => {
    mockLoggedIn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <SimpleNavigation />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /^partners$/i });
    expect(link).toHaveAttribute('href', '/p/test-user/partners');
  });

  it('shows the invitation badge on the desktop Partners entry', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 2, loading: false });
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <SimpleNavigation />
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /partners/i });
    const badge = link.querySelector('[data-badge]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('2');
  });

  it('shows active state (text-primary) on Partners — not on My Profile — on the partners route', () => {
    mockLoggedIn();
    render(
      <MemoryRouter initialEntries={['/p/test-user/partners']}>
        <SimpleNavigation />
      </MemoryRouter>
    );
    const partners = screen.getByRole('link', { name: /^partners$/i });
    expect(partners.className).toMatch(/text-primary/);
    const myProfile = screen.getByRole('link', { name: /my profile/i });
    expect(myProfile.className).not.toMatch(/text-primary/);
  });

  it('does NOT show a visible Partners nav entry for logged-out users', () => {
    mockLoggedOut();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <SimpleNavigation />
      </MemoryRouter>
    );
    // Logged-out nav has Events/Blog links and a dropdown — no Partners icon link.
    // (The "Pledgers" dropdown item is a different concept and stays untouched.)
    expect(screen.queryByRole('link', { name: /^partners$/i })).toBeNull();
  });
});
