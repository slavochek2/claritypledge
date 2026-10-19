/**
 * @file p1512-shell.test.tsx
 * @description P1512 section A — the signed-in shell: a sidebar (desktop) and bottom bar (phone)
 * that replace the top nav for a signed-in person, so each route shows exactly one navigation.
 * Signed-out chrome and the routes that keep their own chrome (/live, compact rooms) are unchanged.
 */
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
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

import { ClarityLandingLayout } from '@/app/layouts/clarity-landing-layout';
import { HomeRedirect, HomeRoute } from '@/app/routes/home-redirect';
import { isShellEntryActive } from '@/app/components/layout/app-shell/shell-nav';

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
const topNav = (c: HTMLElement) => c.querySelector('[data-nav="main"]');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockUseAuth.mockReturnValue(signedIn);
  mockUnread.mockReturnValue({ count: 0, loading: false });
  mockPartnerCount.mockReturnValue({ count: 0, loading: false });
  mockTonight.mockReturnValue(null);
});

describe('P1512 shell — signed-in desktop sidebar', () => {
  it('lists exactly Home, Feed, Groups, Letters, Events, Partners, Tools, My Profile and no Search', () => {
    const { container } = renderLayout('/feed');
    const bar = sidebar(container)!;
    expect(bar).not.toBeNull();
    const menu = within(bar).getByRole('list', { name: 'Menu' });
    const labels = Array.from(menu.querySelectorAll('li')).map(li => li.textContent?.trim());
    expect(labels).toEqual(['Home', 'Feed', 'Groups', 'Letters', 'Events', 'Partners', 'Tools', 'My Profile']);
    expect(within(bar).queryByText(/search/i)).toBeNull();
  });

  it('points each entry at its live route', () => {
    const { container } = renderLayout('/feed');
    const bar = within(sidebar(container)!);
    const hrefOf = (name: RegExp) => bar.getByRole('link', { name }).getAttribute('href');
    expect(hrefOf(/^home$/i)).toBe('/home');
    expect(hrefOf(/^feed$/i)).toBe('/feed');
    expect(hrefOf(/^groups$/i)).toBe('/groups');
    expect(hrefOf(/^letters$/i)).toBe('/letters');
    expect(hrefOf(/^events$/i)).toBe('/events/list');
    expect(hrefOf(/^partners$/i)).toBe('/p/ada/partners');
    expect(hrefOf(/^my profile$/i)).toBe('/p/ada');
  });

  it('marks only the current entry with aria-current', () => {
    const { container } = renderLayout('/letters');
    const current = Array.from(sidebar(container)!.querySelectorAll('[aria-current="page"]'));
    expect(current.map(el => el.textContent?.trim())).toEqual(['Letters']);
  });

  it('shows the Letters and Partners badges', () => {
    mockUnread.mockReturnValue({ count: 4, loading: false });
    mockPartnerCount.mockReturnValue({ count: 2, loading: false });
    const { container } = renderLayout('/feed');
    const bar = within(sidebar(container)!);
    expect(bar.getByRole('link', { name: 'Letters, 4 unread' }).querySelector('[data-badge]')!.textContent).toBe('4');
    expect(bar.getByRole('link', { name: 'Partners, 2 pending invitations' }).querySelector('[data-badge]')!.textContent).toBe('2');
  });

  it('opens the same Tools menu the top nav opened (one event-links trigger on desktop)', () => {
    const { container } = renderLayout('/feed');
    const tools = within(sidebar(container)!).getByTestId('event-links-button');
    expect(tools).toHaveTextContent('Tools');
    expect(screen.getAllByTestId('event-links-button')).toHaveLength(1);
  });

  it('keeps the avatar menu at the bottom', () => {
    const { container } = renderLayout('/feed');
    expect(within(sidebar(container)!).getByRole('button', { name: 'Menu' })).toBeInTheDocument();
  });

  it('shows Today\'s event above the menu when there is one, and not otherwise', () => {
    const { container, unmount } = renderLayout('/feed');
    expect(within(sidebar(container)!).queryByTestId('tonights-event-cta')).toBeNull();
    unmount();

    mockTonight.mockReturnValue({
      slug: 'night-1',
      title: 'Clarity Night',
      datetime: new Date().toISOString(),
      durationMinutes: 120,
      preparationEnabled: false,
      registered: true,
    });
    const second = renderLayout('/feed');
    expect(within(sidebar(second.container)!).getByTestId('tonights-event-cta')).toHaveTextContent("Today's event");
  });
});

