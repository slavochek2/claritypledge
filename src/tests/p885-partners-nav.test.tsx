/**
 * @file p885-partners-nav.test.tsx
 * @description P885: "Partners" navigation item with invitation badge.
 *
 * UI Contract under test:
 * - Mobile bottom nav (logged-in): P1512 — 5 tabs: Home, Feed, Groups, Letters, Me. Partners moved
 *   behind Me (the sheet), and the Me tab carries the pending-invite count so it is not hidden.
 * - Partners links to /p/{slug}/partners; active state on that route
 * - Badge: blue pill, hidden at 0, "99+" cap — identical to Letters badge
 * - Desktop logged-in nav shows a Partners entry linking to the same page
 * - Logged-out users never see Partners
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
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
  return Array.from(nav.querySelectorAll('a, button'))
    .map((el) => el.querySelector('span.text-xs')?.textContent)
    .filter((t): t is string => !!t);
}

/** P1512: Partners lives in the Me sheet on the phone. */
function openMeSheet() {
  fireEvent.click(screen.getByTestId('bottom-nav-me'));
  return within(screen.getByTestId('me-sheet'));
}

function partnersLink() {
  return openMeSheet().getByRole('link', { name: /partners/i });
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

describe('P885 — BottomNav Partners item (P1512: behind the Me tab)', () => {
  it('shows 5 tabs in order: Home, Feed, Groups, Letters, Me', () => {
    mockLoggedIn();
    renderBottomNav();
    expect(bottomNavLabels()).toEqual(['Home', 'Feed', 'Groups', 'Letters', 'Me']);
  });

  it('Partners is no longer a tab of its own', () => {
    mockLoggedIn();
    renderBottomNav();
    expect(screen.queryByRole('link', { name: /partners/i })).toBeNull();
  });

  it('Partners (in the Me sheet) links to /p/{slug}/partners', () => {
    mockLoggedIn();
    renderBottomNav();
    expect(partnersLink()).toHaveAttribute('href', '/p/test-user/partners');
  });

  it('Partners shows active state on its route', () => {
    mockLoggedIn();
    renderBottomNav('/p/test-user/partners');
    expect(partnersLink()).toHaveAttribute('aria-current', 'page');
  });

  it('Partners is NOT active on other routes', () => {
    mockLoggedIn();
    renderBottomNav('/feed');
    expect(partnersLink()).not.toHaveAttribute('aria-current');
  });

  it('hides the badge when invitation count is 0 (sheet row and Me tab)', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 0, loading: false });
    renderBottomNav();
    expect(screen.getByTestId('bottom-nav-me').querySelector('[data-badge]')).toBeNull();
    expect(partnersLink().querySelector('[data-badge]')).toBeNull();
  });

  it('shows the invitation count in a badge when > 0, on the sheet row and on the Me tab', () => {
    mockLoggedIn();
    mockUsePendingPartnerInvitationCount.mockReturnValue({ count: 3, loading: false });
    renderBottomNav();
    // The Me tab carries the count so a pending invite is visible without opening the sheet.
    expect(screen.getByTestId('bottom-nav-me').querySelector('[data-badge]')!.textContent).toBe('3');
    expect(screen.getByTestId('bottom-nav-me')).toHaveAttribute('aria-label', 'Me, 3 pending invitations');
    const badge = partnersLink().querySelector('[data-badge]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('3');
    // Same style as the Letters badge: blue pill, white text
    expect(badge!.className).toMatch(/bg-blue-600/);
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
    const sheet = openMeSheet();
    expect(sheet.queryByRole('link', { name: /partners/i })).toBeNull();
    // Other items still render. The Me sheet is a modal dialog now (P1512 item 22), so the bar behind it is
    // hidden from the accessibility tree while it is open: look for the link with hidden content included.
    expect(screen.getByRole('link', { name: /letters/i, hidden: true })).toBeInTheDocument();
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
