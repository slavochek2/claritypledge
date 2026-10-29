// @vitest-environment jsdom
/**
 * P1562 §2: the /close thank-you's "Back to the event" (hike and Clarity Night alike).
 *  - room -> close pushed, with the event page below the room (fromRoom + fromEvent): the stack is [event, room, close]
 *    (plus any room entries); Back returns past them all to the event — never [event, room, event].
 *  - only fromEvent (the event page opened /close): pop.
 *  - neither (the QR code): replace with the event.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
const series = vi.hoisted(() => ({ slug: null as string | null, finished: true }));
vi.mock('@/app/data/events-service', () => ({
  eventsService: {
    getEventBySlug: vi.fn(async () => ({
      id: 'ev-1', slug: 'night', title: 'Night', description: 'd', datetime: '2000-01-01T11:00:00Z', timezone: 'UTC',
      durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
      statementTag: null, researchPlaces: 6, attendees: [], seriesSlug: series.slug,
    })),
    getEventGroupChatUrl: vi.fn().mockResolvedValue(null),
    getUpcomingEvents: vi.fn().mockResolvedValue([]),
    getEventAttendees: vi.fn().mockResolvedValue([]),
    isUserRsvpd: vi.fn().mockResolvedValue(true),
  },
}));
vi.mock('@/app/data/event-close-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-close-service')>()),
  getEventClose: vi.fn(async () => ({ isAttendee: true, score: 9, liked: null, improve: null, quoteOk: null, asks: [], finished: series.finished })),
  getCommunitySlug: vi.fn().mockResolvedValue(null),
  getSeriesPeople: vi.fn().mockResolvedValue(0),
  saveEventFeedback: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/app/data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/api')>()),
  getProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: () => null }));
vi.mock('@/app/data/points-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/data/points-service')>();
  return { ...actual, pointsService: { ...actual.pointsService, getPublicPointsFeed: vi.fn().mockResolvedValue([]) } };
});
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
  loadTagPoints: vi.fn().mockResolvedValue([]),
}));

import { EventClosePage } from '@/app/prototypes/events/close/EventClosePage';
import { useCloseBack } from '@/app/prototypes/events/close/use-close-back';
import { replaceIntoClose } from '@/app/prototypes/events/close/close-arrival';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useNavigate } from 'react-router-dom';

function Page({ name }: { name: string }) {
  return <p data-testid="page">{name}</p>;
}

/** The close reads its opener's marks from the route state of its own entry (once, at mount). */
let arrival: Record<string, unknown> | null = null;
function arriveWith(state: Record<string, unknown> | null) {
  arrival = state;
}

/** The close entry's route state, as the router holds it now (it must keep the opener's marks — round 4, G2). */
function StateProbe() {
  return <i data-testid="close-state" data-state={JSON.stringify(useLocation().state ?? null)} data-search={useLocation().search} />;
}