describe('P1512 shell — one navigation per route', () => {
  it('signed in: the sidebar replaces the top nav', () => {
    const { container } = renderLayout('/feed');
    expect(sidebar(container)).not.toBeNull();
    expect(topNav(container)).toBeNull();
  });

  it('signed in on a public-surface route: the same shell, no top nav', () => {
    const { container } = renderLayout('/about', { surface: 'public' });
    expect(sidebar(container)).not.toBeNull();
    expect(topNav(container)).toBeNull();
  });

  it('signed out: top nav as before, no sidebar, no bottom bar', () => {
    mockUseAuth.mockReturnValue(signedOut);
    const { container } = renderLayout('/feed');
    expect(topNav(container)).not.toBeNull();
    expect(sidebar(container)).toBeNull();
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
  });

  it('/live keeps today\'s chrome', () => {
    const { container } = renderLayout('/live');
    expect(topNav(container)).not.toBeNull();
    expect(sidebar(container)).toBeNull();
  });

  it('/transcribe keeps today\'s chrome', () => {
    const { container } = renderLayout('/transcribe/abc');
    expect(topNav(container)).not.toBeNull();
    expect(sidebar(container)).toBeNull();
  });

  it('compact routes (room pages) keep today\'s chrome', () => {
    const { container } = renderLayout('/events/night/room', { compact: true });
    expect(topNav(container)).not.toBeNull();
    expect(sidebar(container)).toBeNull();
  });

  it('an immersive letter route has neither', () => {
    const { container } = renderLayout('/letter/6f1f2c1e-0000-4000-8000-000000000000', { compact: true });
    expect(topNav(container)).toBeNull();
    expect(sidebar(container)).toBeNull();
  });

  it('phone: the bottom bar is the navigation on a browse page (no top bar)', () => {
    const { container } = renderLayout('/feed');
    expect(container.querySelector('[data-nav="bottom"]')).not.toBeNull();
    // The lg:hidden top bar wrapper only appears where the bottom bar is hidden.
    expect(container.querySelector('.lg\\:hidden > [data-nav="main"]')).toBeNull();
  });

  it('phone: a focus page that hides the bottom bar keeps the slim top bar below lg, sidebar above', () => {
    const { container } = renderLayout('/create');
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
    expect(container.querySelector('.lg\\:hidden > [data-nav="main"]')).not.toBeNull();
    expect(sidebar(container)).not.toBeNull();
    expect(container.querySelector('[data-shell-top-nav]')?.getAttribute('data-shell-top-nav')).toBe('phone');
  });

  it('tells the page how much nav chrome the phone has (for offset overrides)', () => {
    const { container } = renderLayout('/feed');
    expect(container.querySelector('[data-shell-top-nav]')?.getAttribute('data-shell-top-nav')).toBe('none');
  });
});

