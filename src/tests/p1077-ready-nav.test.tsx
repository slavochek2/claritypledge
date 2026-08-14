/**
 * @file p1077-ready-nav.test.tsx
 * @description P1077: /ready is a FOCUS route, same as /meet (p1024-meet-nav.test.tsx,
 * whose pattern this mirrors). It's a single-focus surface — one question, one action —
 * so the bottom nav's browse affordances shouldn't render on top of it.
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

describe('P1077 — /ready is a focus route', () => {
  it('HIDES the bottom nav on /ready, so nothing covers the sticky Continue bar', () => {
    renderAt('/ready');
    expect(navQuery()).toBeNull();
  });

  it('hides it with a trailing slash too', () => {
    renderAt('/ready/');
    expect(navQuery()).toBeNull();
  });

  it('SHOWS the bottom nav on an ordinary browse route — the gate flips', () => {
    renderAt('/feed');
    expect(navQuery()).toBeInTheDocument();
  });
});
