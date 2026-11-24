// @vitest-environment jsdom
/**
 * P1718: the mastermind's Ready step, with a Skip.
 *  - R2/R3: Skip and an untouched Continue store nothing and open Meet; a moved slider saves the answer.
 *  - R4: a skip (or a failed save) is remembered per person and event on this device; the gate honours it.
 *  - R3/R4: storage blocked, a double tap, or a stalled read or save never strands or double-saves.
 *  - R6: Clarity Night keeps Compare and gains Skip.
 *  - R7: /ready's step bar is the room's own (Learn and prepare for the mastermind, no Compare).
 *  - R8: someone seated at a running round never sees Ready.
 *  - R9: the mastermind's host goes straight to Meet.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, within, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const room = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  self: null as Record<string, unknown> | null,
  refresh: (() => Promise.resolve()) as (signal?: AbortSignal) => Promise<void>,
  prepGate: false as boolean | null,
  arrivalGate: false as boolean | null,
  capturing: false,
}));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: room.self, loading: false, refresh: room.refresh }),
}));
const net = vi.hoisted(() => ({ offline: false }));
vi.mock('@/app/contexts/offline-status-context', async (importActual) => ({
  ...(await importActual<typeof import('@/app/contexts/offline-status-context')>()),
  useConnectivity: () => ({ offline: net.offline, reconnectTick: 0 }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn().mockResolvedValue([]),
  setRoomReadiness: vi.fn(),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({
  PrepRoomBanner: () => <div data-testid="prep-room-banner" />,
  PrepRoomGate: () => <p data-testid="prep-gate" />,
  useRoomPrepGate: () => ({ gate: room.prepGate }),
}));
vi.mock('@/app/prototypes/events/arrival/ArrivalGate', () => ({
  useArrivalGate: () => ({ gate: room.arrivalGate, answered: () => {} }),
  ArrivalQuestion: () => <p data-testid="arrival-question" />,
}));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ isCapturingForEvent: () => room.capturing }),
}));
// The mastermind's step bar reads the learning and the canvas; neither is the subject here.
// Review round 14: each mock also counts its mounts (a remount is a fresh hook: its reads and counters start again).
const prep = vi.hoisted(() => ({ state: { loading: false, error: false, learned: false }, asked: [] as unknown[], mounts: 0 }));
vi.mock('@/app/prototypes/events/prep/use-learned', async () => {
  const { useState } = await import('react');
  return {
    useLearned: (ev: unknown) => { useState(() => { prep.mounts += 1; return 0; }); prep.asked.push(ev); return prep.state; },
  };
});
const canvas = vi.hoisted(() => ({ shared: false, asked: [] as boolean[], mounts: 0, again: [] as unknown[] }));
vi.mock('@/app/prototypes/events/rounds/canvas-setup', async (importOriginal) => {
  const { useState } = await import('react');
  return {
    ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/canvas-setup')>()),
    useMyCanvasShared: (_eventId: string | undefined, enabled: boolean, again: unknown) => {
      useState(() => { canvas.mounts += 1; return 0; });
      canvas.asked.push(enabled);
      if (enabled) canvas.again.push(again);
      return [canvas.shared, vi.fn()];
    },
  };
});

const rounds = vi.hoisted(() => ({
  read: (() => Promise.resolve({ rounds: [], seatsByRound: new Map() })) as () => Promise<unknown>,
}));
// Review round 7: /ready asks one question, isSeatedInRunningRound. The fixtures still describe the evening's rounds and
// seats, answered through the real currentRound, so each test states the evening rather than the answer.
vi.mock('@/app/data/event-rounds-service', async (importActual) => {
  const actual = await importActual<typeof import('@/app/data/event-rounds-service')>();
  return {
    ...actual,
    getEventRoundsState: () => rounds.read(),
    isSeatedInRunningRound: (_eventId: string, memberId: string) => rounds.read().then((state) => {
      const s = state as Parameters<typeof actual.currentRound>[0];
      const round = actual.currentRound(s);
      return !!round && (s.seatsByRound.get(round.id) ?? []).some((seat) => seat.id === memberId);
    }),
  };
});

// The redirect's element, recorded instead of followed.
const redirects = vi.hoisted(() => [] as { to: unknown; replace?: boolean; state?: unknown }[]);
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    Navigate: (props: { to: unknown; replace?: boolean; state?: unknown }) => {
      redirects.push(props);
      return null;
    },
  };
});

import { EventRoomReady, READY_SAVE_MS } from '@/app/prototypes/events/components/EventRoomReady';
import { useReadyStepBarReads } from '@/app/prototypes/events/components/ReadyStepBar';
import { ROUNDS_READ_MS } from '@/app/prototypes/events/components/use-seated-at-running-round';
import { EventRoomGate } from '@/app/prototypes/events/components/EventRoomGate';
import { readySkipped, rememberReadySkipped } from '@/app/prototypes/events/components/ready-skip-memory';
import { RoomSteps, type RoomStep } from '@/app/prototypes/events/rounds/RoomSteps';
import { SALES_MASTERMIND_RECIPE, SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import { getRoomReadinessDistribution, setRoomReadiness } from '@/app/data/event-room-service';

const base = { datetime: '2099-01-01T11:00:00Z', durationMinutes: 60, hostId: 'host-1' };
const night = { ...base, id: 'ev-night', slug: 'night', title: 'Night', seriesSlug: null };
const mastermind = { ...base, id: 'ev-mm', slug: 'mm', title: 'Mastermind', seriesSlug: 'sales-mastermind' };
const hike = { ...base, id: 'ev-hike', slug: 'hike', title: 'Hike', seriesSlug: 'social-hike' };

const selfA = { id: 'member-a', profileId: 'profile-a', readinessValue: null as number | null };
const selfB = { id: 'member-b', profileId: 'profile-b', readinessValue: null as number | null };

type TestEvent = typeof base & { id: string; slug: string; title: string; seriesSlug: string | null };

function setRoom(event: TestEvent, self: Record<string, unknown> | null = selfA) {
  room.access = { slug: event.slug, event, loading: false, granted: true, isLoggedIn: true, offline: false };
  room.self = self;
}

function Page({ name }: { name: string }) {
  const state = useLocation().state as Record<string, unknown> | null;
  return <p data-testid="page" data-state={JSON.stringify(state)}>{name}</p>;
}

// With a self in the room, the page holds its loader until the rounds read answers (use-seated-at-running-round.ts).
async function mountReady(slug: string) {
  mountReadyNoWait(slug);
  await screen.findByTestId('room-ready');
}

function mountReadyNoWait(slug: string) {
  // A fresh element each time: re-rendering the identical one lets React skip the subtree.
  const tree = () => (
    <MemoryRouter initialEntries={[{ pathname: `/events/${slug}/ready`, state: { fromEvent: true } }]}>
      <Routes>
        <Route path="/events/:slug/ready" element={<EventRoomReady />} />
        <Route path="/events/:slug/meet" element={<Page name="meet" />} />
      </Routes>
    </MemoryRouter>
  );
  const view = render(tree());
  // Re-render the mounted screen, so a changed mock (connectivity) is read again (MemoryRouter keeps its entries).
  return { rerender: () => view.rerender(tree()) };
}

function PageWithSearch() {
  const location = useLocation();
  return <p data-testid="page" data-state={JSON.stringify(location.state)}>{`meet${location.search}`}</p>;
}

function mountWithSearch(slug: string) {
  render(
    <MemoryRouter initialEntries={[{ pathname: `/events/${slug}/ready`, state: { fromEvent: true } }]}>
      <Routes>
        <Route path="/events/:slug/ready" element={<EventRoomReady />} />
        <Route path="/events/:slug/meet" element={<PageWithSearch />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mountGate(slug: string) {
  return render(
    <MemoryRouter initialEntries={[`/events/${slug}/room`]}>
      <Routes><Route path="/events/:slug/room" element={<EventRoomGate />} /></Routes>
    </MemoryRouter>,
  );
}

const expectOnMeet = async () => {
  await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('meet'));
  expect(JSON.parse(screen.getByTestId('page').dataset.state!)).toEqual({ fromReady: true, fromEvent: true });
};
const moveSlider = () => fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });

beforeEach(() => {
  redirects.length = 0;
  net.offline = false;
  localStorage.clear();
  vi.mocked(setRoomReadiness).mockReset();
  vi.mocked(getRoomReadinessDistribution).mockClear();
  room.refresh = () => Promise.resolve();
  room.prepGate = false;
  room.arrivalGate = false;
  room.capturing = false;
  rounds.read = () => Promise.resolve({ rounds: [], seatsByRound: new Map() });
  canvas.shared = false;
  canvas.asked.length = 0;
  canvas.mounts = 0;
  canvas.again.length = 0;
  prep.state = { loading: false, error: false, learned: false };
  prep.asked.length = 0;
  prep.mounts = 0;
  setRoom(night);
});
// Review round 14: a save that never answers leaves settleWithin's 5 s budget running past its test, and its catch then
// remembers a skip in whatever test is running (seen under load: "expected true to be false" on readySkipped). Every
// held save is ended with its test, so that skip is written before the next test clears storage, never during it.
const stalledSaves: Array<(reason: unknown) => void> = [];
function stalled(keep: (resolve: () => void) => void = () => {}): Promise<never> {
  return new Promise<never>((resolve, reject) => {
    keep(() => resolve(undefined as never));
    stalledSaves.push(reject);
  });
}
afterEach(async () => {
  stalledSaves.splice(0).forEach((reject) => reject(new Error('test ended')));
  await new Promise((r) => setTimeout(r, 0));
  vi.restoreAllMocks();
});

describe('Skip and an untouched Continue store nothing', () => {
  it('Skip: no readiness saved, lands on /meet with the marks, remembered for this person and event', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    fireEvent.click(screen.getByTestId('room-ready-skip'));
    await expectOnMeet();
    expect(setRoomReadiness).not.toHaveBeenCalled();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(true);
  });

  it.each([
    ['the mastermind', mastermind],
    ['a Clarity Night', night],
  ])('an untouched Continue behaves as Skip (%s)', async (_name, event) => {
    setRoom(event);
    await mountReady(event.slug);
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(setRoomReadiness).not.toHaveBeenCalled();
    expect(readySkipped('profile-a', event.id)).toBe(true);
  });
});

describe('Continue saves only an answer', () => {
  it('a moved slider then Continue saves the moved value once and remembers no skip', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue(undefined as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
    expect(setRoomReadiness).toHaveBeenCalledWith('member-a', 6);
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  it('a save that rejects still lands on /meet and is remembered as a skip', async () => {
    vi.mocked(setRoomReadiness).mockRejectedValue(new Error('offline'));
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(true);
  });

  it('a double tap on Continue (save pending) saves once', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    const cont = screen.getByTestId('room-ready-continue');
    fireEvent.click(cont);
    fireEvent.click(cont);
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
  });

  it('Skip during a pending save does nothing more: one save, no skip remembered', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    fireEvent.click(screen.getByTestId('room-ready-skip'));
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('while the save is in flight both buttons are busy (disabled), and Continue says so', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await waitFor(() => expect(screen.getByTestId('room-ready-continue')).toBeDisabled());
    expect(screen.getByTestId('room-ready-continue')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('room-ready-skip')).toBeDisabled();
  });

  it('a step-bar tap during a pending save does nothing: no skip over the answer, no navigation (review round 2)', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    mountWithSearch('mm');
    await screen.findByTestId('room-ready');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    fireEvent.click(screen.getByTestId('room-step-close'));
    fireEvent.click(screen.getByTestId('room-step-learn'));
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
    expect(screen.queryByTestId('page')).toBeNull();
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
  });

  it('Back during a pending save leaves for the event, and the save landing later does not pull them into the room (review round 3)', async () => {
    let finish: () => void = () => {};
    vi.mocked(setRoomReadiness).mockReturnValue(stalled((r) => { finish = r; }) as never);
    setRoom(mastermind);
    render(
      <MemoryRouter initialEntries={[{ pathname: '/events/mm/ready', state: { fromEvent: true } }]}>
        <Routes>
          <Route path="/events/:slug" element={<Page name="event" />} />
          <Route path="/events/:slug/ready" element={<EventRoomReady />} />
          <Route path="/events/:slug/meet" element={<Page name="meet" />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByTestId('room-ready');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    fireEvent.click(within(screen.getByTestId('room-head-row')).getAllByRole('button')[0]);
    expect(await screen.findByTestId('page')).toHaveTextContent('event');
    await act(async () => { finish(); await Promise.resolve(); await Promise.resolve(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId('page')).toHaveTextContent('event');
  });

  // Review round 9 (Codex): Back stops the post-save re-read too — none starts after Back, and one running is aborted.
  it('a save landing after Back starts no re-read; Back during the re-read aborts it', async () => {
    const reads: (AbortSignal | undefined)[] = [];
    room.refresh = vi.fn((signal?: AbortSignal) => { reads.push(signal); return new Promise<void>(() => {}); }) as typeof room.refresh;
    const mountWithEvent = () => render(
      <MemoryRouter initialEntries={[{ pathname: '/events/mm/ready', state: { fromEvent: true } }]}>
        <Routes>
          <Route path="/events/:slug" element={<Page name="event" />} />
          <Route path="/events/:slug/ready" element={<EventRoomReady />} />
          <Route path="/events/:slug/meet" element={<Page name="meet" />} />
        </Routes>
      </MemoryRouter>,
    );
    const back = () => fireEvent.click(within(screen.getByTestId('room-head-row')).getAllByRole('button')[0]);
    setRoom(mastermind);

    let finish: () => void = () => {};
    vi.mocked(setRoomReadiness).mockReturnValueOnce(stalled((r) => { finish = r; }) as never);
    const first = mountWithEvent();
    await screen.findByTestId('room-ready');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    back();
    await act(async () => { finish(); await new Promise((r) => setTimeout(r, 20)); });
    expect(reads).toHaveLength(0);
    first.unmount();

    vi.mocked(setRoomReadiness).mockResolvedValueOnce(undefined as never);
    mountWithEvent();
    await screen.findByTestId('room-ready');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]?.aborted).toBe(false);
    back();
    expect(await screen.findByTestId('page')).toHaveTextContent('event');
    expect(reads[0]?.aborted).toBe(true);
  });

  it('a save that lands after the budget still clears the skip remembered at the timeout (review round 3)', async () => {
    let finish: () => void = () => {};
    vi.mocked(setRoomReadiness).mockReturnValue(stalled((r) => { finish = r; }) as never);
    setRoom(mastermind);
    await mountReady('mm');
    vi.useFakeTimers();
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await act(async () => { await vi.advanceTimersByTimeAsync(READY_SAVE_MS + 10); });
    vi.useRealTimers();
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(true);
    await act(async () => { finish(); await Promise.resolve(); await Promise.resolve(); });
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  it('the slider does not move while the save is in flight, so the screen never shows an answer that was not sent (review round 4)', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    const before = screen.getByRole('slider').getAttribute('aria-valuenow');
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await waitFor(() => expect(screen.getByTestId('room-ready-continue')).toBeDisabled());
    moveSlider();
    moveSlider();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(before);
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
  });

  it('Skip says it is busy too while the save is in flight', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await waitFor(() => expect(screen.getByTestId('room-ready-skip')).toHaveAttribute('aria-busy', 'true'));
  });

  it('a failed re-save of an answer already stored writes no skip (review round 4)', async () => {
    vi.mocked(setRoomReadiness).mockRejectedValue(new Error('offline'));
    setRoom(mastermind, { ...selfA, readinessValue: 7 });
    await mountReady('mm');
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  it('answering after an earlier skip clears the remembered skip', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue(undefined as never);
    rememberReadySkipped('profile-a', 'ev-mm');
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  it('a double tap on Skip navigates once', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    const skip = screen.getByTestId('room-ready-skip');
    fireEvent.click(skip);
    fireEvent.click(skip);
    await expectOnMeet();
    expect(screen.getAllByTestId('page')).toHaveLength(1);
  });

  it('a value already stored: Continue without moving re-saves it (R3), and Ready is ticked on /ready', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue(undefined as never);
    setRoom(mastermind, { ...selfA, readinessValue: 8 });
    await mountReady('mm');
    expect(screen.getByRole('button', { name: /Ready, done/ })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(setRoomReadiness).toHaveBeenCalledWith('member-a', 8);
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  it('no value stored: Ready is not ticked on /ready', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    expect(screen.queryByRole('button', { name: /Ready, done/ })).toBeNull();
  });

  it('the save succeeds but the re-read fails: lands on /meet with no skip remembered', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue(undefined as never);
    room.refresh = () => Promise.reject(new Error('re-read failed'));
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });
});

describe('a stalled connection never strands the person', () => {
  afterEach(() => vi.useRealTimers());

  it('a save that never answers lets them in after READY_SAVE_MS, remembered as a skip', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(stalled() as never);
    setRoom(mastermind);
    await mountReady('mm');
    vi.useFakeTimers();
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await act(async () => { await vi.advanceTimersByTimeAsync(READY_SAVE_MS + 10); });
    vi.useRealTimers();
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(true);
  });

  it('a slow save that lands inside the budget, with a re-read that never answers, still lets them in at READY_SAVE_MS with no skip (review round 5)', async () => {
    let land: () => void = () => {};
    vi.mocked(setRoomReadiness).mockReturnValue(stalled((r) => { land = r; }) as never);
    const refreshed = vi.fn(() => new Promise<void>(() => {}));
    room.refresh = refreshed;
    setRoom(mastermind);
    await mountReady('mm');
    vi.useFakeTimers();
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await act(async () => { await vi.advanceTimersByTimeAsync(READY_SAVE_MS - 1000); });
    expect(redirects).toEqual([]);
    await act(async () => { land(); await vi.advanceTimersByTimeAsync(0); });
    expect(refreshed).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1010); });
    vi.useRealTimers();
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  // Review round 8 (Codex), rule 3: the re-read is told when the screen stops waiting, so its join fallback never
  // starts afterwards — once it answers, and once the budget runs out on a re-read that never answers.
  it('the re-read after a save carries a signal, aborted once the screen stops waiting', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue({} as never);
    const signals: (AbortSignal | undefined)[] = [];
    room.refresh = vi.fn((signal?: AbortSignal) => { signals.push(signal); return Promise.resolve(); }) as typeof room.refresh;
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(true);
  });

  it('a re-read that never answers is aborted when the save budget runs out', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue({} as never);
    const signals: (AbortSignal | undefined)[] = [];
    room.refresh = vi.fn((signal?: AbortSignal) => { signals.push(signal); return new Promise<void>(() => {}); }) as typeof room.refresh;
    setRoom(mastermind);
    await mountReady('mm');
    vi.useFakeTimers();
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(signals[0]?.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(READY_SAVE_MS + 10); });
    vi.useRealTimers();
    await expectOnMeet();
    expect(signals[0]?.aborted).toBe(true);
  });

  // Review round 8 (Codex): a stored answer read late never moves a slider the person has moved, nor the value a save sent.
  it('a stored answer that arrives after the person moved the slider leaves their value, and Continue saves it', async () => {
    vi.mocked(setRoomReadiness).mockResolvedValue({} as never);
    setRoom(mastermind);
    const view = mountReadyNoWait('mm');
    await screen.findByTestId('room-ready');
    moveSlider();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('6');
    setRoom(mastermind, { ...selfA, readinessValue: 8 });
    view.rerender();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('6');
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(setRoomReadiness).toHaveBeenCalledWith('member-a', 6);
  });

  it('a stored answer that arrives before the person touches the slider still fills it', async () => {
    setRoom(mastermind);
    const view = mountReadyNoWait('mm');
    await screen.findByTestId('room-ready');
    setRoom(mastermind, { ...selfA, readinessValue: 8 });
    view.rerender();
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('8');
  });

  // Review round 8 (Gemini), metered-services rule 3: a tab hidden while the save ran does not re-read the room row.
  it.each([['hidden', 0], ['visible', 1]] as const)('a save that lands on a %s tab re-reads the room row %i times, and lets them in with no skip', async (state, reads) => {
    vi.mocked(setRoomReadiness).mockResolvedValue({} as never);
    const refreshed = vi.fn(() => Promise.resolve());
    room.refresh = refreshed;
    setRoom(mastermind);
    await mountReady('mm');
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await expectOnMeet();
    expect(refreshed).toHaveBeenCalledTimes(reads);
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
    vis.mockRestore();
  });

  it('a slow save inside the budget whose re-read fails lets them in at once, with no skip (review round 5)', async () => {
    let land: () => void = () => {};
    vi.mocked(setRoomReadiness).mockReturnValue(stalled((r) => { land = r; }) as never);
    room.refresh = () => Promise.reject(new Error('re-read failed'));
    setRoom(mastermind);
    await mountReady('mm');
    vi.useFakeTimers();
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await act(async () => { await vi.advanceTimersByTimeAsync(READY_SAVE_MS - 1000); });
    await act(async () => { land(); await vi.advanceTimersByTimeAsync(0); });
    vi.useRealTimers();
    await expectOnMeet();
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });

  it('offline with the room row cached: Ready shows at once, the rounds read is not asked (review round 5)', async () => {
    const read = vi.fn(() => new Promise(() => {}));
    rounds.read = read;
    net.offline = true;
    setRoom(mastermind, { ...selfA });
    mountReadyNoWait('mm');
    expect(screen.getByTestId('room-ready')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });

  // Review round 7 (Gemini), metered-services rule 3: the readiness marks wait for a visible tab, and are not read where
  // Ready redirects (the mastermind's host).
  it('the readiness marks: not read on a hidden tab until it is shown, nor for the mastermind host', async () => {
    const dist = vi.mocked(getRoomReadinessDistribution);
    dist.mockClear();
    let state: DocumentVisibilityState = 'hidden';
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    setRoom(mastermind);
    mountReadyNoWait('mm');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(dist).not.toHaveBeenCalled();
    state = 'visible';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(dist).toHaveBeenCalledTimes(1));
    vis.mockRestore();
    cleanup();
    dist.mockClear();
    setRoom(mastermind, { id: 'member-h', profileId: 'host-1', readinessValue: null });
    mountReadyNoWait('mm');
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
    expect(dist).not.toHaveBeenCalled();
  });

  // Review round 13 (Codex, metered rule 4; replaces round 7's re-read): one seat read and one marks read a visit.
  // Going offline and back keeps the answer and the screen: no loader, no second read, and the step bar is not remounted,
  // so it asks nothing again either.
  it('offline and back: Ready stays, with no second seat, marks or step-bar read', async () => {
    const dist = vi.mocked(getRoomReadinessDistribution);
    const first = vi.fn(() => Promise.resolve({ rounds: [], seatsByRound: new Map() }));
    rounds.read = first;
    setRoom({ ...mastermind, canvasTiming: 'at_event' } as TestEvent);
    const view = mountReadyNoWait('mm');
    expect(await screen.findByTestId('room-ready')).toBeInTheDocument();
    await waitFor(() => expect(dist).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 3; i += 1) {
      net.offline = true;
      view.rerender();
      expect(screen.getByTestId('room-ready')).toBeInTheDocument();
      net.offline = false;
      view.rerender();
      expect(screen.getByTestId('room-ready')).toBeInTheDocument();
    }
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(first).toHaveBeenCalledTimes(1);
    expect(dist).toHaveBeenCalledTimes(1);
    // The Canvas read, once asked, stays asked through the toggles (its hook re-reads when `enabled` turns true again).
    expect(canvas.asked.slice(canvas.asked.indexOf(true))).not.toContain(false);
  });

  // Review round 14 (Codex, metered rule 4): on a reconnect the access check shows its loader over the screen, which
  // unmounts the step bar. Its reads live in the screen, so they are neither started again nor given a fresh allowance.
  it("the access check's loader on a reconnect does not start the step bar's Learn and Canvas reads again", async () => {
    setRoom({ ...mastermind, canvasTiming: 'at_event' } as TestEvent);
    const view = mountReadyNoWait('mm');
    expect(await screen.findByTestId('room-ready')).toBeInTheDocument();
    await waitFor(() => expect(canvas.asked).toContain(true));
    const mounts = { learn: prep.mounts, canvas: canvas.mounts };
    for (let i = 0; i < 2; i += 1) {
      room.access = { ...room.access, loading: true };
      view.rerender();
      expect(screen.queryByTestId('room-ready')).toBeNull();
      room.access = { ...room.access, loading: false };
      view.rerender();
      expect(await screen.findByTestId('room-ready')).toBeInTheDocument();
    }
    expect({ learn: prep.mounts, canvas: canvas.mounts }).toEqual(mounts);
    expect(screen.getByTestId('room-step-learn')).toBeInTheDocument();
  });

  // Review round 14 (Gemini): Ready shown offline from the cached row; coming back online starts the seat read, which
  // runs behind the question instead of putting the loader back over the slider.
  it('opened offline, then online: the seat read runs behind Ready, which stays, and a seat it finds still forwards', async () => {
    let answer: (v: unknown) => void = () => undefined;
    const read = vi.fn(() => new Promise((r) => { answer = r; }));
    rounds.read = read;
    net.offline = true;
    setRoom(mastermind);
    const view = mountReadyNoWait('mm');
    expect(await screen.findByTestId('room-ready')).toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
    net.offline = false;
    view.rerender();
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('room-ready')).toBeInTheDocument();
    await act(async () => { answer({ rounds: [{ id: 'r1', endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]) }); });
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
  });

  // Review round 14: the step bar's reads wait for the question; someone forwarded before it shows makes none.
  it("a person seated in the running round is forwarded with none of the step bar's reads", async () => {
    rounds.read = () => Promise.resolve({ rounds: [{ id: 'r1', endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]) });
    setRoom({ ...mastermind, canvasTiming: 'at_event' } as TestEvent);
    mountReadyNoWait('mm');
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
    expect(prep.asked.every((ev) => ev === null)).toBe(true);
    expect(canvas.asked).not.toContain(true);
  });

  it('a seat read still out when the browser goes offline and back is not restarted, and its seat still forwards', async () => {
    let answer: (v: unknown) => void = () => undefined;
    const read = vi.fn(() => new Promise((r) => { answer = r; }));
    rounds.read = read;
    setRoom(mastermind);
    const view = mountReadyNoWait('mm');
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    net.offline = true;
    view.rerender();
    net.offline = false;
    view.rerender();
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { answer({ rounds: [{ id: 'r1', endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]) }); });
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
  });

  it('a rounds read that never answers shows Ready after ROUNDS_READ_MS', async () => {
    vi.useFakeTimers();
    rounds.read = () => new Promise(() => {});
    setRoom(mastermind);
    mountReadyNoWait('mm');
    expect(screen.queryByTestId('room-ready')).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(ROUNDS_READ_MS + 10); });
    expect(screen.getByTestId('room-ready')).toBeInTheDocument();
    expect(redirects).toEqual([]);
  });

  // Review round 12 (Codex): a seat found after the budget still forwards; a late "not seated" leaves Ready as it is.
  it.each([[true], [false]])('a rounds read answering after ROUNDS_READ_MS, seated %s', async (seated) => {
    vi.useFakeTimers();
    let answer: (v: unknown) => void = () => undefined;
    rounds.read = () => new Promise((r) => { answer = r; });
    setRoom(mastermind);
    mountReadyNoWait('mm');
    await act(async () => { await vi.advanceTimersByTimeAsync(ROUNDS_READ_MS + 10); });
    expect(screen.getByTestId('room-ready')).toBeInTheDocument();
    await act(async () => {
      answer({ rounds: [{ id: 'r1', endedAt: null }], seatsByRound: new Map([['r1', [{ id: seated ? 'member-a' : 'someone-else' }]]]) });
      await vi.advanceTimersByTimeAsync(10);
    });
    if (seated) expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true });
    else {
      expect(redirects).toEqual([]);
      expect(screen.getByTestId('room-ready')).toBeInTheDocument();
    }
  });

  // Review round 13 (Gemini): a seat found while Continue is saving leaves the save to take them to /meet, once.
  it('a seat found late while Continue is saving: no second redirect, the save takes them in', async () => {
    vi.useFakeTimers();
    let answer: (v: unknown) => void = () => undefined;
    rounds.read = () => new Promise((r) => { answer = r; });
    let land: () => void = () => {};
    vi.mocked(setRoomReadiness).mockReturnValue(stalled((r) => { land = r; }) as never);
    setRoom(mastermind);
    mountReadyNoWait('mm');
    await act(async () => { await vi.advanceTimersByTimeAsync(ROUNDS_READ_MS + 10); });
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await act(async () => {
      answer({ rounds: [{ id: 'r1', endedAt: null }], seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]) });
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(redirects).toEqual([]);
    await act(async () => { land(); await vi.advanceTimersByTimeAsync(10); });
    vi.useRealTimers();
    await expectOnMeet();
    expect(redirects).toEqual([]);
  });

  it('a rounds read failing after ROUNDS_READ_MS leaves Ready as it is', async () => {
    vi.useFakeTimers();
    let fail: (e: unknown) => void = () => undefined;
    rounds.read = () => new Promise((_r, j) => { fail = j; });
    setRoom(mastermind);
    mountReadyNoWait('mm');
    await act(async () => { await vi.advanceTimersByTimeAsync(ROUNDS_READ_MS + 10); });
    await act(async () => { fail(new Error('down')); await vi.advanceTimersByTimeAsync(10); });
    expect(redirects).toEqual([]);
    expect(screen.getByTestId('room-ready')).toBeInTheDocument();
  });
});

describe('storage blocked', () => {
  it('Skip still lands on /meet when localStorage.setItem throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    setRoom(mastermind);
    await mountReady('mm');
    fireEvent.click(screen.getByTestId('room-ready-skip'));
    await expectOnMeet();
  });
});

describe('Ready never stands at a running table', () => {
  it('seated in the running round: /ready redirects to /meet (replace)', async () => {
    rounds.read = () => Promise.resolve({
      rounds: [{ id: 'r1', endedAt: null }],
      seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]),
    });
    setRoom(mastermind);
    mountReadyNoWait('mm');
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
    expect(screen.queryByTestId('room-ready')).toBeNull();
    // Review round 9 (Codex): the readiness marks are not read for someone forwarded.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(vi.mocked(getRoomReadinessDistribution)).not.toHaveBeenCalled();
  });

  it('not seated in the running round: Ready renders', async () => {
    rounds.read = () => Promise.resolve({
      rounds: [{ id: 'r1', endedAt: null }],
      seatsByRound: new Map([['r1', [{ id: 'someone-else' }]]]),
    });
    setRoom(mastermind);
    await mountReady('mm');
    expect(await screen.findByTestId('room-ready')).toBeInTheDocument();
    expect(redirects).toEqual([]);
  });

  it('the rounds read rejects: Ready renders', async () => {
    rounds.read = () => Promise.reject(new Error('down'));
    setRoom(mastermind);
    await mountReady('mm');
    expect(await screen.findByTestId('room-ready')).toBeInTheDocument();
    expect(redirects).toEqual([]);
  });

  // Review round 6 (GLM): R6 gives Clarity Night R8 too, and its host is not exempt.
  it('Clarity Night: seated in the running round, /ready redirects to /meet', async () => {
    rounds.read = () => Promise.resolve({
      rounds: [{ id: 'r1', endedAt: null }],
      seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]),
    });
    setRoom(night);
    mountReadyNoWait('night');
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/night/meet', replace: true }));
    expect(screen.queryByTestId('room-ready')).toBeNull();
  });

  // Review round 6 (Codex), metered-services rule 3: a hidden tab makes no requests.
  it('a hidden tab makes no rounds read until it is shown, then forwards a seated person', async () => {
    let state: DocumentVisibilityState = 'hidden';
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    const read = vi.fn(() => Promise.resolve({
      rounds: [{ id: 'r1', endedAt: null }],
      seatsByRound: new Map([['r1', [{ id: 'member-a' }]]]),
    }));
    rounds.read = read;
    setRoom(mastermind);
    mountReadyNoWait('mm');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(read).not.toHaveBeenCalled();
    expect(redirects).toEqual([]);
    state = 'visible';
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
    expect(read).toHaveBeenCalledTimes(1);
    vis.mockRestore();
  });
});

describe("/ready's step bar", () => {
  it('the mastermind: Ready and "Learn and prepare", no Compare', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    const bar = await screen.findByTestId('room-steps');
    expect(bar).toHaveTextContent('Ready');
    expect(bar).toHaveTextContent('Learn and prepare');
    expect(prep.asked.at(-1)).toMatchObject({ id: mastermind.id });
    // R5 (founder 2026-11-24): the mastermind's last step is "Review" on /ready as on /meet.
    expect(screen.getByTestId('room-step-close')).toHaveTextContent(/^Review$/);
    expect(bar).not.toHaveTextContent('Feedback');
    expect(bar).not.toHaveTextContent('Compare');
    expect(screen.queryByTestId('room-step-compare')).toBeNull();
  });

  // Review round 15 (Gemini): the Canvas read is asked per event and per viewer, as the Learn read is.
  it('another person signed in on the same screen gets their own Canvas read', () => {
    const ev = { ...mastermind, canvasTiming: 'at_event' } as unknown as Parameters<typeof useReadyStepBarReads>[0];
    const { rerender } = renderHook(({ viewer }) => useReadyStepBarReads(ev, viewer, true), { initialProps: { viewer: 'profile-a' } });
    expect(canvas.again).toContain('profile-a');
    expect(canvas.again).not.toContain('profile-b');
    rerender({ viewer: 'profile-b' });
    expect(canvas.again).toContain('profile-b');
  });

  // Review round 6 (Gemini): both branches of ReadyStepBar's withCanvas, and its canvasDone tick.
  it('the mastermind with the Canvas made at the event: Canvas shows, done once shared', async () => {
    canvas.shared = true;
    setRoom({ ...mastermind, canvasTiming: 'at_event' } as TestEvent);
    await mountReady('mm');
    const step = await screen.findByTestId('room-step-canvas');
    expect(step).toHaveAttribute('aria-label', expect.stringMatching(/, done$/));
    expect(canvas.asked).toContain(true);
  });

  it('the mastermind with the Canvas before the event: no Canvas step, and the shared read is not asked', async () => {
    canvas.shared = true;
    setRoom({ ...mastermind, canvasTiming: 'before' } as TestEvent);
    await mountReady('mm');
    await screen.findByTestId('room-steps');
    expect(screen.queryByTestId('room-step-canvas')).toBeNull();
    expect(canvas.asked).not.toContain(true);
  });

  // Review round 12 (Codex): no Canvas read while known offline.
  it('the mastermind with the Canvas made at the event, offline: the shared read is not asked', async () => {
    net.offline = true;
    setRoom({ ...mastermind, canvasTiming: 'at_event' } as TestEvent, { ...selfA });
    mountReadyNoWait('mm');
    await screen.findByTestId('room-steps');
    expect(canvas.asked).not.toContain(true);
  });

  // Review round 7 (Gemini): the Learn tick on /ready's bar follows the learning, and not while it is read or failed.
  it.each([
    [{ loading: false, error: false, learned: true }, true],
    [{ loading: true, error: false, learned: true }, false],
    [{ loading: false, error: true, learned: true }, false],
    [{ loading: false, error: false, learned: false }, false],
  ])('the mastermind\'s Learn step with %o: done %s', async (state, done) => {
    prep.state = state;
    setRoom(mastermind);
    await mountReady('mm');
    const learn = await screen.findByTestId('room-step-learn');
    if (done) expect(learn).toHaveAttribute('aria-label', expect.stringMatching(/, done$/));
    else expect(learn).not.toHaveAttribute('aria-label');
  });

  // Review round 7 (Codex): the bar's Learn entry is the preparation's one tap; the banner is not mounted beside it.
  it('the mastermind mounts no preparation banner; Clarity Night keeps it', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    await screen.findByTestId('room-ready');
    expect(screen.queryByTestId('prep-room-banner')).toBeNull();
    cleanup();
    setRoom(night);
    await mountReady('night');
    expect(await screen.findByTestId('prep-room-banner')).toBeInTheDocument();
  });

  it('a Clarity Night keeps Compare', async () => {
    setRoom(night);
    await mountReady('night');
    const bar = await screen.findByTestId('room-steps');
    expect(bar).toHaveTextContent('Compare');
    expect(bar).not.toHaveTextContent('Learn and prepare');
    // Review round 12 (Gemini): Clarity Night's bar has no Learn entry, so its Learn reads are never asked.
    expect(prep.asked.length).toBeGreaterThan(0);
    expect(prep.asked.every((ev) => ev === null)).toBe(true);
  });
});

describe('the two buttons', () => {
  it('Continue and Skip both render; Skip is blue-bordered, never a second filled primary', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    const cont = await screen.findByTestId('room-ready-continue');
    const skip = screen.getByTestId('room-ready-skip');
    expect(cont).toHaveTextContent('Continue');
    expect(skip).toHaveTextContent('Skip');
    expect(skip.className).toContain('border-blue-600');
    expect(skip.className).toContain('bg-transparent');
    expect(skip.className).not.toContain('bg-primary');
    expect(cont.className).not.toContain('bg-transparent');
  });
});

describe('the mastermind host on a direct /ready URL (R9)', () => {
  it('is redirected to /meet and never sees the question', async () => {
    setRoom(mastermind, { id: 'member-h', profileId: 'host-1', readinessValue: null });
    mountReadyNoWait('mm');
    await waitFor(() => expect(redirects.at(-1)).toMatchObject({ to: '/events/mm/meet', replace: true }));
    expect(screen.queryByTestId('room-ready')).toBeNull();
  });

  it('a Clarity Night host still sees Ready', async () => {
    setRoom(night, { id: 'member-h', profileId: 'host-1', readinessValue: null });
    await mountReady('night');
    expect(redirects).toEqual([]);
  });
});

describe("leaving /ready by the step bar", () => {
  it('Review (the feedback step) opens /meet?view=feedback with the marks, and counts as a skip', async () => {
    setRoom(mastermind);
    mountWithSearch('mm');
    await screen.findByTestId('room-ready');
    fireEvent.click(screen.getByTestId('room-step-close'));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('meet?view=feedback'));
    expect(JSON.parse(screen.getByTestId('page').dataset.state!)).toEqual({ fromReady: true, fromEvent: true });
    expect(readySkipped('profile-a', 'ev-mm')).toBe(true);
  });

  it('Learn and prepare opens /meet?view=learn', async () => {
    setRoom(mastermind);
    mountWithSearch('mm');
    await screen.findByTestId('room-ready');
    fireEvent.click(screen.getByTestId('room-step-learn'));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('meet?view=learn'));
    expect(readySkipped('profile-a', 'ev-mm')).toBe(true);
  });

  it('with a value stored, leaving by Review writes no skip', async () => {
    setRoom(mastermind, { ...selfA, readinessValue: 7 });
    mountWithSearch('mm');
    await screen.findByTestId('room-ready');
    fireEvent.click(screen.getByTestId('room-step-close'));
    await waitFor(() => expect(screen.getByTestId('page')).toHaveTextContent('meet?view=feedback'));
    expect(readySkipped('profile-a', 'ev-mm')).toBe(false);
  });
});

describe('the room gate', () => {
  const destination = () => (redirects.at(-1)?.to as string).split('/').pop();

  it('a skip remembered for this person and event goes to /meet', () => {
    localStorage.setItem('cp:room-ready-skipped:profile-a:ev-mm', '1');
    setRoom(mastermind, { ...selfA });
    mountGate('mm');
    expect(destination()).toBe('meet');
  });

  it("another person's skip on the same device does not apply: /ready", () => {
    localStorage.setItem('cp:room-ready-skipped:profile-a:ev-mm', '1');
    setRoom(mastermind, { ...selfB });
    mountGate('mm');
    expect(destination()).toBe('ready');
  });

  it('the same person, another event: /ready', () => {
    localStorage.setItem('cp:room-ready-skipped:profile-a:ev-night', '1');
    setRoom(mastermind, { ...selfA });
    mountGate('mm');
    expect(destination()).toBe('ready');
  });

  it('the mastermind host with no value goes to /meet', () => {
    setRoom(mastermind, { id: 'member-h', profileId: 'host-1', readinessValue: null });
    mountGate('mm');
    expect(destination()).toBe('meet');
  });

  it('a Clarity Night host with no value still goes to /ready', () => {
    setRoom(night, { id: 'member-h', profileId: 'host-1', readinessValue: null });
    mountGate('night');
    expect(destination()).toBe('ready');
  });

  it('storage blocked on re-entry (getItem throws): the gate still decides, and sends a first visit to /ready (review round 4)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    setRoom(mastermind, { ...selfA });
    mountGate('mm');
    expect(destination()).toBe('ready');
  });

  it('a mastermind non-host on a first visit goes to /ready', () => {
    setRoom(mastermind, { ...selfA });
    mountGate('mm');
    expect(destination()).toBe('ready');
  });

  it('a hike goes to /meet', () => {
    setRoom(hike, { ...selfA });
    mountGate('hike');
    expect(destination()).toBe('meet');
  });
});

describe('RoomSteps done', () => {
  const bar = (done: { ready: boolean }) => render(
    <RoomSteps current="table" viewing="table" onSelect={() => {}} done={done} />,
  );

  it('done.ready false: the Ready button is not announced as done', () => {
    bar({ ready: false });
    expect(screen.getByTestId('room-step-ready').getAttribute('aria-label') ?? '').not.toContain('done');
  });

  it('done.ready true: the Ready button is announced as done', () => {
    bar({ ready: true });
    expect(screen.getByRole('button', { name: /Ready, done/ })).toBeInTheDocument();
  });

  // P1718 (founder 2026-11-24): on a phone the mastermind's labelled bar (five or six steps) drops its ticks; they show
  // from 768px (tablets, laptops). The hike's short bar keeps them at every width.
  const labelled = (hidden: RoomStep[], withCanvas: boolean, learnDone: boolean) => render(
    <RoomSteps current="table" viewing="table" onSelect={() => {}} done={{ ready: true }} hidden={hidden} withCanvas={withCanvas}
      labels={{ principle: 'Principle', close: 'Review' }} learn={{ done: learnDone, label: 'Learn and prepare', active: false, onOpen: () => {} }} />,
  );
  const phoneHidden = (testId: string) => screen.getByTestId(testId).getAttribute('class')?.includes('hidden md:block');

  it('the mastermind bar with Canvas (six steps): every tick is hidden on a phone, drawn from 768px', () => {
    labelled(['compare'], true, true);
    expect(phoneHidden('room-step-ready-check')).toBe(true);
    expect(phoneHidden('room-step-principle-check')).toBe(true);
    expect(phoneHidden('room-step-learn-check')).toBe(true);
  });

  it('the mastermind bar without Canvas (five steps): ticks hidden on a phone too', () => {
    labelled(['compare'], false, false);
    expect(phoneHidden('room-step-ready-check')).toBe(true);
  });

  it('the six-step bar takes the small face below 430px; the five-step mastermind bar does not (review round 4)', () => {
    const { unmount } = labelled(['compare'], true, true);
    expect(screen.getByTestId('room-step-principle-text').getAttribute('class')).toContain('max-[429px]:text-[10px]');
    expect(screen.getByTestId('room-step-learn-text').getAttribute('class')).toContain('max-[429px]:text-[10px]');
    unmount();
    labelled(['compare'], false, true);
    expect(screen.getByTestId('room-step-principle-text').getAttribute('class')).not.toContain('max-[429px]:text-[10px]');
  });

  // Review round 13 (Codex): the mastermind host's bar (no Ready, Canvas before the event: four columns) is still the
  // mastermind's, so with phoneTicks off it drops its ticks on a phone too.
  it("the mastermind host's four-column bar: ticks hidden on a phone when the caller says so", () => {
    render(
      <RoomSteps current="table" viewing="table" onSelect={() => {}} done={{ principle: true }} hidden={['ready', 'compare']} phoneTicks={false}
        labels={{ principle: 'Principle', close: 'Review' }} learn={{ done: true, label: 'Learn and prepare', active: false, onOpen: () => {} }} />,
    );
    expect(phoneHidden('room-step-learn-check')).toBe(true);
    expect(phoneHidden('room-step-principle-check')).toBe(true);
  });

  it("the hike's short bar keeps its ticks at every width", () => {
    labelled(['ready', 'compare', 'table'], false, true);
    expect(phoneHidden('room-step-learn-check')).toBe(false);
    expect(screen.queryByTestId('room-step-ready-check')).toBeNull();
  });
});

describe('recipes', () => {
  it('the mastermind has a Ready step, a hike does not', () => {
    expect(SALES_MASTERMIND_RECIPE.room.readiness).toBe(true);
    expect(SOCIAL_HIKE_RECIPE.room.readiness).toBe(false);
  });
});
