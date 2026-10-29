/**
 * P1542 round 10b — review fixes to the instant thank-you (round 10).
 *  2a. While the session is still restoring (no viewer yet) the learning card keeps its place, empty, with no CTA;
 *      a signed-out visitor gets nothing.
 *  2b. Only an answer every read gave is remembered: a failed or timed-out membership read never saves "hide", and
 *      the earlier memory stays.
 *  3.  The WhatsApp place is decided before any read and never collapses afterwards.
 *  4.  /confirm always leaves its loader (a failed event read included) and starts afresh on a new slug.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';

const never = () => new Promise<never>(() => {});
const auth = vi.hoisted(() => ({ current: { user: null as { id: string } | null, sessionChecked: false } }));
const prep = vi.hoisted(() => ({ read: (() => Promise.resolve(null)) as () => Promise<unknown> }));
const svc = vi.hoisted(() => ({
  membership: (() => new Promise(() => {})) as () => Promise<unknown>,
  bySlug: (() => new Promise(() => {})) as (slug: string) => Promise<unknown>,
  chatUrl: (() => new Promise(() => {})) as () => Promise<string | null>,
  chatOpenedOnServer: (() => new Promise(() => {})) as () => Promise<{ ok: boolean; opened: boolean }>,
}));

vi.mock('@/auth', () => ({
  useAuth: () => ({
    user: auth.current.user,
    session: auth.current.user ? { user: auth.current.user } : null,
    sessionChecked: auth.current.sessionChecked,
    isLoading: false,
  }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => ({ offline: false, reconnectTick: 0 }) }));
vi.mock('@/app/data/event-prep-service', async (orig) => ({
  ...(await orig<typeof import('@/app/data/event-prep-service')>()),
  getMyPreparation: () => prep.read(),
  getMyPrepParts: () => Promise.resolve([]),
  getPrepSocialProof: () => never(),
}));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getPublicPointsFeed: () => never() } }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventOrganizer: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 'test' }),
    getEventOrganizerOrThrow: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 'test' }),
    getOrganizationByIdOrThrow: () => Promise.resolve({ id: 'org-id-1234', name: 'Test Community', slug: 'test' }),
    getEventBySlug: (slug: string) => svc.bySlug(slug),
    getEventGroupChatUrl: () => svc.chatUrl(),
  },
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: { getMyMembership: () => svc.membership() } }));
vi.mock('@/app/data/group-chat-opens-service', () => ({
  readGroupChatOpenedOnServer: () => svc.chatOpenedOnServer(),
  markGroupChatOpenedOnServer: () => Promise.resolve({ ok: true, refused: false }),
}));

import { LearnInvitation } from '@/app/prototypes/events/prep/PrepRoom';
import { RegisteredBlock } from '@/app/prototypes/events/prep/PrepPieces';
import { RsvpConfirm } from '@/app/prototypes/events/components/RsvpConfirm';
import { eventChatOpenedHintKey } from '@/app/prototypes/events/use-group-chat-opened';
import type { EventWithHost } from '@/app/types';

const future = new Date(Date.now() + 7 * 864e5).toISOString();
const hike = {
  id: 'event-id-1234', slug: 'test-hike', title: 'Social Hike: test', hostId: 'host-id-1234', seriesSlug: 'social-hike',
  preparationEnabled: false, statementTag: null, datetime: future, durationMinutes: 120, location: 'Test trailhead',
  description: '', hasGroupChat: true, orgId: 'org-id-1234',
} as unknown as EventWithHost;
const MEMORY = 'p1542-learn-card:user-id-1234:org:org-id-1234';
const CHAT = 'https://chat.whatsapp.com/TestGroup';

beforeEach(() => {
  localStorage.clear();
  auth.current = { user: null, sessionChecked: false };
  svc.membership = () => never();
  svc.bySlug = () => never();
  svc.chatUrl = () => never();
  svc.chatOpenedOnServer = () => never();
  prep.read = () => Promise.resolve(null);
});

describe('2a: the session is still restoring', () => {
  it('shows the skeleton in the card\'s place, with no CTA and no button', () => {
    render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByTestId('learn-card-cta')).toBeNull();
    expect(screen.queryByRole('button', { hidden: true })).toBeNull();
  });

  it('decides once the viewer is known and the reads settle (not a member → the card)', async () => {
    svc.membership = () => Promise.resolve(null);
    const { rerender } = render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    auth.current = { user: { id: 'user-id-1234' }, sessionChecked: true };
    rerender(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    expect(await screen.findByTestId('learn-card-cta')).toBeInTheDocument();
    expect(screen.queryByTestId('learn-card-skeleton')).toBeNull();
  });

  it('decides once the reads settle (a member → the skeleton goes, nothing replaces it)', async () => {
    auth.current = { user: { id: 'user-id-1234' }, sessionChecked: true };
    svc.membership = () => Promise.resolve({ role: 'member' });
    const { container } = render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('a signed-out visitor (session checked, no viewer) gets nothing — no card, no empty place', () => {
    auth.current = { user: null, sessionChecked: true };
    const { container } = render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('round 10c: the first sign-in never settles on the disabled hooks\' idle values', () => {
  it('restore → known viewer: the skeleton stays until the reads for THIS viewer answer, and nothing is saved early', async () => {
    // Membership for the new viewer never answers: the idle "not a member" of the disabled hook must not count.
    const { rerender } = render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    auth.current = { user: { id: 'user-id-1234' }, sessionChecked: true };
    rerender(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('learn-card-cta')).toBeNull();
    expect(localStorage.getItem(MEMORY)).toBeNull();
  });

  it('WhatsApp space: decided while the viewer is unknown (kept), it is not taken away when the viewer turns out to have opened it', () => {
    localStorage.setItem(eventChatOpenedHintKey('user-id-1234', 'event-id-1234'), '1');
    const { rerender } = render(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={null} viewerId={null} /></MemoryRouter>);
    expect(screen.getByTestId('registered-chat-pending')).toBeInTheDocument();
    rerender(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={CHAT} viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.getByTestId('registered-chat-pending')).toBeInTheDocument();
    expect(screen.queryByTestId('registered-chat')).toBeNull();
  });

  it('a rotated invite link: the event was opened under another link, so no "Join" grows into the page', () => {
    localStorage.setItem(eventChatOpenedHintKey('user-id-1234', 'event-id-1234'), '1');
    render(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl="https://chat.whatsapp.com/RotatedLink" viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.queryByTestId('registered-chat')).toBeNull();
    expect(screen.queryByTestId('registered-chat-pending')).toBeNull();
  });
});

describe('round 10c: the skeleton never pulses forever', () => {
  it('a preparation read that never answers ends the skeleton after the deadline — nothing shown, nothing saved', async () => {
    auth.current = { user: { id: 'user-id-1234' }, sessionChecked: true };
    prep.read = () => never();
    svc.membership = () => Promise.resolve(null);
    const { container } = render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    expect(screen.getByTestId('learn-card-skeleton')).toBeInTheDocument();
    await waitFor(() => expect(container).toBeEmptyDOMElement(), { timeout: 6000 });
    expect(localStorage.getItem(MEMORY)).toBeNull();
  }, 10000);
});

describe('2b: only answers the reads actually gave are remembered', () => {
  beforeEach(() => { auth.current = { user: { id: 'user-id-1234' }, sessionChecked: true }; });

  it('a failed membership read never saves "hide" — the earlier memory stays', async () => {
    const prior = JSON.stringify({ show: true, community: 'Test Community' });
    localStorage.setItem(MEMORY, prior);
    svc.membership = () => Promise.reject(new Error('network'));
    render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    // Settled with membership unknown: the card is not shown (unknown is never "not a member")…
    await waitFor(() => expect(screen.queryByTestId('learn-card-cta')).toBeNull());
    await waitFor(() => expect(screen.queryByTestId('learn-card-skeleton')).toBeNull());
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    // …and nothing of that was written, under any key.
    expect(localStorage.getItem(MEMORY)).toBe(prior);
    const saved = Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i) ?? '') ?? '');
    expect(saved.some((v) => v.includes('"show":false'))).toBe(false);
  });

  it('a successful "member" answer is remembered as hide', async () => {
    svc.membership = () => Promise.resolve({ role: 'member' });
    render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(MEMORY) ?? 'null')).toMatchObject({ show: false }));
  });

  it('a successful "not a member" answer is remembered as show, with the community name', async () => {
    svc.membership = () => Promise.resolve(null);
    render(<MemoryRouter><LearnInvitation event={hike} /></MemoryRouter>);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(MEMORY) ?? 'null')).toEqual({ show: true, community: 'Test Community' }));
  });
});

describe('3: the WhatsApp place never collapses', () => {
  it('no hint: the place is kept while the link is unknown, and stays kept when it turns out already opened', async () => {
    const { rerender } = render(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={null} viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.getByTestId('registered-chat-pending')).toBeInTheDocument();
    // The link arrives and the server says this person already opened it (another device).
    svc.chatOpenedOnServer = () => Promise.resolve({ ok: true, opened: true });
    rerender(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={CHAT} viewerId="user-id-1234" /></MemoryRouter>);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('registered-chat')).toBeNull();
    expect(screen.getByTestId('registered-chat-pending')).toBeInTheDocument();
  });

  it('no hint, the link read fails (null): the place stays kept', () => {
    render(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={null} viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.getByTestId('registered-chat-pending')).toBeInTheDocument();
  });

  it('opened before in this browser (the event hint): no place is kept and no link shows — nothing to collapse', () => {
    localStorage.setItem(eventChatOpenedHintKey('user-id-1234', 'event-id-1234'), '1');
    render(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={null} viewerId="user-id-1234" /></MemoryRouter>);
    expect(screen.queryByTestId('registered-chat-pending')).toBeNull();
    expect(screen.queryByTestId('registered-chat')).toBeNull();
  });

  it('no hint, not opened: the link shows', async () => {
    svc.chatOpenedOnServer = () => Promise.resolve({ ok: true, opened: false });
    render(<MemoryRouter><RegisteredBlock event={hike} groupChatUrl={CHAT} viewerId="user-id-1234" /></MemoryRouter>);
    expect(await screen.findByTestId('registered-chat')).toBeInTheDocument();
  });
});

describe('4: /confirm always leaves its loader and starts afresh on a new slug', () => {
  const plain = (slug: string, chat: boolean) => ({
    ...hike, id: `event-${slug}`, slug, title: `Event ${slug}`, seriesSlug: null, hasGroupChat: chat,
  }) as unknown as EventWithHost;
  let go: (to: string) => void = () => {};
  function Nav() { go = useNavigate(); return null; }
  const app = (start: string) => (
    <MemoryRouter initialEntries={[start]}>
      <Nav />
      <Routes><Route path="/events/:slug/confirm" element={<RsvpConfirm />} /></Routes>
    </MemoryRouter>
  );

  it('a failed event read ends on an error with "Try again" — never "not found", never an endless loader', async () => {
    svc.bySlug = () => Promise.reject(new Error('network'));
    render(app('/events/a/confirm'));
    expect(await screen.findByTestId('rsvp-confirm-error')).toHaveTextContent('We could not load this page.');
    expect(screen.queryByText('Event Not Found')).toBeNull();
    // The retry reads again.
    svc.bySlug = (slug) => Promise.resolve(plain(slug, false));
    act(() => screen.getByTestId('rsvp-confirm-retry').click());
    expect(await screen.findByText('Event a')).toBeInTheDocument();
  });

  it('an event that does not exist (null) is "not found"', async () => {
    svc.bySlug = () => Promise.resolve(null);
    render(app('/events/a/confirm'));
    expect(await screen.findByText('Event Not Found')).toBeInTheDocument();
  });

  it('a new slug clears the previous event and its chat link', async () => {
    svc.bySlug = (slug) => Promise.resolve(slug === 'a' ? plain('a', true) : plain('b', false));
    svc.chatUrl = () => Promise.resolve(CHAT);
    render(app('/events/a/confirm'));
    expect(await screen.findByText('Event a')).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector(`a[href="${CHAT}"]`)).not.toBeNull());
    svc.bySlug = () => never();
    act(() => go('/events/b/confirm'));
    expect(screen.queryByText('Event a')).toBeNull();
    expect(document.querySelector(`a[href="${CHAT}"]`)).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });
});
