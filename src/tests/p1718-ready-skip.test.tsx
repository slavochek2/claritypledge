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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));

const room = vi.hoisted(() => ({
  access: {} as Record<string, unknown>,
  self: null as Record<string, unknown> | null,
  refresh: (() => Promise.resolve()) as () => Promise<void>,
  prepGate: false as boolean | null,
  arrivalGate: false as boolean | null,
  capturing: false,
}));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: room.self, loading: false, refresh: room.refresh }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn().mockResolvedValue([]),
  setRoomReadiness: vi.fn(),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({
  PrepRoomBanner: () => null,
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
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: false, error: false, learned: false }),
}));
vi.mock('@/app/prototypes/events/rounds/canvas-setup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/canvas-setup')>()),
  useMyCanvasShared: () => [false, vi.fn()],
}));

const rounds = vi.hoisted(() => ({
  read: (() => Promise.resolve({ rounds: [], seatsByRound: new Map() })) as () => Promise<unknown>,
}));
vi.mock('@/app/data/event-rounds-service', () => ({
  getEventRoundsState: () => rounds.read(),
  currentRound: (state: { rounds: { endedAt?: string | null }[] }) => {
    const last = state.rounds[state.rounds.length - 1];
    return last && !last.endedAt ? last : null;
  },
}));

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
import { ROUNDS_READ_MS } from '@/app/prototypes/events/components/use-seated-at-running-round';
import { EventRoomGate } from '@/app/prototypes/events/components/EventRoomGate';
import { readySkipped, rememberReadySkipped } from '@/app/prototypes/events/components/ready-skip-memory';
import { RoomSteps, type RoomStep } from '@/app/prototypes/events/rounds/RoomSteps';
import { SALES_MASTERMIND_RECIPE, SOCIAL_HIKE_RECIPE } from '@/app/prototypes/events/series-recipes';
import { setRoomReadiness } from '@/app/data/event-room-service';

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
  render(
    <MemoryRouter initialEntries={[{ pathname: `/events/${slug}/ready`, state: { fromEvent: true } }]}>
      <Routes>
        <Route path="/events/:slug/ready" element={<EventRoomReady />} />
        <Route path="/events/:slug/meet" element={<Page name="meet" />} />
      </Routes>
    </MemoryRouter>,
  );
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
  localStorage.clear();
  vi.mocked(setRoomReadiness).mockReset();
  room.refresh = () => Promise.resolve();
  room.prepGate = false;
  room.arrivalGate = false;
  room.capturing = false;
  rounds.read = () => Promise.resolve({ rounds: [], seatsByRound: new Map() });
  setRoom(night);
});
afterEach(() => vi.restoreAllMocks());

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
    vi.mocked(setRoomReadiness).mockReturnValue(new Promise(() => {}) as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    const cont = screen.getByTestId('room-ready-continue');
    fireEvent.click(cont);
    fireEvent.click(cont);
    expect(setRoomReadiness).toHaveBeenCalledTimes(1);
  });

  it('Skip during a pending save does nothing more: one save, no skip remembered', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(new Promise(() => {}) as never);
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
    vi.mocked(setRoomReadiness).mockReturnValue(new Promise(() => {}) as never);
    setRoom(mastermind);
    await mountReady('mm');
    moveSlider();
    fireEvent.click(screen.getByTestId('room-ready-continue'));
    await waitFor(() => expect(screen.getByTestId('room-ready-continue')).toBeDisabled());
    expect(screen.getByTestId('room-ready-continue')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('room-ready-skip')).toBeDisabled();
  });

  it('a step-bar tap during a pending save does nothing: no skip over the answer, no navigation (review round 2)', async () => {
    vi.mocked(setRoomReadiness).mockReturnValue(new Promise(() => {}) as never);
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
    vi.mocked(setRoomReadiness).mockReturnValue(new Promise(() => {}) as never);
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
});

describe("/ready's step bar", () => {
  it('the mastermind: Ready and "Learn and prepare", no Compare', async () => {
    setRoom(mastermind);
    await mountReady('mm');
    const bar = await screen.findByTestId('room-steps');
    expect(bar).toHaveTextContent('Ready');
    expect(bar).toHaveTextContent('Learn and prepare');
    // R5 (founder 2026-11-24): the mastermind's last step is "Review" on /ready as on /meet.
    expect(screen.getByTestId('room-step-close')).toHaveTextContent(/^Review$/);
    expect(bar).not.toHaveTextContent('Feedback');
    expect(bar).not.toHaveTextContent('Compare');
    expect(screen.queryByTestId('room-step-compare')).toBeNull();
  });

  it('a Clarity Night keeps Compare', async () => {
    setRoom(night);
    await mountReady('night');
    const bar = await screen.findByTestId('room-steps');
    expect(bar).toHaveTextContent('Compare');
    expect(bar).not.toHaveTextContent('Learn and prepare');
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
