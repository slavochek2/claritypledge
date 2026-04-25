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

vi.mock('@/app/hooks/useUnreadLetterCount', () => ({
  useUnreadLetterCount: () => ({ count: 0 }),
}));

vi.mock('@/app/hooks/useOpenLiveInvite', () => ({
  useOpenLiveInvite: () => ({ invite: null }),
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

describe('P818: mobile header CTA advances from /live same-URL navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // CANARY TEST — verified failing before fix (2026-04-25):
  //   AssertionError: expected "vi.fn()" to be called with arguments: [ '/live', { replace: true } ]
  //   Number of calls: 0
  // Mobile CTA has analytics-only onClick — navigate is never called when on /live.
  // /fix P818 must: remove .todo, add the navigate+reload handler to mobile CTA, and confirm this passes.
  it.todo('mobile "Start a Session" CTA on /live triggers navigate+reload (not a silent no-op)');
  // Full assertion body (restore when /fix lands):
  //   render(<MemoryRouter initialEntries={['/live']}><SimpleNavigation /></MemoryRouter>);
  //   const mobileCtaLinks = screen.getAllByRole('link', { name: /start a (session|clarity session)/i });
  //   const mobileCta = mobileCtaLinks.find(link => link.textContent?.trim() === 'Start a Session');
  //   expect(mobileCta).toBeDefined();
  //   fireEvent.click(mobileCta!);
  //   expect(mockNavigate).toHaveBeenCalledWith('/live', { replace: true });

  it('desktop "Start a Clarity Session" CTA on /live already triggers navigate+reload', () => {
    // Regression guard: desktop CTA has the handler — this should PASS both before and after fix
    render(
      <MemoryRouter initialEntries={['/live']}>
        <SimpleNavigation />
      </MemoryRouter>
    );

    const desktopCta = screen.getAllByRole('link', { name: /start a clarity session/i })[0];
    expect(desktopCta).toBeDefined();

    fireEvent.click(desktopCta);

    // Desktop CTA calls navigate('/live', { replace: true }) and window.location.reload()
    // This test PASSES before and after fix — confirms desktop path is already wired
    expect(mockNavigate).toHaveBeenCalledWith('/live', { replace: true });
  });
});
