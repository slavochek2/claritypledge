/**
 * P1401 — the phone block renders several upcoming events as ONE snapping sideways row with
 * the side gutter kept (scroll-px), and never shows an event that already started. Test data
 * has a single upcoming event in our groups, so the row could not be seen in a browser;
 * this pins its structure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null }) }));

const future = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const ev = (id: string, datetime: string) => ({
  id, slug: id, title: `Event ${id}`, datetime, status: 'upcoming', location: 'Chiang Mai',
  timezone: 'Asia/Bangkok', hostName: 'Host', hostSlug: 'host', attendees: [],
});

vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: {
    listPublicOrganizations: vi.fn(async () => [
      { id: 'g1', slug: 'cm', name: 'Communication Activism Community · Chiang Mai' },
      { id: 'g2', slug: 'online', name: 'Clarity Practice Community · Online' },
    ]),
  },
}));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getUpcomingEvents: vi.fn(async (orgId: string) =>
      orgId === 'g1'
        ? [ev('past', new Date(Date.now() - 3600_000).toISOString()), ev('a', future(48))]
        : [ev('b', future(24))]),
  },
}));

import { HomeTopBlock } from '@/app/components/feed/home-side-rail';

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

describe('P1401 phone block', () => {
  it('shows our groups by name and the upcoming events as one snapping row, soonest first, no past event', async () => {
    render(<MemoryRouter><HomeTopBlock /></MemoryRouter>);
    const cards = await screen.findAllByTestId('event-card');
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/events/b', '/events/a']);
    const row = cards[0]!.parentElement!.parentElement!;
    expect(row.className).toMatch(/snap-x/);
    expect(row.className).toMatch(/scroll-px-4/);
    expect(screen.getByRole('link', { name: /Communication Activism/ })).toHaveAttribute('href', '/groups/cm');
    expect(screen.getByRole('link', { name: /Clarity Practice Community/ })).toHaveAttribute('href', '/groups/online');
  });
});