function mount(paths: string[]) {
  const entries = paths.map((p, i) => (i === paths.length - 1 ? { pathname: p.split('?')[0], search: p.includes('?') ? `?${p.split('?')[1]}` : '', state: arrival } : p));
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/events" element={<Page name="list" />} />
        <Route path="/events/:slug" element={<><FocusHeader fallback="/events" /><Page name="event" /></>} />
        <Route path="/events/:slug/room" element={<><Page name="room" /><StateProbe /></>} />
        <Route path="/events/:slug/ready" element={<Page name="ready" />} />
        <Route path="/events/:slug/meet" element={<Page name="room" />} />
        <Route path="/events/:slug/close" element={<><EventClosePage /><StateProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}
const page = () => screen.getByTestId('page').textContent;

beforeEach(() => {
  auth.value = { user: { id: 'u1' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
  series.slug = null;
  series.finished = true;
  arrival = null;
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  ['Clarity Night', null],
  ['a hike', 'social-hike'],
])('%s thank-you: "Back to the event"', (_name, slug) => {
  beforeEach(() => { series.slug = slug; });

  it('room -> close (fromRoom + fromEvent): lands on the event, and the event\'s own Back reaches the list', async () => {
    arriveWith({ fromRoom: true, fromEvent: true, roomDepth: 0 });
    mount(['/events', '/events/night', '/events/night/room', '/events/night/close']);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toBe('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('list'));
  });

  it('with Ready below the room (roomDepth 1): returns past Ready and the room too', async () => {
    arriveWith({ fromRoom: true, fromEvent: true, roomDepth: 1 });
    mount(['/events', '/events/night', '/events/night/ready', '/events/night/meet', '/events/night/close']);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toBe('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('list'));
  });

  it('opened by the event page (only fromEvent): pops', async () => {
    arriveWith({ fromEvent: true });
    mount(['/events', '/events/night', '/events/night/close']);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toBe('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('list'));
  });

  it('the room opened it but nothing says the event page is below the room: replaces with the event', async () => {
    arriveWith({ fromRoom: true });
    mount(['/elsewhere', '/events/night/room', '/events/night/close']);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toBe('event'));
    // The close entry became the event; the room is still below it (it was never the event page's child here).
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('room'));
  });
});

describe('round 4: the close keeps its opener\'s marks', () => {
  const state = () => JSON.parse(screen.getByTestId('close-state').dataset.state!);

  it('G2: the thank-you\'s ?done=1 replace keeps fromRoom, fromEvent and roomDepth on the entry (a reload still knows them)', async () => {
    arriveWith({ fromRoom: true, fromEvent: true, roomDepth: 1 });
    mount(['/events', '/events/night', '/events/night/ready', '/events/night/meet', '/events/night/close']);
    await waitFor(() => expect(screen.getByTestId('close-state').dataset.search).toContain('done=1'));
    expect(state()).toEqual({ fromRoom: true, fromEvent: true, roomDepth: 1 });
  });

  it('G1: the event page opened the close (no room below): Back to the room replaces with /room and carries fromEvent', async () => {
    let back: (() => void) | null = null;
    function Close() {
      back = useCloseBack('night').backToRoom;
      return <StateProbe />;
    }
    render(
      <MemoryRouter initialEntries={['/events/night', { pathname: '/events/night/close', state: { fromEvent: true } }]} initialIndex={1}>
        <Routes>
          <Route path="/events/:slug" element={<Page name="event" />} />
          <Route path="/events/:slug/room" element={<><Page name="room" /><StateProbe /></>} />
          <Route path="/events/:slug/close" element={<Close />} />
        </Routes>
      </MemoryRouter>,
    );
    act(() => back!());
    await waitFor(() => expect(page()).toBe('room'));
    // The room's gate (/room) opens the series' own view and passes this state on, so the room's Back still pops.
    expect(state()).toEqual({ fromEvent: true });
  });
});

describe('round 4 addendum', () => {
  it('O-M1: a reload on the thank-you (?done=1) still knows the room and the event below it', async () => {
    arriveWith({ fromRoom: true, fromEvent: true, roomDepth: 0 });
    mount(['/events', '/events/night', '/events/night/room', '/events/night/close?done=1']);
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toBe('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('list'));
  });

  it("O-M2: the room's Join → learning (then=join) → close keeps the room's marks, so the thank-you's Back lands on the event", async () => {
    let backToEvent: (() => void) | null = null;
    function Learning() {
      const navigate = useNavigate();
      const state = useLocation().state;
      return <button onClick={() => navigate('/events/night/close?join=1', replaceIntoClose(state, { joinViaLearning: true }))}>finish</button>;
    }
    function Close() {
      backToEvent = useCloseBack('night').backToEvent;
      return <StateProbe />;
    }
    render(
      <MemoryRouter
        initialEntries={['/events', '/events/night', '/events/night/meet', { pathname: '/events/night/prepare', search: '?from=room&then=join', state: { fromRoom: true, fromEvent: true, roomDepth: 0, other: 1 } }]}
        initialIndex={3}
      >
        <Routes>
          <Route path="/events" element={<Page name="list" />} />
          <Route path="/events/:slug" element={<><FocusHeader fallback="/events" /><Page name="event" /></>} />
          <Route path="/events/:slug/meet" element={<Page name="room" />} />
          <Route path="/events/:slug/prepare" element={<Learning />} />
          <Route path="/events/:slug/close" element={<Close />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('finish'));
    await waitFor(() => expect(JSON.parse(screen.getByTestId('close-state').dataset.state!)).toEqual({ fromRoom: true, fromEvent: true, roomDepth: 0, joinViaLearning: true }));
    act(() => backToEvent!());
    await waitFor(() => expect(page()).toBe('event'));
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('list'));
  });

  it('O-M2: the room pushes the learning with its marks, and both learning exits into /close keep them', () => {
    const src = (p: string) => readFileSync(join(__dirname, '../..', p), 'utf8');
    const room = src('src/app/prototypes/events/components/EventRoomMeet.tsx');
    const prep = src('src/app/prototypes/events/prep/EventPrepPage.tsx');
    // P1542 review G3: from the room, a non-learner's Join learns IN the room (?view=learn&then=join, the room's marks
    // kept by use-room-views.ts) — p1542-founder-uat-room.test.tsx exercises it. The standalone exits below stay.
    expect(room).toMatch(/onLearnFirst=\{\(\) => openLearn\(true\)\}/);
    expect(prep).toMatch(/close\?join=1`, replaceIntoClose\(location\.state, \{ joinViaLearning: true \}\)\)/);
    expect(prep).toMatch(/close`, replaceIntoClose\(location\.state\)\)/);
  });
});

describe('round 5', () => {
  it('G2: the close keeps only the room\'s marks on its entry — a transient flag is never re-written by its replace', async () => {
    arriveWith({ fromRoom: true, fromEvent: true, roomDepth: 0, joinViaLearning: true, other: 1 });
    mount(['/events', '/events/night', '/events/night/meet', '/events/night/close']);
    await waitFor(() => expect(screen.getByTestId('close-state').dataset.search).toContain('done=1'));
    expect(JSON.parse(screen.getByTestId('close-state').dataset.state!)).toEqual({ fromRoom: true, fromEvent: true, roomDepth: 0 });
  });

  it("C1: the thank-you's Join into the learning carries the room's marks, so the learning's replace back into /close keeps them", () => {
    const close = readFileSync(join(__dirname, '../..', 'src/app/prototypes/events/close/EventClosePage.tsx'), 'utf8');
    expect(close).toMatch(/navigate\(`\/events\/\$\{event\.slug\}\/prepare\?from=room&then=join`, replaceIntoClose\(arrival\)\)/);
    expect(replaceIntoClose({ fromRoom: true, fromEvent: true, roomDepth: 2, joinViaLearning: true })).toEqual({
      replace: true,
      state: { fromRoom: true, fromEvent: true, roomDepth: 2 },
    });
  });
});

describe('§1a on /close (Done-When evidence)', () => {
  it('no transcription control on /close — neither the compact one nor the full-width row', async () => {
    arriveWith({ fromRoom: true, fromEvent: true, roomDepth: 0 });
    mount(['/events/night', '/events/night/meet', '/events/night/close']);
    expect(await screen.findByRole('button', { name: 'Back to the event' })).toBeInTheDocument();
    expect(screen.queryByTestId('room-transcribe-idle')).toBeNull();
    expect(screen.queryByTestId('room-transcribe-start')).toBeNull();
    expect(screen.queryByText('Not transcribing')).toBeNull();
  });
});

