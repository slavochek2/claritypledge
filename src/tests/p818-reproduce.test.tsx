/**
 * @file p818-reproduce.test.tsx
 * @description Canary test for P818: Header "Start a Session" CTA does nothing
 * in post-disconnect state on /live.
 *
 * Bug: The mobile header CTA (<Link to="/live"> with analytics-only onClick) has no
 * navigation-with-reset handler. When already on /live, clicking the link is a
 * same-URL React Router navigation — the component does not remount, so
 * post-disconnect state (partnerLeft, sessionEnded) persists.
 *
 * User-visible symptom: clicking the blue "Start a Session" header button while
 * in post-disconnect state does nothing — the screen stays unchanged.
 *
 * This test MUST FAIL before the fix and PASS after.
 * It asserts the EXPECTED behavior: clicking the mobile header CTA while on /live
 * triggers navigate('/live', { replace: true }) and window.location.reload() —
 * the same fallback the desktop CTA uses. Currently the mobile CTA does neither.
 *
 * After the full fix (Option A in spec), it should call a state-reset callback
 * instead of reloading — but the minimum bar is: it must not be a silent no-op.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Router mock — must be hoisted before SimpleNavigation import ──
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── Auth hook ──
vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => ({
    showUserMenu: true,                        // logged-in state: shows nav CTA
    user: { name: 'P818User', avatarColor: '#000', avatarUrl: null },
    hasPledged: false,
    slug: 'p818user',
    signOut: vi.fn(),
    isLoading: false,
    sessionChecked: true,
    hasSession: true,
  }),
}));

vi.mock('@/app/hooks/useTonightsEvent', () => ({ useTonightsEvent: () => null }));

vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0 }),
}));

vi.mock('@/app/hooks/useOpenLiveInvite', () => ({
  useOpenLiveInvite: () => ({ invite: null }),
}));

// P885: SimpleNavigation now renders a Partners nav entry with an invitation-count
// badge; mock the count hook (it calls useAuth, and these tests render without an
// AuthProvider). Same rationale as the useUnreadLetterCount mock above.
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({
  usePendingPartnerInvitationCount: () => ({ count: 0, loading: false }),
}));

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

// NavigationMenuItems renders complex subcomponents — stub it out
vi.mock('@/app/components/layout/navigation-menu-items', () => ({
  NavigationMenuItems: () => null,
}));

vi.mock('@/components/ui/gravatar-avatar', () => ({
  GravatarAvatar: ({ name }: { name: string }) => <span data-testid="avatar">{name}</span>,
}));

vi.mock('@/components/ui/clarity-logo', () => ({
  ClarityLogo: () => <span data-testid="logo">ClarityPledge</span>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { SimpleNavigation } from '@/app/components/layout/simple-navigation';

// Stub window.location.reload — jsdom doesn't implement it
const reloadMock = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload: reloadMock },
  writable: true,
});

import { EventLinksMenu, EventLinksButton } from '@/app/components/layout/event-links-menu';

/*
 * P1351 retired every header "Start a Clarity Session" button — the route to /live now lives
 * in the Tools menu. P818's rule moves with it: choosing that entry while ALREADY on /live must
 * reset the page (navigate replace + reload), never be a silent same-URL no-op.
 */
describe('P818 (via P1351): Tools → Start a Clarity Session on /live is not a silent no-op', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the header renders no session button on /live anymore', () => {
    render(<MemoryRouter initialEntries={['/live']}><SimpleNavigation /></MemoryRouter>);
    expect(screen.queryAllByRole('link', { name: /start a (session|clarity session)/i })).toHaveLength(0);
  });

  it('the Tools entry on /live triggers navigate+reload', () => {
    render(
      <MemoryRouter initialEntries={['/live']}>
        <EventLinksMenu enabled><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('event-links-button'));
    const entry = screen.getAllByTestId('event-links-entry').find(e => e.textContent === 'Start a Clarity Session');
    expect(entry).toBeDefined();
    fireEvent.click(entry!);
    expect(mockNavigate).toHaveBeenCalledWith('/live', { replace: true });
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('control: the same entry from another page navigates normally, no reload', () => {
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <EventLinksMenu enabled><EventLinksButton /></EventLinksMenu>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByTestId('event-links-button'));
    const entry = screen.getAllByTestId('event-links-entry').find(e => e.textContent === 'Start a Clarity Session');
    fireEvent.click(entry!);
    expect(mockNavigate).toHaveBeenCalledWith('/live');
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
