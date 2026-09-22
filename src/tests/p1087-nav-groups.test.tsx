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
const tonight = vi.hoisted(() => ({ current: null as null | { slug: string; title: string } }));
vi.mock('@/app/hooks/useTonightsEvent', () => ({ useTonightsEvent: () => tonight.current }));

async function renderNav(route: string, { loggedIn = false, withLinks = false } = {}) {
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
        <SimpleNavigation />
      </EventLinksMenu>
    </MemoryRouter>
  );
}

const sessionCta = () => screen.queryAllByTitle('Start a live clarity session');
const marketingCta = () => screen.queryAllByTitle('Book a free alignment audit');

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

describe('P1351 — "Tonight\'s event" is the signed-in primary on an event day', () => {
  beforeEach(() => { tonight.current = null; });

  it('shows and links to the event when there is one today', async () => {
    tonight.current = { slug: 'night-2', title: 'Clarity Night #2' };
    await renderNav('/feed', { loggedIn: true });
    const ctas = screen.getAllByTestId('tonights-event-cta');
    expect(ctas.length).toBeGreaterThan(0);
    for (const c of ctas) expect(c).toHaveAttribute('href', '/events/night-2');
  });

  it('is hidden on that event\'s own pages (one primary per view)', async () => {
    tonight.current = { slug: 'night-2', title: 'Clarity Night #2' };
    for (const route of ['/events/night-2', '/events/night-2/room']) {
      const { unmount } = await renderNav(route, { loggedIn: true });
      expect(screen.queryAllByTestId('tonights-event-cta'), route).toHaveLength(0);
      unmount();
    }
  });

  it('is absent without an event, and for logged-out visitors', async () => {
    await renderNav('/feed', { loggedIn: true });
    expect(screen.queryAllByTestId('tonights-event-cta')).toHaveLength(0);
    tonight.current = { slug: 'night-2', title: 'Clarity Night #2' };
    await renderNav('/feed');
    expect(screen.queryAllByTestId('tonights-event-cta')).toHaveLength(0);
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
