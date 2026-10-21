/**
 * @file p1539-loading.test.tsx
 * @description P1539 — signed-in loading: no legal footer on /home* or while auth is pending, collapsed rail
 * shows nav icons plus avatar, the in-shell loader is not min-h-screen, the offline strip spans the sidebar.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventBySlug: vi.fn(async () => ({ links: [] })), getUpcomingEvents: vi.fn(async () => []) },
}));
vi.mock('@/app/contexts/live-session-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/live-session-context')>()),
  useLiveSession: () => ({
    isLive: false,
    activeSessionCode: null,
    activeSessionPartnerName: null,
    activeSessionRole: null,
    activeSessionGuestDisplayName: null,
    setActiveSession: vi.fn(),
    clearActiveSession: vi.fn(),
  }),
}));

let mockStripShown = false;
vi.mock('@/app/contexts/offline-status-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/contexts/offline-status-context')>()),
  useOfflineStripText: () => (mockStripShown ? 'Offline' : null),
  useOfflineStripShown: () => mockStripShown,
}));

let mockStoredSession: string | null = null;
vi.mock('@/lib/offline-read-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/offline-read-cache')>()),
  storedSessionUserId: () => mockStoredSession,
}));

const mockUnread = vi.fn();
vi.mock('@/app/hooks/useUnreadLetterCount', () => ({ useUnreadLetterCount: () => mockUnread() }));
const mockPartnerCount = vi.fn();
vi.mock('@/app/hooks/usePendingPartnerInvitationCount', () => ({
  usePendingPartnerInvitationCount: () => mockPartnerCount(),
}));
vi.mock('@/app/hooks/useOpenLiveInvite', () => ({ useOpenLiveInvite: () => ({ invite: null, loading: false }) }));

const mockTonight = vi.fn();
vi.mock('@/app/hooks/useTonightsEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/hooks/useTonightsEvent')>()),
  useTonightsEvent: () => mockTonight(),
}));

import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { resetLoaderChainForTests } from '@/components/ui/loader-chain';
import { BottomNav } from '@/app/components/layout/bottom-nav';
import { InShellContentContext } from '@/components/ui/loader-context';
import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';

const signedIn = {
  session: { user: { id: 'u1' } },
  user: { id: 'u1', slug: 'ada', name: 'Ada', isVerified: true, hasPledged: false, avatarColor: '#10b981' },
  isLoading: false,
  sessionChecked: true,
  signOut: vi.fn(),
  refreshProfile: vi.fn(),
};
const signedOut = { ...signedIn, session: null, user: null };
const restoring = { ...signedIn, session: null, user: null, isLoading: true, sessionChecked: false };

const SIDEBAR_KEY = 'clarity-sidebar-collapsed';

function renderLayout(route: string, props: { compact?: boolean; surface?: 'product' | 'public' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ClarityLandingLayout surface={props.surface ?? 'product'} compact={props.compact}>
        <div>page body</div>
      </ClarityLandingLayout>
    </MemoryRouter>,
  );
}

const sidebar = (c: HTMLElement) => c.querySelector('[data-nav="sidebar"]') as HTMLElement | null;

beforeEach(() => {
  vi.clearAllMocks();
  mockStripShown = false;
  mockStoredSession = null;
  resetLoaderChainForTests();
  localStorage.clear();
  mockUseAuth.mockReturnValue(signedIn);
  mockUnread.mockReturnValue({ count: 0, loading: false });
  mockPartnerCount.mockReturnValue({ count: 0, loading: false });
  mockTonight.mockReturnValue(null);
});

const footerLink = () => screen.queryByRole('link', { name: /privacy/i });

describe('P1539 footer', () => {
  it('is not rendered on /home, /home/c/:id for a signed-in person', () => {
    for (const route of ['/home', '/home/c/abc']) {
      const { unmount } = renderLayout(route);
      expect(footerLink()).toBeNull();
      unmount();
    }
  });

  it('is not rendered on /home* while auth is still resolving', () => {
    mockUseAuth.mockReturnValue(restoring);
    renderLayout('/home/c/abc');
    expect(footerLink()).toBeNull();
  });

  it('is not rendered on a shared route while auth is pending, and appears for a signed-out visitor once settled', () => {
    mockUseAuth.mockReturnValue(restoring);
    const pending = renderLayout('/pricing', { surface: 'public' });
    expect(footerLink()).toBeNull();
    pending.unmount();
    mockUseAuth.mockReturnValue(signedOut);
    renderLayout('/pricing', { surface: 'public' });
    expect(footerLink()).not.toBeNull();
  });
});

describe('P1539 collapsed rail', () => {
  it('shows every nav destination as a labelled icon link plus the avatar, same order as expanded', () => {
    localStorage.setItem(SIDEBAR_KEY, '1');
    const { container } = renderLayout('/feed');
    const bar = sidebar(container)!;
    expect(bar.getAttribute('data-collapsed')).toBe('true');
    const menu = within(bar).getByRole('list', { name: 'Menu' });
    const labels = Array.from(menu.querySelectorAll('a')).map(a => a.getAttribute('aria-label'));
    expect(labels).toEqual(['Home', 'Feed', 'Groups', 'Letters', 'Events', 'Partners', 'My Profile']);
    expect(within(bar).getByTestId('rail-avatar')).toBeTruthy();
  });
});

describe('P1539 content loader', () => {
  it('is not min-h-screen inside the shell, and the boot splash outside it still is', () => {
    const inShell = render(
      <InShellContentContext.Provider value><ClarityPageLoader /></InShellContentContext.Provider>,
    );
    const el = inShell.getByTestId('content-loader');
    expect(el.className).not.toContain('min-h-screen');
    expect(el.className).toContain('flex-1');
    inShell.unmount();
    const boot = render(<ClarityPageLoader />);
    expect(boot.container.firstElementChild!.className).toContain('min-h-screen');
  });
});

describe('P1539 offline strip', () => {
  it('is pulled left over the sidebar column and the sidebar starts below it', () => {
    mockStripShown = true;
    const { container } = renderLayout('/feed');
    const strip = screen.getByTestId('offline-strip');
    expect(strip.className).toContain('lg:-ml-[248px]');
    expect(sidebar(container)!.className).toContain('lg:top-7');
  });

  it('collapsed sidebar: the strip pulls back by the rail width', () => {
    mockStripShown = true;
    localStorage.setItem(SIDEBAR_KEY, '1');
    renderLayout('/feed');
    expect(screen.getByTestId('offline-strip').className).toContain('lg:-ml-16');
  });

  it('online: no strip and the sidebar stays at the top', () => {
    const { container } = renderLayout('/feed');
    expect(screen.queryByTestId('offline-strip')).toBeNull();
    expect(sidebar(container)!.className).not.toContain('lg:top-7');
  });
});


describe('P1539 collapsed rail tooltips', () => {
  const NAV = ['Home', 'Feed', 'Groups', 'Letters', 'Events', 'Partners', 'My Profile'];

  // A fresh rail per control (one test each, so each stays well inside the timeout under load):
  // each one must open on its own first hover, not ride on a neighbour's open tooltip.
  const targets: Array<[string, (bar: HTMLElement) => HTMLElement, string]> = [
    ['expand toggle', bar => within(bar).getByTestId('sidebar-toggle'), 'Expand sidebar'],
    ...NAV.map((label): [string, (bar: HTMLElement) => HTMLElement, string] => [label, bar => within(bar).getByRole('link', { name: label }), label]),
    ['Tools', bar => within(bar).getByTestId('event-links-button'), 'Tools'],
    ['avatar', bar => within(bar).getByTestId('rail-avatar'), 'Ada'],
  ];
  it.each(targets)('hover opens a tooltip with the label on the rail control: %s', async (_name, find, label) => {
    localStorage.setItem(SIDEBAR_KEY, '1');
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    await user.hover(find(sidebar(container)!));
    const tip = await screen.findByRole('tooltip', undefined, { timeout: 2000 });
    expect(tip.textContent).toBe(label);
  });

  it('keyboard focus opens the tooltip too', async () => {
    localStorage.setItem(SIDEBAR_KEY, '1');
    const { container } = renderLayout('/feed');
    const bar = sidebar(container)!;
    within(bar).getByRole('link', { name: 'Letters' }).focus();
    const tip = await screen.findByRole('tooltip');
    expect(tip.textContent).toBe('Letters');
  });

  it('the avatar focus ring is round (rounded-full), not a rounded square', () => {
    localStorage.setItem(SIDEBAR_KEY, '1');
    const { container } = renderLayout('/feed');
    const avatar = within(sidebar(container)!).getByTestId('rail-avatar');
    expect(avatar.className).toContain('rounded-full');
    expect(avatar.className).not.toContain('rounded-lg');
  });
});

describe('P1539 phone bottom bar', () => {
  it('the You tab placeholder is drawn at final weight: no pulse, no fade, avatar-sized disc', () => {
    mockUseAuth.mockReturnValue({ ...signedIn, user: null, isLoading: true });
    localStorage.setItem('cp:nav-verified:u1', '1');
    render(<MemoryRouter initialEntries={['/feed']}><BottomNav /></MemoryRouter>);
    const slot = document.querySelector('[data-nav-slot-placeholder="You"]') as HTMLElement;
    expect(slot).toBeTruthy();
    expect(slot.className).not.toContain('animate-pulse');
    expect(slot.className).not.toContain('opacity-50');
    expect(slot.querySelector('.h-5.w-5.rounded-full')).toBeTruthy();
  });
});

describe('P1539 loader hand-off', () => {
  it('a loader that replaces another continues its fade instead of restarting', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    const first = render(<ClarityPageLoader />);
    expect(first.container.firstElementChild!.getAttribute('style')).toBeNull();
    now.mockReturnValue(1800);
    // Second loader mounts while the first is still mounted (a Suspense fallback replacing a guard loader).
    const second = render(<ClarityPageLoader />);
    expect(second.container.firstElementChild!.getAttribute('style')).toContain('--loader-elapsed: 800ms');
    // Swap: the first unmounts, a third arrives a frame later: still the same run.
    first.unmount();
    second.unmount();
    now.mockReturnValue(1860);
    const third = render(<ClarityPageLoader />);
    expect(third.container.firstElementChild!.getAttribute('style')).toContain('--loader-elapsed: 860ms');
    third.unmount();
    // A load that starts well after the previous run ended is a fresh run with the full anti-flash delay.
    now.mockReturnValue(5000);
    const fresh = render(<ClarityPageLoader />);
    expect(fresh.container.firstElementChild!.getAttribute('style')).toBeNull();
    now.mockRestore();
  });
});

describe('P1539 pre-shell loader position', () => {
  it('a stored session with no verified hint reserves the shell geometry: the loader is the in-content one, in the padded column, no sidebar drawn', () => {
    mockStoredSession = 'u1';
    mockUseAuth.mockReturnValue(restoring);
    const { container } = render(
      <MemoryRouter initialEntries={['/home']}>
        <ClarityLandingLayout surface="product"><ClarityPageLoader /></ClarityLandingLayout>
      </MemoryRouter>,
    );
    expect(screen.getByTestId('content-loader')).toBeTruthy();
    expect(sidebar(container)).toBeNull();
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
    expect((screen.getByTestId('content-loader').closest('div.flex.flex-col') as HTMLElement).className).toContain('lg:pl-[248px]');
  });

  it('no stored session: still the full-viewport boot splash (nothing to expect)', () => {
    mockUseAuth.mockReturnValue(restoring);
    render(
      <MemoryRouter initialEntries={['/home']}>
        <ClarityLandingLayout surface="product"><ClarityPageLoader /></ClarityLandingLayout>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('content-loader')).toBeNull();
  });
});
