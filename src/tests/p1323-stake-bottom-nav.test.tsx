/**
 * @file p1323-stake-bottom-nav.test.tsx
 * @description P1323: /stake/:tag is a FOCUS route on phones, matching desktop.
 *
 * Founder, 2026-09-16: "on mobile we are showing My Profile, Groups, Partners, Letters, Home
 * ... for example /stake ... but on desktop we don't." Measured signed in: /stake/:tag was the
 * one room-flow page where the two disagreed — desktop renders it `compact` (no tab row), the
 * phone rendered the full bottom nav under the points. It is the page attendees land on from a
 * room ("Links -> cmp7"), so it follows the room pages' rule: focused on every device. Back,
 * the logo and the Links trigger (P1323 R2) still reach everything.
 *
 * Mirrors p1077-ready-nav.test.tsx. The pattern is EXACT on purpose: /stake is the only page
 * shape affected, and nothing like /stakeholders may be swallowed by a prefix.
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

describe('P1323 — /stake/:tag is a focus route on phones', () => {
  it.each(['/stake/understanding', '/stake/cmp7/', '/stake/cmp7?event=cm-1'])('HIDES the bottom nav on %s', (route) => {
    renderAt(route);
    expect(navQuery()).toBeNull();
  });

  it.each(['/stakeholders', '/stake', '/stake/cmp7/extra'])('does NOT swallow a different path: %s still shows it', (route) => {
    renderAt(route);
    expect(navQuery()).toBeInTheDocument();
  });

  it('SHOWS the bottom nav on an ordinary browse route — the gate flips', () => {
    renderAt('/feed');
    expect(navQuery()).toBeInTheDocument();
  });
});
