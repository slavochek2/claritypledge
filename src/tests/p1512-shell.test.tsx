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
import { SimpleNavigation } from '@/app/components/layout/simple-navigation';
import { EventLinksMenu } from '@/app/components/layout/event-links-menu';
import { HomeRedirect, HomeRoute } from '@/app/routes/home-redirect';
import { PENDING_TIMEOUT_MS } from '@/app/routes/home-readiness';
import { setNavVerifiedHint } from '@/lib/nav-verified-hint';
import { isShellEntryActive } from '@/app/components/layout/app-shell/shell-nav';
import { AUDIENCE_LINKS, PUBLIC_NAV_GROUPS } from '@/app/components/layout/nav-links';

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
  it('lists exactly Home, Feed, Groups, Letters, Events, Partners, My Profile and no Search (Tools is an icon at the bottom)', () => {
    const { container } = renderLayout('/feed');
    const bar = sidebar(container)!;
    expect(bar).not.toBeNull();
    const menu = within(bar).getByRole('list', { name: 'Menu' });
    const labels = Array.from(menu.querySelectorAll('li')).map(li => li.textContent?.trim());
    expect(labels).toEqual(['Home', 'Feed', 'Groups', 'Letters', 'Events', 'Partners', 'My Profile']);
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

  it('opens the same Tools menu the top nav opened: one grid icon button (tooltip "Tools", 40px) beside the account row, not in the list', () => {
    const { container } = renderLayout('/feed');
    const bar = within(sidebar(container)!);
    const tools = bar.getByTestId('event-links-button');
    expect(screen.getAllByTestId('event-links-button')).toHaveLength(1);
    // Icon button: its name is "Tools", the tooltip is the native title, and it is a 40px target.
    expect(tools).toHaveTextContent('Tools');
    expect(tools).toHaveAttribute('title', 'Tools');
    expect(tools.className).toContain('h-10');
    expect(tools.className).toContain('w-10');
    // Not a row in the menu list; it sits in the bottom block, in the same row as the account button.
    expect(bar.getByRole('list', { name: 'Menu' })).not.toContainElement(tools);
    const account = bar.getByRole('button', { name: 'Menu' });
    expect(tools.parentElement).toBe(account.closest('div')?.parentElement);
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

  it('signed in on a public-surface route that is not the marketing site (terms): the same shell, no top nav', () => {
    const { container } = renderLayout('/terms-of-service', { surface: 'public' });
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

  it('phone: a focus page that hides the bottom bar gets the shell top bar and NO logo top nav (one bar, not two)', () => {
    const { container } = renderLayout('/create');
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
    // The shell top bar (in <main>) is the only top chrome: no fixed logo nav, on any width.
    expect(container.querySelector('[data-nav="main"]')).toBeNull();
    expect(container.querySelector('.lg\\:hidden > [data-nav="main"]')).toBeNull();
    expect(container.querySelector('main [data-shell-top-bar]')).not.toBeNull();
    expect(sidebar(container)).not.toBeNull();
    // Nothing sits under a fixed nav, so offsets that hard-code the old nav height drop to the edge.
    expect(container.querySelector('[data-shell-top-nav]')?.getAttribute('data-shell-top-nav')).toBe('none');
    // <main> only clears the status-bar inset: no 4rem for a nav that is not there.
    expect(container.querySelector('main')!.className).toContain('pt-[env(safe-area-inset-top)]');
    expect(container.querySelector('main')!.className).not.toContain('4rem');
  });

  it('the shell top bar is on a browse page too, and not on Home (chat draws its own header)', () => {
    expect(renderLayout('/feed').container.querySelector('main [data-shell-top-bar]')).not.toBeNull();
    const home = renderLayout('/home').container;
    expect(home.querySelector('[data-shell-top-bar]')).toBeNull();
  });

  it('tells the page how much nav chrome the phone has (for offset overrides)', () => {
    const { container } = renderLayout('/feed');
    expect(container.querySelector('[data-shell-top-nav]')?.getAttribute('data-shell-top-nav')).toBe('none');
  });
});

describe('P1512 shell — collapse', () => {
  it('collapsed shows the logo-as-expand control, every nav entry as an icon link (P1539), Tools and the avatar', () => {
    localStorage.setItem(SIDEBAR_KEY, '1');
    const { container } = renderLayout('/feed');
    const bar = sidebar(container)!;
    expect(bar.getAttribute('data-collapsed')).toBe('true');
    expect(within(bar).queryAllByRole('link')).toHaveLength(7);
    const expand = within(bar).getByRole('button', { name: 'Expand sidebar' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    // The logo is what shows; hover swaps it for the expand icon (both live in the one button).
    expect(expand.querySelector('svg.hidden')).not.toBeNull();
    // Tools still works collapsed, then the avatar, at the bottom.
    const buttons = Array.from(bar.querySelectorAll('button'));
    expect(buttons).toHaveLength(3);
    expect(buttons[1]).toBe(within(bar).getByTestId('event-links-button'));
    // P1539: the native title was replaced by a real tooltip (asserted in p1539-loading.test.tsx); the name stays "Tools".
    expect(buttons[1]).toHaveAccessibleName('Tools');
    expect(buttons[2]).toBe(within(bar).getByTestId('rail-avatar'));
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
  it('has Home, Feed, Groups, Letters and You', () => {
    const { container } = renderLayout('/feed');
    const bar = container.querySelector('[data-nav="bottom"]') as HTMLElement;
    const labels = Array.from(bar.querySelectorAll('a, button')).map(el => el.querySelector('span.text-xs')?.textContent);
    expect(labels).toEqual(['Home', 'Feed', 'Groups', 'Letters', 'You']);
  });

  it('shows the Letters badge on the tab', () => {
    mockUnread.mockReturnValue({ count: 7, loading: false });
    const { container } = renderLayout('/feed');
    const bar = within(container.querySelector('[data-nav="bottom"]') as HTMLElement);
    expect(bar.getByRole('link', { name: 'Letters, 7 unread' }).querySelector('[data-badge]')!.textContent).toBe('7');
  });

  it('the last tab is labelled You (aria "You", plus the Partners badge text), keeps its test id, and is a button that opens the sheet', () => {
    mockPartnerCount.mockReturnValue({ count: 3, loading: false });
    const { container } = renderLayout('/feed');
    const tab = screen.getByTestId('bottom-nav-me');
    expect(tab.querySelector('span.text-xs')?.textContent).toBe('You');
    expect(tab).toHaveAttribute('aria-label', 'You, 3 pending invitations');
    expect(tab.querySelector('[data-badge]')?.textContent).toBe('3');
    expect(container.querySelector('[data-nav="bottom"]')!.textContent).not.toMatch(/\bMe\b/);
  });

  it('the You tab draws the avatar at the same box as the other tabs\' icons, with a thin ring for a pledger and the same active treatment', () => {
    mockUseAuth.mockReturnValue({ ...signedIn, user: { ...signedIn.user, hasPledged: true } });
    const { container } = renderLayout('/feed');
    const bar = container.querySelector('[data-nav="bottom"]') as HTMLElement;
    const otherIcon = bar.querySelector('a svg') as SVGElement;
    const avatar = screen.getByTestId('bottom-nav-me').querySelector('[data-testid="gravatar-avatar"]') as HTMLElement;
    // One box: the icons are w-5 h-5; the avatar is forced to the very same box.
    expect(otherIcon.getAttribute('class')).toMatch(/\bw-5\b/);
    expect(avatar.className).toContain('!w-5');
    expect(avatar.className).toContain('!h-5');
    // A pledger keeps a ring, but a thin one drawn flush (no offset gap that makes the tab look oversized).
    expect(avatar.getAttribute('data-pledger')).toBe('true');
    expect(avatar.className).toContain('!ring-1');
    expect(avatar.className).toContain('!ring-offset-0');
    // Same inactive treatment as the other tabs.
    const feedTab = bar.querySelector('a[href="/feed"]') as HTMLElement;
    expect(feedTab.className).toContain('text-blue-600');
    expect(screen.getByTestId('bottom-nav-me').className).toContain('text-muted-foreground');
  });

  it('the You tab is lit on the profile page, like the other tabs when active', () => {
    renderLayout('/p/ada');
    expect(screen.getByTestId('bottom-nav-me').className).toContain('text-blue-600');
  });

  it('You opens a sheet with My Profile, Partners (badge), Tools, Settings, Log Out and Events', () => {
    mockPartnerCount.mockReturnValue({ count: 1, loading: false });
    renderLayout('/feed');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const sheet = within(screen.getByTestId('me-sheet'));
    expect(sheet.getByRole('link', { name: 'My Profile' })).toHaveAttribute('href', '/p/ada');
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

describe('P1512 shell — menus do not repeat the nav beside them', () => {
  const hrefs = (el: HTMLElement) => Array.from(el.querySelectorAll('a')).map(a => a.getAttribute('href'));

  it('the phone Me sheet leaves out Feed and Groups (in the bottom bar) and keeps Events, which the bar lacks', () => {
    renderLayout('/feed');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const sheet = within(screen.getByTestId('me-sheet'));
    expect(sheet.queryByRole('link', { name: /^feed$/i })).toBeNull();
    expect(sheet.queryByRole('link', { name: /^groups$/i })).toBeNull();
    expect(sheet.getByRole('link', { name: /^events$/i })).toHaveAttribute('href', '/events/list');
  });

  it('the Me sheet has no Use cases or Learn group and no Pledgers; one "ClarityPledge website" row stands for them', () => {
    renderLayout('/feed');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const sheet = within(screen.getByTestId('me-sheet'));
    expect(sheet.queryByText('Use cases')).toBeNull();
    expect(sheet.queryByText('Learn')).toBeNull();
    for (const link of AUDIENCE_LINKS) expect(sheet.queryByRole('link', { name: link.label })).toBeNull();
    for (const name of [/^manifesto$/i, /^about$/i, /^pledgers$/i, /^blog$/i]) expect(sheet.queryByRole('link', { name })).toBeNull();
    const website = sheet.getAllByRole('link', { name: 'ClarityPledge website' });
    expect(website).toHaveLength(1);
    expect(website[0]).toHaveAttribute('href', '/builders');
    expect(website[0]!.querySelector('svg')!.getAttribute('class')).toContain('h-5');
  });

  it('the Me sheet draws no public group headings: Events is a plain row after Tools, the website row sits directly above the account block', async () => {
    renderLayout('/feed');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const sheet = screen.getByTestId('me-sheet');
    for (const heading of ['Product', 'Use cases', 'Learn', 'Your account']) expect(within(sheet).queryByText(heading)).toBeNull();
    const rows = Array.from(sheet.querySelectorAll('nav[aria-label="Account"] a, nav[aria-label="Account"] button')).filter(el => !el.hasAttribute('data-badge'));
    const names = rows.map(el => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim());
    expect(names).toEqual(['My Profile', 'Partners', 'Tools', 'Events', 'ClarityPledge website', 'Session History', 'Settings', 'Log Out']);
  });

  it('the Me sheet derives what it omits from the bottom bar: no destination appears in both', () => {
    const { container } = renderLayout('/feed');
    const bar = container.querySelector('[data-nav="bottom"]') as HTMLElement;
    const inBar = hrefs(bar).filter((h): h is string => !!h);
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const inSheet = hrefs(screen.getByTestId('me-sheet'));
    expect(inBar.length).toBeGreaterThan(3);
    for (const h of inBar) expect(inSheet, `${h} is in the bar and the sheet`).not.toContain(h);
  });

  it('the sheet has no name/avatar row: My Profile is a normal first row with the same person icon as the sidebar', () => {
    const { container } = renderLayout('/feed');
    const sidebarIcon = within(sidebar(container) as HTMLElement).getByRole('link', { name: 'My Profile' }).querySelector('svg')!;
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const sheetEl = screen.getByTestId('me-sheet');
    const sheet = within(sheetEl);
    const links = sheet.getAllByRole('link').filter(a => a.getAttribute('href') === '/p/ada');
    expect(links).toHaveLength(1);
    const row = links[0] as HTMLElement;
    expect(row).toHaveTextContent(/^My Profile$/);
    expect(row).toHaveAccessibleName('My Profile');
    // The person's name and avatar are not drawn in the sheet at all.
    expect(sheet.queryByText('Ada')).toBeNull();
    expect(sheetEl.querySelector('[data-testid="gravatar-avatar"]')).toBeNull();
    // Same icon as the desktop sidebar (UserIcon), at the sheet's one icon size.
    const icon = row.querySelector('svg')!;
    expect(icon.getAttribute('class')).toContain('lucide-user');
    expect(sidebarIcon.getAttribute('class')).toContain('lucide-user');
    expect(icon.getAttribute('class')).toContain('h-5');
    // And it is the FIRST row.
    const first = sheetEl.querySelector('nav[aria-label="Account"] a, nav[aria-label="Account"] button');
    expect(first).toBe(row);
  });

  it('the My Profile row keeps the active styling and aria-current on the profile page', () => {
    renderLayout('/p/ada');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    const row = within(screen.getByTestId('me-sheet')).getByRole('link', { name: 'My Profile' });
    expect(row).toHaveAttribute('aria-current', 'page');
    expect(row.className).toContain('bg-blue-50');
    expect(row.className).toContain('text-blue-700');
  });

  it('closing the sheet happens when the My Profile row is followed', () => {
    renderLayout('/feed');
    fireEvent.click(screen.getByTestId('bottom-nav-me'));
    fireEvent.click(within(screen.getByTestId('me-sheet')).getByRole('link', { name: 'My Profile' }));
    expect(screen.queryByTestId('me-sheet')).toBeNull();
  });

  it('the desktop avatar menu leaves out Feed, Groups and Events (all in the sidebar) and keeps the rest', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    await user.click(within(sidebar(container) as HTMLElement).getByRole('button', { name: 'Menu' }));
    const menu = within(await screen.findByRole('menu'));
    expect(menu.queryByRole('menuitem', { name: /^feed$/i })).toBeNull();
    expect(menu.queryByRole('menuitem', { name: /^groups$/i })).toBeNull();
    expect(menu.queryByRole('menuitem', { name: /^events$/i })).toBeNull();
    expect(menu.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(menu.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
    // No public group heading survives on desktop.
    for (const group of PUBLIC_NAV_GROUPS) expect(menu.queryByText(group.label)).toBeNull();
  });

  it('the desktop avatar menu lists the website row first, directly above the "Your account" group', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    await user.click(within(sidebar(container) as HTMLElement).getByRole('button', { name: 'Menu' }));
    const menu = await screen.findByRole('menu');
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map(el => el.textContent?.trim());
    expect(items).toEqual(['ClarityPledge website', 'Session History', 'Settings', 'Log Out']);
    const website = within(menu).getByRole('menuitem', { name: 'ClarityPledge website' });
    const account = within(menu).getByText('Your account');
    expect(website.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the desktop avatar menu has no Use cases or Learn group and no Pledgers; one "ClarityPledge website" row stands for them', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    await user.click(within(sidebar(container) as HTMLElement).getByRole('button', { name: 'Menu' }));
    const menu = within(await screen.findByRole('menu'));
    expect(menu.queryByText('Use cases')).toBeNull();
    expect(menu.queryByText('Learn')).toBeNull();
    for (const link of AUDIENCE_LINKS) expect(menu.queryByRole('menuitem', { name: link.label })).toBeNull();
    for (const name of [/^manifesto$/i, /^about$/i, /^pledgers$/i, /^blog$/i]) expect(menu.queryByRole('menuitem', { name })).toBeNull();
    const website = menu.getAllByRole('menuitem', { name: 'ClarityPledge website' });
    expect(website).toHaveLength(1);
    expect(website[0]).toHaveAttribute('href', '/builders');
  });

  it('every destination the sidebar lists is missing from its avatar menu', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    const inSidebar = hrefs(sidebar(container) as HTMLElement).filter((h): h is string => !!h);
    await user.click(within(sidebar(container) as HTMLElement).getByRole('button', { name: 'Menu' }));
    const inMenu = hrefs(await screen.findByRole('menu'));
    for (const h of inSidebar) expect(inMenu, `${h} is in the sidebar and the avatar menu`).not.toContain(h);
  });

  it('signed out, the public menu is exactly as before: Use cases and every other group, headings included', async () => {
    mockUseAuth.mockReturnValue(signedOut);
    const user = userEvent.setup();
    const { container } = renderLayout('/feed');
    const nav = container.querySelector('[data-nav="main"]') as HTMLElement;
    await user.click(within(nav).getAllByRole('button', { name: /menu/i })[0] as HTMLElement);
    const menu = within(await screen.findByRole('menu'));
    for (const group of PUBLIC_NAV_GROUPS) {
      expect(menu.getByText(group.label)).toBeInTheDocument();
      for (const item of group.items) expect(menu.getByRole('menuitem', { name: item.label }), `${item.label}`).toBeInTheDocument();
    }
  });
});

describe('P1512 — the public website, signed in', () => {
  const SITE = ['/builders', '/hiring', '/coach', '/hospitals', '/founder', '/manifesto', '/about', '/pledgers'];

  it.each(SITE)('%s signed in: the public top nav with Open app and Log out, no sidebar, no bottom bar', (path) => {
    const { container } = renderLayout(path, { surface: 'public' });
    expect(topNav(container)).not.toBeNull();
    expect(sidebar(container)).toBeNull();
    expect(container.querySelector('[data-nav="bottom"]')).toBeNull();
    const nav = within(topNav(container) as HTMLElement);
    // One per breakpoint group (desktop row, phone bar); CSS shows exactly one.
    const openApp = nav.getAllByRole('link', { name: 'Open app' });
    expect(openApp).toHaveLength(2);
    for (const link of openApp) expect(link).toHaveAttribute('href', '/home');
    expect(nav.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: /^log in$/i })).toBeNull();
    expect(nav.queryByRole('link', { name: /create account/i })).toBeNull();
    expect(nav.queryByRole('link', { name: /discovery call/i })).toBeNull();
    // The app nav is not drawn on the website.
    expect(nav.queryByRole('link', { name: /^letters$/i })).toBeNull();
    expect(nav.queryByRole('link', { name: /my profile/i })).toBeNull();
    // Content is not pushed right by a sidebar column.
    expect(container.firstElementChild!.className).not.toContain('lg:pl-');
  });

  it('Open app is the only primary (blue) action in the signed-in public nav', () => {
    const { container } = renderLayout('/about', { surface: 'public' });
    const blue = Array.from((topNav(container) as HTMLElement).querySelectorAll('a, button')).filter(el => el.className.includes('bg-blue'));
    expect(blue.map(el => el.textContent?.trim())).toEqual(['Open app', 'Open app']);
  });

  it('Log out signs out and goes to the site root', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/about', { surface: 'public' });
    await user.click(within(topNav(container) as HTMLElement).getByRole('button', { name: 'Log out' }));
    expect(signedIn.signOut).toHaveBeenCalledTimes(1);
  });

  it('the public footer returns on the website while signed in (the shell has none)', () => {
    renderLayout('/about', { surface: 'public' });
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('the phone menu has the public sections and a Log out, and no app account block', async () => {
    const user = userEvent.setup();
    const { container } = renderLayout('/about', { surface: 'public' });
    const nav = within(topNav(container) as HTMLElement);
    await user.click(nav.getAllByRole('button', { name: 'Open menu' })[0] as HTMLElement);
    const panel = within(document.getElementById('mobile-navigation-menu') as HTMLElement);
    expect(panel.getByText('Use cases')).toBeInTheDocument();
    expect(panel.getByText('Learn')).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(panel.queryByRole('link', { name: /session history/i })).toBeNull();
    expect(panel.queryByText('Your account')).toBeNull();
  });

  it('the phone menu Log out closes the menu (like every other row) and signs out once', async () => {
    const user = userEvent.setup();
    // A sign-out that has not resolved yet: the menu must already be closed.
    signedIn.signOut.mockReturnValueOnce(new Promise(() => {}));
    const { container } = renderLayout('/about', { surface: 'public' });
    const nav = within(topNav(container) as HTMLElement);
    await user.click(nav.getAllByRole('button', { name: 'Open menu' })[0] as HTMLElement);
    const panel = within(document.getElementById('mobile-navigation-menu') as HTMLElement);
    await user.click(panel.getByRole('button', { name: 'Log out' }));
    expect(signedIn.signOut).toHaveBeenCalledTimes(1);
    expect(document.getElementById('mobile-navigation-menu')).toBeNull();
  });

  it('if the profile goes pending while the phone menu is open, Log out is disabled there as on desktop', async () => {
    const user = userEvent.setup();
    // The nav alone (the layout remounts it on an auth reload, which would close the menu anyway).
    const tree = () => (
      <MemoryRouter initialEntries={['/about']}>
        <EventLinksMenu enabled>
          <SimpleNavigation publicSite />
        </EventLinksMenu>
      </MemoryRouter>
    );
    const { container, rerender } = render(tree());
    const nav = within(topNav(container) as HTMLElement);
    await user.click(nav.getAllByRole('button', { name: 'Open menu' })[0] as HTMLElement);
    expect(within(document.getElementById('mobile-navigation-menu') as HTMLElement).getByRole('button', { name: 'Log out' })).toBeEnabled();
    // Token refresh: a session, its profile in flight, and this device saw it verified before.
    setNavVerifiedHint('u1', true);
    mockUseAuth.mockReturnValue({ ...signedIn, user: null, isLoading: true });
    rerender(tree());
    const phoneLogOut = within(document.getElementById('mobile-navigation-menu') as HTMLElement).getByRole('button', { name: 'Log out' });
    expect(phoneLogOut).toBeDisabled();
    expect(nav.getAllByRole('button', { name: 'Log out' })[0]).toBeDisabled(); // desktop row agrees
    await user.click(phoneLogOut);
    expect(signedIn.signOut).not.toHaveBeenCalled();
  });

  it('product routes keep the shell (Feed, Groups, Events, Letters, chat)', () => {
    for (const path of ['/feed', '/groups', '/events/list', '/letters', '/home']) {
      const { container, unmount } = renderLayout(path);
      expect(sidebar(container), path).not.toBeNull();
      expect(topNav(container), path).toBeNull();
      unmount();
    }
  });

  it('signed out: the public pages are unchanged (Log in, the discovery call, no Open app or Log out)', () => {
    mockUseAuth.mockReturnValue(signedOut);
    const { container } = renderLayout('/about', { surface: 'public' });
    const nav = within(topNav(container) as HTMLElement);
    expect(nav.getByRole('link', { name: /^log in$/i })).toHaveAttribute('href', '/login');
    expect(nav.getByRole('link', { name: /discovery call/i })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'Open app' })).toBeNull();
    expect(nav.queryByRole('button', { name: 'Log out' })).toBeNull();
    expect(sidebar(container)).toBeNull();
  });

  it('the sidebar logo still goes to Home', () => {
    const { container } = renderLayout('/feed');
    expect(sidebar(container)?.querySelector('a[aria-label="ClarityPledge"]')?.getAttribute('href')).toBe('/home');
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
  it('the sidebar logo goes to Home when signed in (the phone focus page has no logo nav any more), and the logo goes to "/" when signed out', () => {
    const inShell = renderLayout('/create');
    expect(inShell.container.querySelector('.lg\\:hidden > [data-nav="main"] a[aria-label="ClarityPledge"]')).toBeNull();
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
    expect(rows.length).toBeGreaterThan(6);
    for (const row of rows) {
      expect(row.className, `${row.textContent} starts at px-2`).toContain('px-2');
      const icon = row.querySelector('svg');
      if (icon) expect(icon.getAttribute('class'), `${row.textContent} icon`).toContain('h-5');
    }
    // No public group headings are left in the sheet.
    expect(Array.from(nav.querySelectorAll('[id^="nav-group-"], [role="group"]'))).toHaveLength(0);
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

  it('the sidebar Tools button shows an open state while its popover is open', async () => {
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
