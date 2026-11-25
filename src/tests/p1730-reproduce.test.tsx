// @vitest-environment jsdom
/**
 * P1730: the event room must render after its loader, offline screen or gate screen gives way to the room. Before the fix,
 * useEventRoomCounts sat below those early returns, so the first room render ran one hook more than the render before it and
 * React threw #310 ("Rendered more hooks than during the previous render"), which prod showed as "Something went wrong".
 * Every existing room test mounted with loading already false, which is the one path that never crosses an early return.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';

vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
const auth = vi.hoisted(() => ({ id: 'u1' }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: auth.id, name: 'Ana' }, session: { user: { id: auth.id } } }) }));
const capture = vi.hoisted(() => ({ phase: 'idle', barVisible: false, isCapturingForEvent: () => false, startCapture: async () => ({ started: true }) }));
vi.mock('@/app/contexts/room-capture-context', () => ({ useRoomCapture: () => capture }));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflineStripShown: () => false,
  useOfflinePageReport: () => {},
}));
vi.mock('@/app/components/layout/app-shell/shell-nav', () => ({ useHideTodaysStripForEvent: () => {} }));
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown>, selfLoading: false }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: null, loading: room.selfLoading, refresh: vi.fn().mockResolvedValue(true), runSelfWrite: vi.fn() }),
}));
const roster = vi.hoisted(() => ({ onUpdate: null as null | ((r: unknown[]) => void), onStatus: null as null | ((s: string) => void) }));
vi.mock('@/app/data/event-room-service', () => ({
  setRoomOptIn: vi.fn(), setRoomRating: vi.fn(), resetRoomAnswer: vi.fn(),
  subscribeToRoomRoster: (_id: string, onUpdate: (r: unknown[]) => void, onStatus?: (s: string) => void) => {
    roster.onUpdate = onUpdate;
    roster.onStatus = onStatus ?? null;
    onStatus?.('pending');
    return Object.assign(() => {}, { refresh: () => {} });
  },
}));
const counts = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/app/data/event-room-counts', () => ({ getEventRoomCounts: (...a: unknown[]) => counts.get(...a) }));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/prototypes/events/prep/EventPrepPage', () => ({ PrepFlow: () => null }));
vi.mock('@/app/prototypes/events/prep/PrepPieces', () => ({ JoinOffer: () => null }));
vi.mock('@/app/prototypes/events/rounds/RoundCard', () => ({ RoundCard: () => null }));
vi.mock('@/app/prototypes/events/components/PracticeRooms', () => ({ PracticeRooms: () => null }));
vi.mock('@/app/prototypes/events/close/CloseInRoom', () => ({ CloseInRoom: () => null }));
vi.mock('@/app/prototypes/events/use-feedback-finished', () => ({ useFeedbackFinished: () => undefined }));
vi.mock('@/app/prototypes/events/use-event-community', () => ({ useEventMembership: () => undefined, useEventCommunityName: () => undefined }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({
  usePrepState: () => ({ loading: true, error: false, learned: false, progress: { done: 0 }, minutes: 0, reload: vi.fn() }),
}));
vi.mock('@/app/prototypes/events/components/EventRoomGate', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  EventRoomGateScreen: () => <p>gate</p>,
}));

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';

const hike = { id: 'ev-1', slug: 'walk', title: 'Hike', datetime: '2099-01-01T11:00:00Z', durationMinutes: 240, hostId: 'h', seriesSlug: 'social-hike', statementTag: null };
const night = { ...hike, seriesSlug: null };
const loaded = { slug: 'walk', event: hike, loading: false, granted: true, isLoggedIn: true, offline: false };
const member = (id: string, optedIn: boolean | null) => ({ id, name: `Person ${id}`, slug: id, avatarColor: '#888', optedIn, joinedAt: '2099-01-01T10:00:00Z' });

const tree = () => (
  <ShellTopBarProvider enabled={false}>
    <MemoryRouter initialEntries={['/events/walk/meet']}>
      <Routes><Route path="/events/:slug/meet" element={<EventRoomMeet />} /></Routes>
    </MemoryRouter>
  </ShellTopBarProvider>
);

let consoleError: ReturnType<typeof vi.spyOn>;
const hookOrderErrors = () => consoleError.mock.calls.filter((c: unknown[]) => /Rendered (more|fewer) hooks|#310|#300/.test(String(c[0])));

beforeEach(() => {
  vi.useFakeTimers();
  auth.id = 'u1';
  room.selfLoading = false;
  counts.get.mockReset();
  counts.get.mockResolvedValue({ notHere: 2 });
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  expect(hookOrderErrors()).toEqual([]); // AC: no hook-order error during load, in every case
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const rosterOk = () => act(() => { roster.onStatus?.('ready'); roster.onUpdate?.([member('a', true), member('b', null)]); });

// The screen each early return shows, asserted before the room replaces it, so a test cannot pass by skipping the screen.
const screens = {
  loader: () => expect(screen.queryByTestId('boot-loader') ?? screen.queryByTestId('content-loader')).toBeInTheDocument(),
  offline: () => expect(screen.getByTestId('needs-connection')).toBeInTheDocument(),
  gate: () => expect(screen.getByText('gate')).toBeInTheDocument(),
};

async function openFrom(before: Record<string, unknown>, after: Record<string, unknown>, shows: () => void) {
  room.access = before;
  const { rerender } = render(tree());
  shows();
  expect(screen.queryByTestId('room-roster')).toBeNull();
  room.access = after;
  rerender(tree());
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  rosterOk();
  return rerender;
}

describe('P1730: the room renders after an early-return screen', () => {
  it('loader, then the hike room', async () => {
    await openFrom({ ...loaded, event: null, loading: true }, loaded, screens.loader);
    expect(screen.getByTestId('room-roster-undecided')).toBeInTheDocument();
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
  });

  it('loader, then a non-hike room (the hook runs whatever enabled is)', async () => {
    await openFrom({ ...loaded, event: null, loading: true }, { ...loaded, event: night }, screens.loader);
    expect(screen.getByTestId('room-roster-undecided')).toBeInTheDocument();
    expect(counts.get).not.toHaveBeenCalled();
  });

  it('offline screen, then the room: no count read behind the offline screen, one read when the room returns', async () => {
    await openFrom({ ...loaded, offline: true }, loaded, screens.offline);
    expect(screen.getByTestId('room-roster-undecided')).toBeInTheDocument();
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
    expect(counts.get).toHaveBeenCalledTimes(1);
  });

  it('the room, then offline (event and registration kept): the poll stops until the room is back', async () => {
    const rerender = await openFrom({ ...loaded, event: null, loading: true }, loaded, screens.loader);
    expect(counts.get).toHaveBeenCalledTimes(1);
    room.access = { ...loaded, offline: true };
    rerender(tree());
    screens.offline();
    await act(async () => { await vi.advanceTimersByTimeAsync(95_000); });
    expect(counts.get).toHaveBeenCalledTimes(1);
    room.access = loaded;
    rerender(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(counts.get).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
  });

  it('the host still gets the merged undecided number after the loader', async () => {
    auth.id = 'h';
    // Merged totals that differ from the local roster (1 in, 0 out, 1 undecided), so a heading that fell back to the roster fails.
    counts.get.mockResolvedValue({ notHere: 2, in: 4, out: 3, undecided: 14 });
    await openFrom({ ...loaded, event: null, loading: true }, loaded, screens.loader);
    expect(screen.getByTestId('room-roster-undecided')).toHaveTextContent('Undecided (14)');
    expect(screen.getByTestId('room-roster-in')).toHaveTextContent('Opted in (4)');
    expect(screen.getByTestId('room-roster-out')).toHaveTextContent('Opted out (3)');
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
  });

  it('mid-session: the room, the loader again (access re-read on reconnect), then the room', async () => {
    const rerender = await openFrom({ ...loaded, event: null, loading: true }, loaded, screens.loader);
    room.access = { ...loaded, loading: true };
    rerender(tree());
    screens.loader();
    room.access = loaded;
    rerender(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
    expect(counts.get).toHaveBeenCalledTimes(1); // the loader flash keeps the counts and makes no second read
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(counts.get).toHaveBeenCalledTimes(2); // and the 30 s poll carries on
  });

  it('first arrival: no count read while the seat read (and join) is in flight, one read once the room shows', async () => {
    // The count excludes people with a room row; a read sent before the join counted this person as not here.
    room.selfLoading = true;
    room.access = loaded;
    const { rerender } = render(tree());
    screens.loader();
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(counts.get).not.toHaveBeenCalled();
    room.selfLoading = false;
    rerender(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    rosterOk();
    expect(counts.get).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
  });

  it('moving to another room: no count read for the old event while the new room loads, then the new room is read', async () => {
    const rerender = await openFrom({ ...loaded, event: null, loading: true }, loaded, screens.loader);
    expect(counts.get).toHaveBeenCalledTimes(1);
    // A defensive case: the shipped route remounts the page on a new pathname, so the access hook starts with no event.
    // Under a retained mount (a route marked stable, as /chats is), the access read for the next room would still hold
    // the previous event while it loads.
    room.access = { ...loaded, slug: 'walk-2', loading: true };
    rerender(tree());
    screens.loader();
    await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
    expect(counts.get).toHaveBeenCalledTimes(1);
    // The new room's access read lands.
    room.access = { ...loaded, slug: 'walk-2', event: { ...hike, id: 'ev-2', slug: 'walk-2' } };
    rerender(tree());
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(counts.get.mock.calls.map((c: unknown[]) => c[0])).toEqual(['ev-1', 'ev-2']);
  });

  it('gate screen, then the room once access is granted', async () => {
    await openFrom({ ...loaded, granted: false }, loaded, screens.gate);
    expect(screen.getByTestId('room-roster-undecided')).toBeInTheDocument();
  });
});
