/**
 * @file p1539-loading.test.tsx
 * @description P1539 — signed-in loading: no legal footer on /home* or while auth is pending, collapsed rail
 * shows nav icons plus avatar, the in-shell loader is not min-h-screen, the offline strip spans the sidebar.
 */
import { render, screen, within } from '@testing-library/react';
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