describe('P1512 shell — collapse', () => {
  it('collapsed shows only the logo-as-expand control, no entries', () => {
    localStorage.setItem(SIDEBAR_KEY, '1');
    const { container } = renderLayout('/feed');
    const bar = sidebar(container)!;
    expect(bar.getAttribute('data-collapsed')).toBe('true');
    expect(within(bar).queryAllByRole('link')).toHaveLength(0);
    const expand = within(bar).getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // The logo is what shows; hover swaps it for the expand icon (both live in the one button).
    expect(expand.querySelector('svg.hidden')).not.toBeNull();
    expect(bar.querySelectorAll('button')).toHaveLength(1);
  });

  it('expanded shows a collapse control; collapsing then expanding persists on this device', () => {
    const { container } = renderLayout('/feed');
    fireEvent.click(within(sidebar(container)!).getByRole('button', { name: 'Collapse sidebar' }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('1');
    expect(sidebar(container)!.getAttribute('data-collapsed')).toBe('true');

    fireEvent.click(within(sidebar(container)!).getByRole('button', { name: 'Expand sidebar' }));
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe('0');
    expect(within(sidebar(container)!).getByRole('link', { name: /^feed$/i })).toBeInTheDocument();
  });

  it('shifts the content column by the sidebar width', () => {
    const open = renderLayout('/feed');
    expect(open.container.firstElementChild!.className).toContain('lg:pl-[248px]');
    open.unmount();
    localStorage.setItem(SIDEBAR_KEY, '1');
    const shut = renderLayout('/feed');
    expect(shut.container.firstElementChild!.className).toContain('lg:pl-16');
  });

  it('still works when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { container } = renderLayout('/feed');
    fireEvent.click(within(sidebar(container)!).getByRole('button', { name: 'Collapse sidebar' }));
    expect(sidebar(container)!.getAttribute('data-collapsed')).toBe('true');
    spy.mockRestore();
  });
});

describe('P1512 shell — phone bottom bar', () => {
  it('has Home, Feed, Groups, Letters and Me', () => {
    const { container } = renderLayout('/feed');
    const bar = container.querySelector('[data-nav="bottom"]') as HTMLElement;
    const labels = Array.from(bar.querySelectorAll('a, button')).map(el => el.querySelector('span.text-xs')?.textContent);
    expect(labels).toEqual(['Home', 'Feed', 'Groups', 'Letters', 'Me']);
  });

  it('shows the Letters badge on the tab', () => {
    mockUnread.mockReturnValue({ count: 7, loading: false });
    const { container } = renderLayout('/feed');
    const bar = within(container.querySelector('[data-nav="bottom"]') as HTMLElement);
    expect(bar.getByRole('link', { name: 'Letters, 7 unread' }).querySelector('[data-badge]')!.textContent).toBe('7');
  });

  it('Me opens a sheet with My Profile, Partners (badge), Tools, Settings, Log Out and Events', () => {
    mockPartnerCount.mockReturnValue({ count: 1, loading: false });
    renderLayout('/feed');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const sheet = within(screen.getByTestId('me-sheet'));
    expect(sheet.getByRole('link', { name: /^my profile$/i })).toHaveAttribute('href', '/p/ada');
    expect(sheet.getByRole('link', { name: 'Partners, 1 pending invitation' })).toHaveAttribute('href', '/p/ada/partners');
    expect(sheet.getByTestId('event-links-button')).toHaveTextContent('Tools');
    expect(sheet.getByRole('link', { name: /^events$/i })).toHaveAttribute('href', '/events/list');
    expect(sheet.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
    expect(sheet.getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });

  it('puts Today\'s event in the bar on an event day and pads the page to clear it', () => {
    mockTonight.mockReturnValue({
      slug: 'night-1',
      title: 'Clarity Night',
      datetime: new Date().toISOString(),
      durationMinutes: 120,
      preparationEnabled: false,
    });
    const { container } = renderLayout('/feed');
    const bar = container.querySelector('[data-nav="bottom"]') as HTMLElement;
    expect(within(bar).getByTestId('tonights-event-cta')).toHaveTextContent("Today's event");
    expect(container.querySelector('main')!.className).toContain('pb-[7.5rem]');
  });

  it('keeps focus-route hiding: no bottom bar on /create', () => {
    const { container } = renderLayout('/create');
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
  });
});

describe('P1512 shell — active rule', () => {
  it('keeps the entries apart: events routes light Events, not Groups', () => {
    expect(isShellEntryActive('events', '/events/list', 'ada')).toBe(true);
    expect(isShellEntryActive('events', '/events/night-1', 'ada')).toBe(true);
    expect(isShellEntryActive('groups', '/events/list', 'ada')).toBe(false);
    expect(isShellEntryActive('groups', '/groups/cm', 'ada')).toBe(true);
    expect(isShellEntryActive('groups', '/groupsX', 'ada')).toBe(false);
  });

  it('Partners owns /p/:slug/partners; My Profile owns the other /p/ pages', () => {
    expect(isShellEntryActive('partners', '/p/ada/partners', 'ada')).toBe(true);
    expect(isShellEntryActive('profile', '/p/ada/partners', 'ada')).toBe(false);
    expect(isShellEntryActive('profile', '/p/ada', 'ada')).toBe(true);
    expect(isShellEntryActive('profile', '/me', 'ada')).toBe(true);
  });

  it('Home and Feed are exact', () => {
    expect(isShellEntryActive('home', '/home', null)).toBe(true);
    expect(isShellEntryActive('home', '/feed', null)).toBe(false);
    expect(isShellEntryActive('feed', '/feed', null)).toBe(true);
  });
});

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
}

function renderRoutes(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/home" element={<HomeRoute><Where /></HomeRoute>} />
        <Route path="/feed" element={<Where />} />
        <Route path="/builders" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P1512 — "/" and "/home" redirects', () => {
  it('waits for the session to restore, then sends a signed-in person to /home', async () => {
    mockUseAuth.mockReturnValue(restoring);
    const view = renderRoutes('/');
    // Pending: nothing has navigated anywhere (a loader, not the feed).
    expect(screen.queryByTestId('where')).toBeNull();
    mockUseAuth.mockReturnValue(signedIn);
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/home" element={<HomeRoute><Where /></HomeRoute>} />
          <Route path="/feed" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/home'));
  });

  it('does not decide while a restored session\'s profile is still loading', () => {
    mockUseAuth.mockReturnValue({ ...signedIn, user: null, isLoading: true });
    renderRoutes('/');
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('sends a signed-out visitor to /feed, keeping query and hash', async () => {
    mockUseAuth.mockReturnValue(signedOut);
    renderRoutes('/?utm_source=x');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/feed?utm_source=x'));
  });

  it('keeps the referrer branch: invite links still go to the landing, without waiting', async () => {
    mockUseAuth.mockReturnValue(restoring);
    renderRoutes('/?referrer=abc');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/builders?referrer=abc'));
  });

  it('/home sends a signed-out visitor to /feed', async () => {
    mockUseAuth.mockReturnValue(signedOut);
    renderRoutes('/home');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/feed'));
  });

  it('/home shows its page for a signed-in person', () => {
    renderRoutes('/home');
    expect(screen.getByTestId('where')).toHaveTextContent('/home');
  });
});
