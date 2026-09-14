/**
 * @file p1310-mobile-nav.test.tsx
 * @description P1310 — the mobile menu must be reachable, sectioned, and carry Slides.
 *
 * WHAT THIS SUITE CAN AND CANNOT PROVE (epistemic gate 7b). jsdom performs no
 * layout: `getBoundingClientRect()` returns zeros, `100dvh` resolves to nothing,
 * and no element ever overflows. So a test here CANNOT observe that the panel
 * scrolls — the thing the founder actually reported. What it CAN do is pin the
 * two mechanisms that make scrolling possible, either of which silently
 * reintroduces the defect if deleted:
 *   1. the panel carries `mobile-nav-panel`, and
 *   2. `index.css` defines that class with a viewport-relative cap and its own
 *      overflow.
 * The behavioural half is a browser check at 375x667 and 320x568, recorded in
 * the spec's Acceptance Criteria — not claimed here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SimpleNavigation } from '@/app/components/layout/simple-navigation';
import { NavigationMenuItems } from '@/app/components/layout/navigation-menu-items';
import { buildLinksMenu, eventSlugFromLocation } from '@/app/data/event-links';

const authState = vi.hoisted(() => ({
  current: {
    showUserMenu: false,
    showPublicCTAs: true,
    user: null as null | { name: string; avatarColor: string; avatarUrl?: string },
    hasPledged: false,
    slug: null as string | null,
    signOut: vi.fn(),
    isLoading: false,
    sessionChecked: true,
    hasSession: false,
  },
}));

vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => authState.current,
}));
// The nav's badge hooks (unread letters, open invite, pending partner invitations)
// read useAuth directly, which throws outside an AuthProvider.
vi.mock('@/auth', () => ({
  useAuth: () => ({ session: null, user: null, isLoading: false, sessionChecked: true, signOut: vi.fn() }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

function signedOut() {
  authState.current = { ...authState.current, showUserMenu: false, showPublicCTAs: true, user: null, hasSession: false };
}

function signedIn() {
  authState.current = {
    ...authState.current,
    showUserMenu: true,
    showPublicCTAs: false,
    user: { name: 'Test Person', avatarColor: 'blue' },
    slug: 'test-person',
    hasSession: true,
  };
}

async function openMobileMenu() {
  const trigger = screen.getByRole('button', { name: /open menu/i });
  await userEvent.click(trigger);
  return screen.getByRole('navigation').querySelector('#mobile-navigation-menu') as HTMLElement;
}

beforeEach(() => {
  signedOut();
});

describe('P1310 — the open mobile menu is reachable', () => {
  it('caps its height and scrolls itself instead of hanging off the fixed nav', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SimpleNavigation />
      </MemoryRouter>
    );
    const panel = await openMobileMenu();
    expect(panel).toBeTruthy();
    // The class is the contract between the component and index.css below.
    expect(panel.className.split(/\s+/)).toContain('mobile-nav-panel');
  });

  it('index.css gives that class a viewport-relative cap and its own scrolling', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    const rule = css.slice(css.indexOf('.mobile-nav-panel'));
    expect(rule).toMatch(/max-height:\s*calc\(100vh/);
    expect(rule).toMatch(/overflow-y:\s*auto/);
    // The dynamic-viewport unit is what makes the last entry reachable while
    // mobile Safari's URL bar is showing; the vh rule above is only the fallback.
    expect(css).toMatch(/@supports \(height: 100dvh\)[\s\S]*?max-height:\s*calc\(100dvh/);
  });

  it('draws exactly one divider between the CTA and the first section', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SimpleNavigation />
      </MemoryRouter>
    );
    const panel = await openMobileMenu();
    // Two stacked rules rendered here before P1310: the CTA block's own separator
    // plus a second one whose condition was a strict subset of the CTA's.
    expect(panel.querySelectorAll('div.border-t.border-border.my-2')).toHaveLength(1);
  });
});

describe('P1310 — the signed-in menu is the same menu', () => {
  it('gives a signed-in person the public sections plus their own account group', () => {
    signedIn();
    render(
      <MemoryRouter initialEntries={['/feed']}>
        <NavigationMenuItems variant="mobile" onSignOut={vi.fn()} />
      </MemoryRouter>
    );
    // The sections a signed-in person could not see at all before P1310.
    for (const heading of ['Use cases', 'Product', 'Learn', 'Your account']) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    for (const label of ['Pricing', 'Feed', 'Groups', 'For co-founders']) {
      expect(screen.getByRole('link', { name: new RegExp(label, 'i') })).toBeInTheDocument();
    }
    // …without losing the account actions that were already there.
    const account = screen.getByRole('group', { name: 'Your account' });
    for (const label of ['Session History', 'Settings', 'Log Out']) {
      expect(within(account).getByText(label)).toBeInTheDocument();
    }
    // Signed-out-only actions must not appear for a signed-in person.
    expect(screen.queryByText('Create Account')).toBeNull();
    expect(screen.queryByText('Take the Pledge')).toBeNull();
  });

  it('keeps Groups marked as the current page inside its subtree, not only on /groups', () => {
    // Pre-existing before P1310 and found by adversarial review after it shipped: both
    // menus compared paths with `===`, so the entry went dark the moment a visitor opened
    // a group or an event — while the desktop top-nav row beside them used the helper.
    for (const path of ['/groups', '/groups/cm', '/events/clarity-night']) {
      const { unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <NavigationMenuItems variant="mobile" onSignOut={vi.fn()} />
        </MemoryRouter>
      );
      expect(screen.getByRole('link', { name: /Groups/i }), `Groups on ${path}`)
        .toHaveAttribute('aria-current', 'page');
      unmount();
    }
    // …and an unrelated page does not light it up.
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <NavigationMenuItems variant="mobile" onSignOut={vi.fn()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /Groups/i })).not.toHaveAttribute('aria-current');
  });

  it('still gives a signed-out visitor the account actions, Log In included', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavigationMenuItems variant="mobile" onSignOut={vi.fn()} />
      </MemoryRouter>
    );
    for (const label of ['Take the Pledge', 'Log In', 'Create Account']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.queryByText('Your account')).toBeNull();
  });
});

describe('P1310 — the room Links sheet has a ceiling', () => {
  /**
   * The sheet is `fixed bottom-0 h-auto` and grows upward. Adding the 8th entry
   * took it past the top of a 320x568 phone — measured: sheet top -83px, the
   * "Links" title and cmp7 off-screen, while the same page on prod (7 entries)
   * clipped nothing. jsdom cannot measure that, so what is pinned here is the
   * pair that makes it impossible: a viewport-relative cap on the sheet and its
   * own scrolling on the list. The measurement itself is in the spec's ACs.
   */
  it('caps the sheet against the viewport and scrolls the entry list', () => {
    const src = readFileSync(resolve(__dirname, '../app/components/layout/event-links-menu.tsx'), 'utf8');
    const sheet = src.slice(src.indexOf('data-shape="sheet"'));
    expect(sheet).toMatch(/className="event-links-sheet/);
    expect(sheet.slice(0, sheet.indexOf('</nav>'))).toMatch(/<nav className="[^"]*overflow-y-auto/);
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toMatch(/\.event-links-sheet\s*\{[^}]*max-height:\s*calc\(100vh/);
    expect(css).toMatch(/@supports \(height: 100dvh\)[\s\S]*?\.event-links-sheet\s*\{[^}]*max-height:\s*calc\(100dvh/);
  });

  it('a malformed room URL yields no event context instead of throwing through the nav', () => {
    // `/events/%/room` makes decodeURIComponent raise URIError. This runs during the
    // nav provider's render on every route, so the throw took down the whole
    // navigation, not just the menu. Found by adversarial review; the defect predates
    // P1310 and lives in the function the Slides entry extends.
    expect(() => eventSlugFromLocation('/events/%/room', '')).not.toThrow();
    expect(eventSlugFromLocation('/events/%/room', '')).toBeNull();
    expect(eventSlugFromLocation('/events/%E0%A4%A/ready', '')).toBeNull();
    // …without changing what a well-formed slug resolves to.
    expect(eventSlugFromLocation('/events/clarity%20night/room', '')).toBe('clarity night');
    expect(eventSlugFromLocation('/events/cm-oct/meet', '')).toBe('cm-oct');
  });
});

describe('P1310 — the Slides entry', () => {
  it('is an internal path opened in a new tab, never a URL', () => {
    const slides = buildLinksMenu(null, null).find(e => e.label === 'Slides');
    expect(slides).toBeDefined();
    expect(slides!.to).toBe('/presi');
    expect(slides!.newTab).toBe(true);
    expect(slides!.group).toBe('tools');
    // The P1179 open-redirect invariant, restated for the one entry that leaves
    // the SPA: still a path, still not protocol-relative, still not a scheme.
    expect(slides!.to.startsWith('/')).toBe(true);
    expect(slides!.to.startsWith('//')).toBe(false);
    expect(slides!.to).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
  });
});
