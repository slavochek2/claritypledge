/**
 * P1415 — the home page's events/groups pointers.
 *   - Desktop rail: Next events FIRST, Groups below; Groups lists only the Communication Activism
 *     group, picked by its slug `cm` (it was renamed once and the rename reordered the directory —
 *     decisions.md 2026-09-07), never by name or position. "All groups" stays.
 *   - Phones: no Groups section at all (groups stay in the bottom nav); events unchanged.
 *   - Events still come from BOTH groups the read returns: the filter is on the list, not the read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null }) }));

const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const ev = (id: string, datetime: string) => ({
  id, slug: id, title: `Event ${id}`, datetime, status: 'upcoming', location: 'Chiang Mai',
  timezone: 'Asia/Bangkok', hostName: 'Host', hostSlug: 'host', attendees: [],
});

// The ONLINE group is listed FIRST here on purpose: the rail must pick `cm` by slug, not by rank.
vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: {
    listPublicOrganizations: vi.fn(async () => [
      { id: 'g2', slug: 'online', name: 'Clarity Practice Community · Online' },
      { id: 'g1', slug: 'cm', name: 'Communication Activism Community · Chiang Mai' },
    ]),
  },
}));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: vi.fn(async (orgId: string) => (orgId === 'g1' ? [ev('a', future(48))] : [ev('b', future(24))])),
  },
}));

// Pass-through by default; a test can hand back a saved copy instead (an older cache snapshot).
const savedCopy = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }));
vi.mock('@/lib/offline-read-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offline-read-cache')>();
  return {
    ...actual,
    readThrough: (type: string, id: string, fetcher: () => Promise<unknown>) =>
      savedCopy.current
        ? Promise.resolve({ source: 'cache', data: savedCopy.current })
        : (actual.readThrough as (...a: unknown[]) => Promise<unknown>)(type, id, fetcher),
  };
});

import { HomeSideRail, HomeTopBlock } from '@/app/components/feed/home-side-rail';
import { homeRead } from '@/app/data/offline-reads';
import { organizationsService } from '@/app/data/organizations-service';
import { eventsService } from '@/app/data/events-service';

function setDesktop(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('P1415 — desktop rail', () => {
  beforeEach(() => setDesktop(true));

  it('shows Next events above Groups', async () => {
    render(<MemoryRouter><HomeSideRail /></MemoryRouter>);
    const rail = screen.getByTestId('home-side-rail');
    await within(rail).findAllByTestId('event-card');
    const headings = within(rail).getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Next events', 'Groups']);
    expect(rail).toHaveAttribute('aria-label', 'Events and groups');
  });

  it('lists only the Communication Activism group (by slug), keeps "All groups", and drops the Online group', async () => {
    render(<MemoryRouter><HomeSideRail /></MemoryRouter>);
    const rail = screen.getByTestId('home-side-rail');
    const ca = await within(rail).findByRole('link', { name: /Communication Activism/ });
    expect(ca).toHaveAttribute('href', '/groups/cm');
    expect(within(rail).queryByRole('link', { name: /Clarity Practice Community/ })).toBeNull();
    expect(within(rail).getByRole('link', { name: 'All groups' })).toHaveAttribute('href', '/groups');
  });

  it("still shows the Online group's events (the filter is on the group list, not the read)", async () => {
    render(<MemoryRouter><HomeSideRail /></MemoryRouter>);
    const cards = await screen.findAllByTestId('event-card');
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/events/b', '/events/a']);
  });

  it('while loading, holds ONE group placeholder (the one group that will arrive)', () => {
    render(<MemoryRouter><HomeSideRail /></MemoryRouter>);
    const placeholder = screen.getByTestId('groups-placeholder');
    expect(placeholder.children).toHaveLength(1);
  });
});

describe('P1415 — phone top block', () => {
  beforeEach(() => setDesktop(false));

  it('shows Next events and no Groups section, group tile or "All groups" link', async () => {
    render(<MemoryRouter><HomeTopBlock /></MemoryRouter>);
    const block = screen.getByTestId('home-top-block');
    await within(block).findAllByTestId('event-card');
    expect(within(block).queryByRole('heading', { name: /Groups/ })).toBeNull();
    expect(within(block).queryByRole('link', { name: /Communication Activism/ })).toBeNull();
    expect(within(block).queryByRole('link', { name: 'All groups' })).toBeNull();
    expect(screen.queryByTestId('groups-placeholder')).toBeNull();
    expect(block).toHaveAttribute('aria-label', 'Next events');
  });
});

describe('P1415 review — the Groups section when cm is missing, and old saved copies', () => {
  beforeEach(() => {
    setDesktop(true);
    savedCopy.current = null;
  });

  it('cm absent from the read: the whole Groups section is hidden (no lonely heading + "All groups")', async () => {
    vi.mocked(organizationsService.listPublicOrganizations).mockResolvedValueOnce([
      { id: 'g2', slug: 'online', name: 'Clarity Practice Community · Online' },
    ] as never);
    render(<MemoryRouter><HomeSideRail /></MemoryRouter>);
    const rail = screen.getByTestId('home-side-rail');
    await within(rail).findAllByTestId('event-card');
    expect(within(rail).queryByRole('heading', { name: /Groups/ })).toBeNull();
    expect(within(rail).queryByRole('link', { name: 'All groups' })).toBeNull();
  });

  it('an older saved copy with no `groups` field renders events and no Groups section, without crashing', async () => {
    savedCopy.current = { events: [ev('old', future(5))] };
    render(<MemoryRouter><HomeSideRail /></MemoryRouter>);
    const rail = screen.getByTestId('home-side-rail');
    await within(rail).findAllByTestId('event-card');
    expect(within(rail).queryByRole('heading', { name: /Groups/ })).toBeNull();
  });
});

describe('P1415 review — homeRead always carries cm, even when it is not in the top 2', () => {
  it('cm ranked 3rd: it is in `groups`, while events still come from the top 2 only', async () => {
    vi.mocked(organizationsService.listPublicOrganizations).mockResolvedValueOnce([
      { id: 'x1', slug: 'a', name: 'A' },
      { id: 'x2', slug: 'b', name: 'B' },
      { id: 'g1', slug: 'cm', name: 'Communication Activism Community · Chiang Mai' },
    ] as never);
    const getUpcoming = vi.mocked(eventsService.getUpcomingEvents);
    getUpcoming.mockClear();
    const data = await homeRead().fetch();
    expect(data!.groups.map((g) => g.slug)).toContain('cm');
    expect(getUpcoming.mock.calls.map((c) => c[0])).toEqual(['x1', 'x2']);
  });
});
