/**
 * @file p1024-meet-nav.test.tsx
 * @description P1024: /meet must stay a FOCUS route after the rename from /terms.
 *
 * The page carries its own sticky action bar at z-40 holding the only buttons on the
 * screen — Opt in / Opt out, then Start meeting. BottomNav is fixed at z-50, so if the
 * route pattern in bottom-nav.tsx still matched the old `/terms`, the mobile nav would
 * render directly on top of them.
 *
 * Why this is a unit test and not an E2E assertion: BottomNav returns null unless
 * `showUserMenu` is true (verified user, profile loaded), and the P1024 E2E suite runs
 * signed out on purpose. A signed-out "the nav is absent" check passes whether the
 * route pattern is right or wrong — measured, not assumed: with the pattern left at
 * `/terms`, the signed-out E2E check still passed. Mocking the auth state is the only
 * way to exercise the gate rather than the auth guard in front of it (epistemic.md #7).
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseNavAuthState = vi.fn();
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => mockUseNavAuthState(),
}));

const mockUseLiveSession = vi.fn();
vi.mock('@/app/contexts/live-session-context', () => ({
  useLiveSession: () => mockUseLiveSession(),
}));

vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0 }),
}));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({
  useOpenLiveInvite: () => ({ invite: null }),
}));
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({
  usePendingPartnerInvitationCount: () => ({ count: 0 }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

import { BottomNav } from '@/app/components/layout/bottom-nav';

beforeEach(() => {
  vi.clearAllMocks();
  mockUseLiveSession.mockReturnValue({ isLive: false });
  mockUseNavAuthState.mockReturnValue({ showUserMenu: true, slug: 'test-user' });
});

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <BottomNav />
    </MemoryRouter>
  );
}

const navQuery = () => screen.queryByRole('navigation', { name: /mobile navigation/i });

describe('P1024 — /meet is a focus route', () => {
  it('HIDES the bottom nav on /meet, so nothing covers the sticky action bar', () => {
    renderAt('/meet');
    expect(navQuery()).toBeNull();
  });

  it('hides it with a trailing slash too', () => {
    renderAt('/meet/');
    expect(navQuery()).toBeNull();
  });

  it('SHOWS the bottom nav on an ordinary browse route — the gate flips', () => {
    // Both sides of the gate. Without this, a pattern that matched everything would
    // pass the assertions above while breaking every other page in the app.
    renderAt('/feed');
    expect(navQuery()).toBeInTheDocument();
  });

  it('SHOWS it on the retired /terms path — the exemption moved, it was not duplicated', () => {
    // This is the assertion that would have caught the stale pattern: leaving
    // bottom-nav.tsx matching `/terms` after the route moved makes THIS pass while
    // the /meet case above fails. /terms is no longer a route at all, so a user
    // reaching it gets a 404 shell — with the normal app chrome, not a focus layout.
    renderAt('/terms');
    expect(navQuery()).toBeInTheDocument();
  });

  it('still shows the legal terms-of-service page as a normal browse page', () => {
    // The exact-match pattern exists so `/meet` never swallows a sibling the way a
    // prefix `/terms` entry would have swallowed `/terms-of-service`.
    renderAt('/terms-of-service');
    expect(navQuery()).toBeInTheDocument();
  });
});
