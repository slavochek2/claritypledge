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

async function renderNav(route: string, { loggedIn = false } = {}) {
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
  return render(
    <MemoryRouter initialEntries={[route]}>
      <SimpleNavigation />
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

  it('KEEPS the logged-in "Start a Clarity Session" CTA on the pricing page', async () => {
    // The regression this file exists for. /live is unreachable from the bottom nav, so
    // suppressing this button leaves a signed-in user with no route to the product.
    await renderNav('/pricing', { loggedIn: true });
    expect(sessionCta().length).toBeGreaterThan(0);
  });

  it('still hides the session CTA on an event detail page (P844 behaviour preserved)', async () => {
    // Splitting one flag into two must not relax the ORIGINAL suppression it was built on.
    await renderNav('/events/some-event-slug', { loggedIn: true });
    expect(sessionCta()).toHaveLength(0);
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
