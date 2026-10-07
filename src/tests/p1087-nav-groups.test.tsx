/**
 * @file p1087-nav-groups.test.tsx
 *
 * Covers the SITE-WIDE nav changes P1087 made — the part of the branch with blast radius
 * beyond /pricing. Written in response to an adversarial-review finding: the existing nav
 * suites (navigation-acceptance-full, header-consistency, p885-partners-nav) touch none of
 * this code, so the whole suite stayed green while a real regression sat in the diff.
 * "Green because nothing exercises it" is not coverage (epistemic.md gate 7b).
 *
 * The regression it caught, and the reason the first test below exists: a single
 * `hidePrimaryCta` flag suppressed BOTH nav CTAs on /pricing. That was correct for the
 * logged-out marketing CTA (a free call competing with the page's paid offer) and wrong
 * for the logged-in "Start a Clarity Session" button — the bottom nav carries no /live
 * entry, so a signed-in user on /pricing had no route to the core product from anywhere
 * in the chrome.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PUBLIC_NAV_GROUPS, AUDIENCE_LINKS } from '@/app/components/layout/nav-links';

const mockAuthState = vi.hoisted(() => ({
  current: {
    showUserMenu: false,
    showPublicCTAs: true,
    user: null as unknown,
    hasPledged: false,
    slug: null as string | null,
    signOut: vi.fn(),
    isLoading: false,
    sessionChecked: true,
    hasSession: false,
  },
}));

vi.mock('@/hooks/use-nav-auth-state', () => ({
  useNavAuthState: () => mockAuthState.current,
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
vi.mock('@/app/hooks/useNextWebinar', () => ({
  useNextWebinar: () => ({ nextEvent: null }),
}));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
// P1351: the event-day primary. Null unless a test sets it.
const tonight = vi.hoisted(() => ({ current: null as null | import('@/app/hooks/useTonightsEvent').TonightsEvent }));
vi.mock('@/app/hooks/useTonightsEvent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/hooks/useTonightsEvent')>()),
  useTonightsEvent: () => tonight.current,
}));
/** A Clarity Night (preparation on) starting 30 minutes from now — the room's arrival window is open. */
const nightNow = () => ({
  slug: 'night-2', title: 'Clarity Night #2', preparationEnabled: true, durationMinutes: 120,
  datetime: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
});

async function renderNav(route: string, { loggedIn = false, withLinks = false, compact = false } = {}) {
  mockAuthState.current = {
    ...mockAuthState.current,
    showUserMenu: loggedIn,
    showPublicCTAs: !loggedIn,
    // Obviously-fake fixture values — this repo is public (.claude/rules/src.md).
    user: loggedIn
      ? { name: 'Test User', email: 'test@example.com', avatarUrl: null, avatarColor: '#888' }
      : null,
    slug: loggedIn ? 'test-user' : null,
    hasSession: loggedIn,
  };
  const { SimpleNavigation } = await import('@/app/components/layout/simple-navigation');
  const { EventLinksMenu } = await import('@/app/components/layout/event-links-menu');
  // withLinks mirrors the layout's provider (P1351: enabled for any signed-in user).
  return render(
    <MemoryRouter initialEntries={[route]}>
      <EventLinksMenu enabled={withLinks}>
        <SimpleNavigation compact={compact} />
      </EventLinksMenu>
    </MemoryRouter>
  );
}

const sessionCta = () => screen.queryAllByTitle('Start a live clarity session');
const marketingCta = () => screen.queryAllByTitle('Book a 15-min discovery call');

describe('P1087 — nav CTA suppression is scoped to the MARKETING cta, not the session one', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the free-call CTA on the pricing page', async () => {
    await renderNav('/pricing');
    expect(marketingCta()).toHaveLength(0);
  });

  it('still shows the free-call CTA on a page that sells nothing (control)', async () => {
    await renderNav('/manifesto');
    // Without this, a change that removed the CTA globally would pass the test above.
    expect(marketingCta().length).toBeGreaterThan(0);
  });

  it('hides the free-call CTA on the OLD pricing URLs too, since both still resolve', async () => {
    for (const route of ['/program', '/offers']) {
      const { unmount } = await renderNav(route);
      expect(marketingCta(), `marketing CTA still rendered on ${route}`).toHaveLength(0);
      unmount();
    }
  });

  it('P1351: a signed-in user on /pricing still reaches /live — now through Tools', async () => {
    // The regression this file exists for: /live is unreachable from the bottom nav. P1351
    // removed the session button, so the route MUST survive via the Tools menu.
    const userEvent = (await import('@testing-library/user-event')).default;
    await renderNav('/pricing', { loggedIn: true, withLinks: true });
    expect(sessionCta()).toHaveLength(0);
    const triggers = screen.getAllByTestId('event-links-button');
    expect(triggers[0]).toHaveTextContent('Tools');
    await userEvent.click(triggers[0]!);
    const rows = await screen.findAllByTestId('event-links-entry');
    expect(rows.map(r => r.textContent)).toContain('Start a Clarity Session');
  });

  it('P1351: no header session button on any signed-in page, event detail included', async () => {
    for (const route of ['/feed', '/pricing', '/events/some-event-slug', '/groups/g1']) {
      const { unmount } = await renderNav(route, { loggedIn: true });
      expect(sessionCta(), route).toHaveLength(0);
      expect(screen.queryAllByText('Start a Clarity Session'), route).toHaveLength(0);
      unmount();
    }
  });
});

