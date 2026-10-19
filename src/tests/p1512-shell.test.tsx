/**
 * @file p1512-shell.test.tsx
 * @description P1512 section A — the signed-in shell: a sidebar (desktop) and bottom bar (phone)
 * that replace the top nav for a signed-in person, so each route shows exactly one navigation.
 * Signed-out chrome and the routes that keep their own chrome (/live, compact rooms) are unchanged.
 */
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
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
import { PENDING_TIMEOUT_MS } from '@/app/routes/home-readiness';
import { isShellEntryActive } from '@/app/components/layout/app-shell/shell-nav';
import { PUBLIC_NAV_GROUPS } from '@/app/components/layout/nav-links';

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

describe('P1512 review round 2 — logo and readiness', () => {
  it('the phone top bar logo goes to Home when signed in (like the sidebar logo), and to "/" when signed out', () => {
    const inShell = renderLayout('/create');
    expect(inShell.container.querySelector('.lg\\:hidden > [data-nav="main"] a[aria-label="ClarityPledge"]')?.getAttribute('href')).toBe('/home');
    expect(sidebar(inShell.container)?.querySelector('a[aria-label="ClarityPledge"]')?.getAttribute('href')).toBe('/home');
    inShell.unmount();
    mockUseAuth.mockReturnValue(signedOut);
    const out = renderLayout('/create');
    expect(out.container.querySelector('a[aria-label="ClarityPledge"]')?.getAttribute('href')).toBe('/');
  });

  it('/home with a session whose profile could not be loaded shows an inline error with Retry, not the feed and not a spinner', async () => {
    const refreshProfile = vi.fn();
    mockUseAuth.mockReturnValue({ ...signedIn, user: null, isLoading: false, refreshProfile });
    renderRoutes('/home');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not load your account');
    expect(screen.queryByTestId('where')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(refreshProfile).toHaveBeenCalledTimes(1);
  });

  it('"/" shows the same error for that person instead of dropping them on the feed', async () => {
    mockUseAuth.mockReturnValue({ ...signedIn, user: null, isLoading: false });
    renderRoutes('/');
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your account');
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('a session that never finishes resolving ends in the error after 15 seconds, never an endless loader', async () => {
    vi.useFakeTimers();
    try {
      mockUseAuth.mockReturnValue({ ...signedIn, user: null, isLoading: true });
      renderRoutes('/home');
      expect(screen.queryByRole('alert')).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PENDING_TIMEOUT_MS + 100);
      });
      expect(screen.getByRole('alert')).toHaveTextContent('We could not load your account');
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unverified person is signed out for Home, exactly as the chat provider treats them', async () => {
    mockUseAuth.mockReturnValue({ ...signedIn, user: { ...signedIn.user, isVerified: false } });
    renderRoutes('/home');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/feed'));
  });
});

describe('P1512 review round 2 — the phone Me sheet and the Tools sheet', () => {
  it('the Me sheet is a modal dialog: role, aria-modal, a name, a Close control, focus inside, Escape closes, focus returns to the Me tab', async () => {
    const user = userEvent.setup();
    renderLayout('/feed');
    const meTab = screen.getByTestId('bottom-nav-me');
    await user.click(meTab);
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('button', { name: 'Close menu' })).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);
    // focus is trapped: tabbing around never leaves the dialog
    for (let i = 0; i < 40; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    await waitFor(() => expect(meTab).toHaveFocus());
  });

  it('focus returns to the Me tab even when nothing had focus as the sheet opened', async () => {
    const user = userEvent.setup();
    renderLayout('/feed');
    const meTab = screen.getByTestId('bottom-nav-me');
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(meTab); // a click that leaves focus on the body, as a synthetic or assistive-tech press can
    await screen.findByRole('dialog', { name: 'Menu' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
    await waitFor(() => expect(meTab).toHaveFocus());
  });

  it('the Close control closes the Me sheet', async () => {
    const user = userEvent.setup();
    renderLayout('/feed');
    await user.click(screen.getByTestId('bottom-nav-me'));
    await user.click(await screen.findByRole('button', { name: 'Close menu' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull());
  });

  it('every row in the Me sheet shares one left edge and one icon size', async () => {
    const user = userEvent.setup();
    renderLayout('/feed');
    await user.click(screen.getByTestId('bottom-nav-me'));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    const nav = within(dialog).getByRole('navigation', { name: 'Account' });
    const rows = Array.from(nav.querySelectorAll('a, button')).filter(el => !el.hasAttribute('data-badge'));
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.className, `${row.textContent} starts at px-2`).toContain('px-2');
      const icon = row.querySelector('svg');
      if (icon) expect(icon.getAttribute('class'), `${row.textContent} icon`).toContain('h-5');
    }
    const labels = Array.from(nav.querySelectorAll('[id^="nav-group-"], [role="group"] > div')).filter(el => /uppercase/.test(el.className));
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(label.className).toContain('px-2');
  });

  it('no two entries in the public nav groups share an icon (for hiring and for coaches differ)', () => {
    const icons = PUBLIC_NAV_GROUPS.flatMap(g => g.items.map(i => i.Icon));
    expect(new Set(icons).size).toBe(icons.length);
  });

  it('Tools opened from the Me sheet lists plain neutral rows, like the desktop popover (only the featured action is outlined)', async () => {
    const user = userEvent.setup();
    renderLayout('/feed');
    await user.click(screen.getByTestId('bottom-nav-me'));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    await user.click(within(dialog).getByTestId('event-links-button'));
    const sheet = await screen.findByTestId('event-links-menu');
    expect(sheet).toHaveAttribute('data-shape', 'sheet');
    const entries = within(sheet).getAllByTestId('event-links-entry');
    const plain = entries.filter(e => !e.className.includes('border-2'));
    expect(plain.length).toBeGreaterThan(3);
    for (const row of plain) {
      expect(row.className).not.toContain('border-blue');
      expect(row.className).not.toContain('text-blue');
      expect(row.className).toContain('min-h-11');
    }
  });

  it('the sidebar Tools row shows an open state while its popover is open', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    const tools = within(sidebar(container) as HTMLElement).getByTestId('event-links-button');
    expect(tools.className).toContain('data-[state=open]:bg-accent');
    expect(tools).toHaveAttribute('data-state', 'closed');
    await user.click(tools);
    await waitFor(() => expect(tools).toHaveAttribute('data-state', 'open'));
  });

  it('the avatar popover is as wide as the sidebar row it opens from, and scrolls within the room it has', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    await user.click(within(sidebar(container) as HTMLElement).getByRole('button', { name: 'Menu' }));
    const menu = await screen.findByRole('menu');
    expect(menu.className).toContain('w-[var(--radix-dropdown-menu-trigger-width)]');
    expect(menu.className).toContain('max-h-[var(--radix-dropdown-menu-content-available-height)]');
  });
});
