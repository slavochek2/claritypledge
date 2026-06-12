/**
 * @file p932-completion-nav.test.tsx
 * @description P932: a completed letter (?done=1) leaves immersive mode so the app
 * menus return — the receiver can be directed onward (co-located facilitation hand-back).
 *
 * Under test (BottomNav route logic):
 * - /letter/:id            (reading)   → bottom nav HIDDEN (immersive focus route)
 * - /letter/:id?done=1     (complete)  → bottom nav SHOWN  (immersive mode exited)
 * - /letters/drafts/:id?done=1         → still HIDDEN (done exemption is /letter/-only)
 *
 * This exercises both sides of the gate (epistemic.md #7): the flag must FLIP the nav,
 * not just be present on the happy path.
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

const navQuery = () =>
  screen.queryByRole('navigation', { name: /mobile navigation/i });

describe('P932 — bottom nav on completed letter', () => {
  it('HIDES the bottom nav while reading a letter (/letter/:id, no ?done)', () => {
    renderAt('/letter/abc123');
    expect(navQuery()).toBeNull();
  });

  it('SHOWS the bottom nav once the letter is complete (/letter/:id?done=1)', () => {
    renderAt('/letter/abc123?done=1');
    expect(navQuery()).toBeInTheDocument();
  });

  it('keeps OTHER focus routes hidden even with ?done=1 (exemption is /letter/-only)', () => {
    renderAt('/letters/drafts/abc123?done=1');
    expect(navQuery()).toBeNull();
  });

  it('still hides for logged-out users on a completed letter', () => {
    mockUseNavAuthState.mockReturnValue({ showUserMenu: false, slug: null });
    renderAt('/letter/abc123?done=1');
    expect(navQuery()).toBeNull();
  });
});
