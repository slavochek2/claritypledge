// @vitest-environment jsdom
/**
 * P1542 founder UAT round (2026-10-29):
 *  (1) desktop (lg+): "Back to the event" sits on the room's step bar row, in its pinned head (the shell bar's row,
 *      which held only the Back, is not drawn); below lg the Back stays in the shell bar with the step bar under it;
 *  (2) Share feedback opens INSIDE the room (?view=feedback on the same /meet path, one more room entry, no page change),
 *      Back returns to the room; the thank-you's Join (?join=1) opens the group terms there too.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ShellTopBar, ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } } }) }));
const capture = vi.hoisted(() => ({
  phase: 'idle', barVisible: false,
  isCapturingForEvent: () => false,
  startCapture: async () => ({ started: true }),
}));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflineStripShown: () => false,
}));
vi.mock('@/app/components/layout/app-shell/shell-nav', () => ({ useHideTodaysStripForEvent: () => {} }));
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn().mockResolvedValue(true), runSelfWrite: vi.fn() }),
}));
const roster = vi.hoisted(() => ({ onUpdate: null as null | ((r: unknown[]) => void), onFailed: null as null | (() => void) }));
vi.mock('@/app/data/event-room-service', () => ({
  setRoomOptIn: vi.fn(), setRoomRating: vi.fn(), resetRoomAnswer: vi.fn(),
  subscribeToRoomRoster: (_id: string, onUpdate: (r: unknown[]) => void, onFailed?: () => void) => {
    roster.onUpdate = onUpdate;
    roster.onFailed = onFailed ?? null;
    return Object.assign(() => {}, { refresh: () => {} });
  },
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/prototypes/events/prep/EventPrepPage', () => ({
  PrepFlow: ({ room }: { room: { onStep: (s: string) => void } }) => <button type="button" onClick={() => room.onStep('close')}>learning finished</button>,
}));
vi.mock('@/app/prototypes/events/prep/PrepPieces', () => ({
  JoinOffer: ({ onJoin }: { onJoin: () => void }) => <button type="button" onClick={onJoin}>Join the group</button>,
}));
// The round card reports the evening's moment (it owns the poll); tests set what it reports.
const roundMoment = vi.hoisted(() => ({ value: null as null | Record<string, boolean> }));
vi.mock('@/app/prototypes/events/rounds/RoundCard', async () => {
  const { useEffect } = await import('react');
  return {
    RoundCard: ({ onMoment }: { onMoment: (m: Record<string, boolean>) => void }) => {
      useEffect(() => { if (roundMoment.value) onMoment(roundMoment.value); }, [onMoment]);
      return null;
    },
  };
});
vi.mock('@/app/prototypes/events/components/PracticeRooms', () => ({ PracticeRooms: () => null }));
const fb = vi.hoisted(() => ({ finished: false as boolean | undefined }));
const learnedRef = vi.hoisted(() => ({ value: true }));
vi.mock('@/app/prototypes/events/use-feedback-finished', () => ({ useFeedbackFinished: () => fb.finished }));
vi.mock('@/app/prototypes/events/use-event-community', () => ({ useEventMembership: () => false, useEventCommunityName: () => 'Hikers' }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: false, error: false, learned: learnedRef.value, progress: { done: 3 }, minutes: 0, reload: vi.fn() }),
}));

// The close flow itself is tested on its own (p1542-close-in-room.test.tsx); here, what it was given.
type RoomCb = { leave: () => void; onFinished?: () => void; learnThenJoin?: () => void };
const closeMounts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/app/prototypes/events/close/CloseInRoom', async () => {
  const { useEffect } = await import('react');
  return { CloseInRoom: ({ event, room }: { event: { slug: string }; room: RoomCb }) => {
  useEffect(() => { closeMounts.count += 1; }, []);
  return (
    <div data-testid="close-in-room">
      {event.slug}
      <button type="button" onClick={room.leave}>close back</button>
      <button type="button" onClick={() => room.onFinished?.()}>close finished</button>
      <button type="button" onClick={() => room.learnThenJoin?.()}>close join unlearned</button>
    </div>
  );
  } };
});

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';

const hike = { id: 'ev-1', slug: 'walk', title: 'Social Hike: Walk', datetime: '2000-01-01T08:00:00Z', durationMinutes: 120, hostId: 'h', seriesSlug: 'social-hike', statementTag: null, orgId: 'org-1' };
const night = { id: 'ev-2', slug: 'night', title: 'Night', datetime: '2000-01-01T11:00:00Z', durationMinutes: 120, hostId: 'h', seriesSlug: null, statementTag: null };

function Probe() {
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <i data-testid="loc" data-path={loc.pathname} data-search={loc.search} data-state={JSON.stringify(loc.state ?? null)} />
      <button type="button" data-testid="browser-back" onClick={() => navigate(-1)}>browser back</button>
    </>
  );
}

type Entry = string | { pathname: string; search?: string; state?: unknown };
function mount(slug: string, state: Record<string, unknown>, entries?: Entry[]) {
  const all: Entry[] = entries ?? [`/events/${slug}`, { pathname: `/events/${slug}/meet`, state }];
  return render(
    <ShellTopBarProvider enabled>
      <ShellTopBar />
      <MemoryRouter initialEntries={all} initialIndex={all.length - 1}>
        <Routes>
          <Route path="/events/:slug" element={<p data-testid="page">event</p>} />
          <Route path="/events/:slug/ready" element={<><p data-testid="page">ready</p><Probe /></>} />
          <Route path="/events/:slug/meet" element={<><EventRoomMeet /><Probe /></>} />
          <Route path="/events/:slug/close" element={<p data-testid="page">close page</p>} />
        </Routes>
      </MemoryRouter>
    </ShellTopBarProvider>,
  );
}
const loc = () => screen.getByTestId('loc');
const shellBar = () => document.querySelector('[data-shell-top-bar]') as HTMLElement;

function setWide(wide: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: wide && q.includes('1024'), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
const realMatchMedia = window.matchMedia;

beforeEach(() => {
  fb.finished = false;
  learnedRef.value = true;
  closeMounts.count = 0;
  setWide(false);
  room.access = { slug: 'walk', event: hike, loading: false, granted: true, isLoggedIn: true, offline: false };
});
afterEach(() => { window.matchMedia = realMatchMedia; });

describe('(1) the step bar on the Back row, desktop only', () => {
  it('lg+: "Back to the event" sits on the step bar\'s own row in the pinned head; the shell bar row holds nothing', () => {
    setWide(true);
    mount('walk', { fromEvent: true, roomStep: 'close' });
    const head = screen.getByTestId('room-sticky-head');
    const back = within(head).getByRole('button', { name: 'Back to the event' });
    const steps = within(head).getByTestId('room-step-close');
    // One row: the Back and the step bar are siblings' contents of the same flex row.
    // Founder UAT (2026-10-29): the Back is in the same pinned head, at its far left (not inside the tabs' row).
    expect(back.closest('[data-testid="room-head-back"]')).not.toBeNull();
    expect(steps.closest('[data-testid="room-head-row"]')).not.toBeNull();
    expect(within(shellBar()).queryByRole('button', { name: 'Back to the event' })).toBeNull();
    expect(shellBar().textContent).toBe('');
  });

  it('founder UAT (1): on lg+ "Back to the event" sits at the far left of the content area, its full label, outside the tabs\' row', () => {
    setWide(true);
    mount('walk', { fromEvent: true, roomStep: 'close' });
    const back = within(screen.getByTestId('room-sticky-head')).getByRole('button', { name: 'Back to the event' });
    expect(back).toHaveTextContent('Back to the event');
    // Not squeezed into the centred row beside the tabs (that row truncated it to "Back to the e…").
    expect(back.closest('[data-testid="room-head-row"]')).toBeNull();
    expect(back.closest('[data-testid="room-head-back"]')).not.toBeNull();
    expect(back.closest('[class*="max-w-"]')).toBeNull();
    // The tabs are centred on the content column, with equal side space keeping them clear of the Back.
    expect(screen.getByTestId('room-head-row').className.split(' ')).toEqual(expect.arrayContaining(['justify-center', 'px-48']));
  });

  it.skip('D6 (superseded by founder UAT (1): the Back no longer shares the tabs\' row)', () => {
    setWide(true);
    mount('walk', { fromEvent: true, roomStep: 'close' });
    const back = within(screen.getByTestId('room-sticky-head')).getByRole('button', { name: 'Back to the event' });
    // The Back's own box may shrink (it does not refuse to), and its label truncates inside it.
    expect(back.parentElement!.className.split(' ')).toEqual(expect.arrayContaining(['min-w-0']));
    expect(back.parentElement!.className.split(' ')).not.toContain('shrink-0');
    expect(back.querySelector('span')!.className).toContain('truncate');
  });

  it('below lg: the Back stays in the shell top bar and the step bar under it, in the room\'s sticky head', () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    expect(within(shellBar()).getByRole('button', { name: 'Back to the event' })).toBeInTheDocument();
    expect(within(shellBar()).queryByTestId('room-step-close')).toBeNull();
    expect(within(screen.getByTestId('room-sticky-head')).getByTestId('room-step-close')).toBeInTheDocument();
  });
});

describe('(2) Share feedback opens inside the room', () => {
  it('a hike\'s "Start now": the same /meet page, ?view=feedback, one more room entry; Back returns to the room', async () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toHaveTextContent('walk'));
    expect(loc().dataset.path).toBe('/events/walk/meet');
    expect(loc().dataset.search).toBe('?view=feedback');
    expect(JSON.parse(loc().dataset.state!)).toMatchObject({ fromEvent: true, roomDepth: 1 });
    expect(screen.queryByText('close page')).toBeNull();
    // The room's own content stays mounted but hidden under the feedback (as under the learning).
    expect(screen.getByTestId('room-close-feedback').closest('.hidden')).not.toBeNull();
    fireEvent.click(screen.getByTestId('browser-back'));
    await waitFor(() => expect(screen.getByTestId('room-close-feedback').closest('.hidden')).toBeNull());
    expect(screen.queryByTestId('close-in-room')).toBeNull(); // round 4: drawn only while shown
    expect(loc().dataset.search).toBe('');
  });

  it('the finished thank-you\'s Join (learned): the group terms open in the room too (?view=feedback&join=1)', async () => {
    fb.finished = true;
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(await screen.findByRole('button', { name: 'Join the group' }));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    expect(loc().dataset.path).toBe('/events/walk/meet');
    expect(new URLSearchParams(loc().dataset.search).get('view')).toBe('feedback');
    expect(new URLSearchParams(loc().dataset.search).get('join')).toBe('1');
    expect(JSON.parse(loc().dataset.state!)).toMatchObject({ fromEvent: true, roomDepth: 1 });
  });

  it('Clarity Night\'s "Give feedback" opens in the room the same way', async () => {
    room.access = { ...room.access as object, slug: 'night', event: night };
    mount('night', { fromEvent: true, fromReady: true });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toHaveTextContent('night'));
    expect(loc().dataset.path).toBe('/events/night/meet');
    expect(loc().dataset.search).toBe('?view=feedback');
    expect(JSON.parse(loc().dataset.state!)).toMatchObject({ fromEvent: true, fromReady: true, roomDepth: 1 });
  });
});

describe('review round: one history model for the room\'s views', () => {
  const state = () => JSON.parse(loc().dataset.state!);

  it('G1: feedback, then the Learn tab, then a room tab: no stacked entry; Back to the event lands on the event', async () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=feedback'));
    fireEvent.click(screen.getByTestId('room-step-learn'));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=learn'));
    expect(state().roomDepth).toBe(1); // view to view replaces: still one entry above the room
    fireEvent.click(screen.getByTestId('room-step-principle'));
    await waitFor(() => expect(loc().dataset.search).toBe(''));
    fireEvent.click(within(shellBar()).getByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('event'));
  });

  it('G1: after feedback → Learn → a room tab, browser Back shows the room, never the feedback again', async () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=feedback'));
    fireEvent.click(screen.getByTestId('room-step-learn'));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=learn'));
    fireEvent.click(screen.getByTestId('room-step-principle'));
    await waitFor(() => expect(loc().dataset.search).toBe(''));
    fireEvent.click(screen.getByTestId('browser-back'));
    await waitFor(() => expect(state().roomDepth ?? 0).toBe(0));
    expect(loc().dataset.search).toBe('');
    expect(screen.queryByTestId('close-in-room')).toBeNull(); // round 4: drawn only while shown
  });

  it('C4/G4: the close\'s own Back pops the entry the room pushed — browser Back then leaves the room', async () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'close back' }));
    await waitFor(() => expect(screen.queryByTestId('close-in-room')).toBeNull()); // round 4: drawn only while shown
    expect(state().roomDepth ?? 0).toBe(0);
    fireEvent.click(screen.getByTestId('browser-back'));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('event'));
  });

  it('C4: a cold ?view=feedback (nothing pushed): the close\'s Back replaces with the plain room', async () => {
    mount('walk', {}, [{ pathname: '/events/walk/meet', search: '?view=feedback', state: { fromEvent: true } }]);
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'close back' }));
    await waitFor(() => expect(loc().dataset.search).toBe(''));
    expect(loc().dataset.path).toBe('/events/walk/meet');
    expect(state()).toMatchObject({ fromEvent: true });
  });

  it('C1: Clarity Night ready → meet → feedback, "Back to readiness" lands on Ready', async () => {
    room.access = { ...room.access as object, slug: 'night', event: { ...night, datetime: '2099-01-01T11:00:00Z' } };
    const meet = { fromReady: true, fromEvent: true };
    mount('night', {}, [
      '/events/night',
      { pathname: '/events/night/ready', state: { fromEvent: true } },
      { pathname: '/events/night/meet', state: meet },
      // The room's feedback view, pushed from Meet (one room entry above it).
      { pathname: '/events/night/meet', search: '?view=feedback', state: { ...meet, roomDepth: 1, pushedView: true } },
    ]);
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Back to readiness' }));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('ready'));
  });

  it('G6: a cold ?view=feedback URL shows Share feedback as the current step, whatever step was in view', async () => {
    // A hike that has not started: the room's own step is Decide, and the feedback is open (a hike's always is).
    room.access = { ...room.access as object, event: { ...hike, datetime: '2099-01-01T08:00:00Z' } };
    mount('walk', {}, [{ pathname: '/events/walk/meet', search: '?view=feedback', state: { fromEvent: true, roomStep: 'principle' } }]);
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    expect(screen.getByTestId('room-step-close')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('room-step-principle')).not.toHaveAttribute('aria-current');
  });

  it('G2: finishing the feedback inside the room ticks Share feedback and ends the room\'s offer — no re-read needed', async () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    fireEvent.click(await screen.findByRole('button', { name: 'close finished' }));
    await waitFor(() => expect(screen.getByTestId('room-step-close-check')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('browser-back'));
    await waitFor(() => expect(screen.getByTestId('room-close-heading')).toHaveTextContent('Thanks, your feedback is in.'));
    expect(screen.queryByTestId('room-close-feedback')).toBeNull();
  });

  it('G3: a non-learner\'s Join (room or thank-you) learns IN the room and comes back to the group terms there', async () => {
    fb.finished = true;
    learnedRef.value = false;
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(await screen.findByRole('button', { name: 'Join the group' }));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=learn&then=join'));
    expect(loc().dataset.path).toBe('/events/walk/meet');
    expect(state()).toMatchObject({ fromEvent: true, roomDepth: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'learning finished' }));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=feedback&join=1'));
    expect(state()).toMatchObject({ fromEvent: true, roomDepth: 1, joinViaLearning: true });
  });

  it('G3: the in-room thank-you\'s Join for a non-learner learns in the room too', async () => {
    learnedRef.value = false;
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    fireEvent.click(await screen.findByRole('button', { name: 'close join unlearned' }));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=learn&then=join'));
    expect(state()).toMatchObject({ fromEvent: true, roomDepth: 1 });
  });

  it('round 4: a room tab closes the feedback view entirely (no hidden copy); opening it again draws it afresh', async () => {
    mount('walk', { fromEvent: true, roomStep: 'close' });
    fireEvent.click(screen.getByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('room-step-principle'));
    await waitFor(() => expect(loc().dataset.search).toBe(''));
    expect(screen.queryByTestId('close-in-room')).toBeNull();
    fireEvent.click(screen.getByTestId('room-step-close'));
    fireEvent.click(await screen.findByTestId('room-close-feedback'));
    await waitFor(() => expect(screen.getByTestId('close-in-room')).toBeInTheDocument());
    expect(closeMounts.count).toBe(2);
  });

  it('R5: a learning that finishes after the person picked another tab changes nothing (late save, stale callback)', async () => {
    room.access = { ...room.access as object, event: { ...hike, datetime: '2099-01-01T08:00:00Z' } };
    mount('walk', { fromEvent: true });
    fireEvent.click(screen.getByTestId('room-step-learn'));
    await waitFor(() => expect(loc().dataset.search).toBe('?view=learn'));
    fireEvent.click(screen.getByTestId('room-step-principle'));
    await waitFor(() => expect(loc().dataset.search).toBe(''));
    // The hidden learning's save lands now and reports its finish.
    fireEvent.click(screen.getByRole('button', { name: 'learning finished', hidden: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(loc().dataset.search).toBe('');
    expect(screen.getByTestId('room-step-principle')).toHaveAttribute('aria-current', 'step');
  });
});