describe('P1351 — the logged-out phone menu renders no source comment as text', () => {
  it('opening the hamburger shows no literal /* ... */ text (Codex review finding)', async () => {
    const { fireEvent } = await import('@testing-library/react');
    await renderNav('/coach');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const panel = document.getElementById('mobile-navigation-menu');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).not.toMatch(/\/\*|\*\//);
  });
});

describe('P1351/P1433 — "Today\'s event" is the event-day primary', () => {
  beforeEach(() => { tonight.current = null; });

  it('shows "Today\'s event" and links to the event\'s room in the window (P1428, P1433 D1)', async () => {
    tonight.current = nightNow();
    await renderNav('/feed', { loggedIn: true });
    const ctas = screen.getAllByTestId('tonights-event-cta');
    expect(ctas.length).toBeGreaterThan(0);
    for (const c of ctas) {
      expect(c).toHaveAttribute('href', '/events/night-2/room');
      expect(c).toHaveTextContent("Today's event");
      expect(c).not.toHaveTextContent('Tonight');
    }
  });

  it('P1433 D1: shows on the event\'s own pages, compact room pages included', async () => {
    tonight.current = nightNow();
    for (const route of ['/events/night-2', '/events/night-2/ready', '/events/night-2/meet', '/events/night-2/arriving', '/events/night-2/prepare', '/stake/ikigai1']) {
      for (const compact of [false, true]) {
        const { unmount } = await renderNav(route, { loggedIn: true, compact });
        expect(screen.queryAllByTestId('tonights-event-cta').length, `${route} compact=${compact}`).toBeGreaterThan(0);
        unmount();
      }
    }
  });

  it('P1433 D1: hidden only on the page it points to (and on pricing, P1351)', async () => {
    tonight.current = nightNow();
    for (const route of ['/events/night-2/room', '/pricing']) {
      const { unmount } = await renderNav(route, { loggedIn: true });
      expect(screen.queryAllByTestId('tonights-event-cta'), route).toHaveLength(0);
      unmount();
    }
    // Outside the window it points to the event page — hidden there, shown in the room.
    tonight.current = { ...nightNow(), datetime: new Date(Date.now() + 6 * 3600 * 1000).toISOString() };
    let r = await renderNav('/events/night-2', { loggedIn: true });
    expect(screen.queryAllByTestId('tonights-event-cta')).toHaveLength(0);
    r.unmount();
    r = await renderNav('/events/night-2/meet', { loggedIn: true });
    for (const c of screen.getAllByTestId('tonights-event-cta')) expect(c).toHaveAttribute('href', '/events/night-2');
    r.unmount();
  });

  it('is absent without an event', async () => {
    await renderNav('/feed', { loggedIn: true });
    expect(screen.queryAllByTestId('tonights-event-cta')).toHaveLength(0);
  });

  it('P1433 D2: a signed-out visitor in the window gets it INSTEAD of the marketing CTA', async () => {
    const { fireEvent } = await import('@testing-library/react');
    tonight.current = { ...nightNow(), registered: false };
    await renderNav('/manifesto');
    expect(screen.getAllByTestId('tonights-event-cta').length).toBeGreaterThan(0);
    expect(marketingCta()).toHaveLength(0);
    // The mobile panel's CTA is replaced too — one primary (P955).
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(marketingCta()).toHaveLength(0);
  });

  it('P1433 D2: signed in but NOT registered — sees it in the window too', async () => {
    tonight.current = { ...nightNow(), registered: false };
    await renderNav('/feed', { loggedIn: true });
    const ctas = screen.getAllByTestId('tonights-event-cta');
    expect(ctas.length).toBeGreaterThan(0);
    for (const c of ctas) expect(c).toHaveAttribute('href', '/events/night-2/room');
  });

  it('P1433 D2: signed-out on a compact room page still sees it', async () => {
    tonight.current = { ...nightNow(), registered: false };
    await renderNav('/events/night-2/ready', { compact: true });
    expect(screen.getAllByTestId('tonights-event-cta').length).toBeGreaterThan(0);
  });

  it('P1433 D2: with no event the visitor keeps the usual CTA (control)', async () => {
    await renderNav('/manifesto');
    expect(screen.queryAllByTestId('tonights-event-cta')).toHaveLength(0);
    expect(marketingCta().length).toBeGreaterThan(0);
  });
});

describe('P1087 — the public nav is one grouped structure', () => {
  it('leads with Use cases and labels every group', () => {
    expect(PUBLIC_NAV_GROUPS.map((g) => g.label)).toEqual(['Use cases', 'Product', 'Learn']);
  });

  it('carries every audience landing, unfiltered', () => {
    const useCases = PUBLIC_NAV_GROUPS[0].items.map((i) => i.to);
    expect(useCases).toEqual(AUDIENCE_LINKS.map((a) => a.to));
    expect(useCases).toHaveLength(4);
  });

  it('lists no destination twice across groups', () => {
    // A link duplicated across two groups reads as two different things in the menu.
    const all = PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to));
    expect(new Set(all).size).toBe(all.length);
  });

  it('marks external destinations explicitly, so they never render as router links', () => {
    // A router <Link to="https://..."> silently produces a broken relative URL.
    for (const group of PUBLIC_NAV_GROUPS) {
      for (const item of group.items) {
        const isAbsolute = item.to.startsWith('http');
        expect(
          isAbsolute,
          `${item.to} is absolute but not marked external (or vice versa)`
        ).toBe('external' in item && item.external === true);
      }
    }
  });
});
