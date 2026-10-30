/**
 * P1542 round 10 (speed). Founder: "this page loads like 3 seconds until i see the blue cta" and "whatsapp group appears
 * and then cta appears". Two causes, two contracts:
 *  - The registration thank-you's blue "Learn more" no longer waits for the reads that decide it (learned? member? the
 *    community name): with every one of them never answering, the button is on screen at once.
 *  - The chat provider above the routes no longer remounts every page when the session finishes restoring (none → id),
 *    which threw away and re-sent each page's reads. The mirror provider keeps its children in one place too.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';

const never = () => new Promise<never>(() => {});
const auth = vi.hoisted(() => ({ current: { user: { id: 'user-id-1234' } as { id: string } | null } }));
const readiness = vi.hoisted(() => ({ current: 'signed-in' as string }));

vi.mock('@/auth', () => ({
  useAuth: () => ({ user: auth.current.user, session: auth.current.user ? { user: auth.current.user } : null, sessionChecked: true }),
}));
vi.mock('@/app/routes/home-readiness', () => ({ useHomeReadiness: () => ({ state: readiness.current, retry: () => {} }) }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: () => never(),
  getMyPrepParts: () => never(),
  getPrepSocialProof: () => never(),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: () => never() } }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: { getEventOrganizer: () => never(), getEventOrganizerOrThrow: () => never(), getOrganizationByIdOrThrow: () => never() },
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: { getMyMembership: () => never() } }));
vi.mock('@/app/data/chat-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/chat-service')>()),
  getMyChats: () => never(),
  subscribeToChat: () => () => {},
}));
// The mirror host reads only once signed in; every read it could make never answers.
vi.mock('@/app/data/mirror-service', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  return Object.fromEntries(Object.entries(real).map(([k, v]) => [k, typeof v === 'function' ? () => never() : v]));
});

import { LearnInvitation } from '@/app/prototypes/events/prep/PrepRoom';
import { ChatProvider } from '@/app/pages/chat/chat-provider';
import type { EventWithHost } from '@/app/types';

/** P1595 (Codex): a member, a learner or a stalled decision gets no offer — no card, no skeleton, no button. The
 *  "organised by" line may remain (every registered hiker sees who organises the hike). */
const expectNoOffer = (el: HTMLElement) =>
  expect(el.querySelector('[data-testid="learn-card"], [data-testid="learn-card-skeleton"], button')).toBeNull();


const hike = {
  id: 'event-id-1234',
  slug: 'test-hike',
  title: 'Social Hike: test',
  hostId: 'host-id-1234',
  seriesSlug: 'social-hike',
  preparationEnabled: false,
  statementTag: null,
  datetime: new Date(Date.now() + 7 * 864e5).toISOString(),
} as unknown as EventWithHost;

beforeEach(() => {
  localStorage.clear();
  auth.current = { user: { id: 'user-id-1234' } };
  readiness.current = 'signed-in';
});

describe('round 10/10b: the learning card while the reads that decide it are out', () => {
  // Founder (round 10b): no optimistic "Learn more" — unknown and nothing trusted remembered → a skeleton in the card's
  // footprint; a trusted memory decides at once.
  const orgHike = { ...hike, orgId: 'org-id-1234' } as unknown as EventWithHost;
  const COMMUNITY_KEY = 'p1542-learn-card:user-id-1234:org:org-id-1234';

  it('with nothing remembered, shows the skeleton (no CTA) while prep, community and membership never resolve', () => {
    render(<MemoryRouter><LearnInvitation event={orgHike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    expect(screen.getByTestId('learn-card-skeleton').querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByTestId('learn-card-cta')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a remembered "show" for this community renders the real card at once, with the remembered name', () => {
    localStorage.setItem(COMMUNITY_KEY, JSON.stringify({ show: true, community: 'Clarity Practice Community' }));
    render(<MemoryRouter><LearnInvitation event={orgHike} /></MemoryRouter>);
    const cta = screen.getByTestId('learn-card-cta');
    expect(cta).toHaveTextContent('See how we talk'); // P1595: the founder-approved label
    expect(cta.className).toMatch(/bg-blue-600/);
    expect(screen.getByTestId('learn-card-title')).toHaveTextContent('Clarity Practice Community');
  });

  it('a remembered member gets no skeleton and no card on a DIFFERENT event of the same community', () => {
    localStorage.setItem(COMMUNITY_KEY, JSON.stringify({ show: false, community: 'Clarity Practice Community' }));
    const other = { ...orgHike, id: 'event-id-5678', slug: 'another-hike' } as unknown as EventWithHost;
    const { container } = render(<MemoryRouter><LearnInvitation event={other} /></MemoryRouter>);
    expectNoOffer(container);
  });

  it('per-event progress: a remembered start on this event says "Continue"', () => {
    localStorage.setItem(COMMUNITY_KEY, JSON.stringify({ show: true, community: null }));
    localStorage.setItem('p1542-learn-card:user-id-1234:event:event-id-1234', JSON.stringify({ started: true }));
    render(<MemoryRouter><LearnInvitation event={orgHike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-cta')).toHaveTextContent('Continue');
  });

  it('corrupt memory falls back to the skeleton instead of throwing', () => {
    localStorage.setItem(COMMUNITY_KEY, '{not json');
    render(<MemoryRouter><LearnInvitation event={orgHike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
  });
});

describe('round 10: the session restoring does not remount the page under the chat provider', () => {
  it('a page below ChatProvider mounts once when the session restores (none → id); another person still starts fresh', () => {
    let mounts = 0;
    function Page() {
      useEffect(() => { mounts += 1; }, []);
      return <p>page</p>;
    }
    auth.current = { user: null };
    readiness.current = 'signed-out';
    const tree = () => <MemoryRouter initialEntries={['/events/test-hike/confirm']}><ChatProvider><Page /></ChatProvider></MemoryRouter>;
    const { rerender } = render(tree());
    expect(mounts).toBe(1);
    act(() => { auth.current = { user: { id: 'user-id-1234' } }; readiness.current = 'signed-in'; });
    rerender(tree());
    expect(mounts).toBe(1);
    // A different person is a different provider (nothing of the first person's chats carries over).
    act(() => { auth.current = { user: { id: 'user-id-5678' } }; });
    rerender(tree());
    expect(mounts).toBe(2);
  });
});
