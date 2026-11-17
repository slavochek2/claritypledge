// @vitest-environment jsdom
/**
 * P1675 section 6, the room: a hike's roster shows the line "and {N} registered, not here yet" only when N is 1 or more (founder
 * wording), the host's Undecided group shows the merged server number, attendees never see it, the count is read every 30 s and the
 * read stops on unmount. Clarity Night's room reads no count and shows no line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShellTopBarProvider } from '@/app/components/layout/app-shell/shell-top-bar';

const auth = vi.hoisted(() => ({ id: 'u1' }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: auth.id, name: 'Ana' }, session: { user: { id: auth.id } } }) }));
const capture = vi.hoisted(() => ({ phase: 'idle', barVisible: false, isCapturingForEvent: () => false, startCapture: async () => ({ started: true }) }));
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

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';

const hike = { id: 'ev-1', slug: 'walk', title: 'Hike', datetime: '2099-01-01T11:00:00Z', durationMinutes: 240, hostId: 'h', seriesSlug: 'social-hike', statementTag: null };
const night = { ...hike, seriesSlug: null };
const member = (id: string, optedIn: boolean | null) => ({ id, name: `Person ${id}`, slug: id, avatarColor: '#888', optedIn, joinedAt: '2099-01-01T10:00:00Z' });

function mount() {
  return render(
    <ShellTopBarProvider enabled={false}>
      <MemoryRouter initialEntries={['/events/walk/meet']}>
        <Routes><Route path="/events/:slug/meet" element={<EventRoomMeet />} /></Routes>
      </MemoryRouter>
    </ShellTopBarProvider>,
  );
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const rosterOk = (rows: unknown[]) => act(() => { roster.onStatus?.('ready'); roster.onUpdate?.(rows); });

beforeEach(() => {
  vi.useFakeTimers();
  auth.id = 'u1';
  counts.get.mockReset();
  room.access = { slug: 'walk', event: hike, loading: false, granted: true, isLoggedIn: true, offline: false };
});
afterEach(() => { vi.useRealTimers(); });

describe('attendee', () => {
  it('sees the exact line when 1 or more are registered and not here, and never the merged count', async () => {
    counts.get.mockResolvedValue({ notHere: 4 });
    mount();
    await flush();
    await rosterOk([member('a', true), member('b', null)]);
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent(/^and 4 registered, not here yet$/);
    expect(screen.getByTestId('room-roster-undecided')).toHaveTextContent('Undecided (1)');
  });

  it('shows no line when nobody is missing, and none before the first read', async () => {
    counts.get.mockResolvedValue({ notHere: 0 });
    mount();
    await rosterOk([member('a', true)]);
    expect(screen.queryByTestId('room-not-here-line')).toBeNull();
    await flush();
    expect(screen.queryByTestId('room-not-here-line')).toBeNull();
  });

  it('a failed read shows nothing and does not throw', async () => {
    counts.get.mockResolvedValue(null);
    mount();
    await flush();
    await rosterOk([member('a', true)]);
    expect(screen.queryByTestId('room-not-here-line')).toBeNull();
  });
});

describe('host', () => {
  it('sees the merged undecided number in the Undecided title, plus the same line', async () => {
    auth.id = 'h';
    counts.get.mockResolvedValue({ notHere: 2, in: 1, out: 0, undecided: 14 });
    mount();
    await flush();
    await rosterOk([member('a', true), member('b', null)]);
    expect(screen.getByTestId('room-roster-undecided')).toHaveTextContent('Undecided (14)');
    expect(screen.getByTestId('room-not-here-line')).toHaveTextContent('and 2 registered, not here yet');
  });

  it('an attendee given a host-shaped payload still never shows a merged number', async () => {
    counts.get.mockResolvedValue({ notHere: 2, undecided: 14 });
    mount();
    await flush();
    await rosterOk([member('a', true), member('b', null)]);
    expect(screen.getByTestId('room-roster-undecided')).toHaveTextContent('Undecided (1)');
    expect(document.body.textContent).not.toContain('(14)');
  });
});

describe('cadence and scope', () => {
  it('reads on open and every 30 s, and stops when the room unmounts', async () => {
    counts.get.mockResolvedValue({ notHere: 1 });
    const { unmount } = mount();
    await flush();
    expect(counts.get).toHaveBeenCalledTimes(1);
    expect(counts.get).toHaveBeenCalledWith('ev-1');
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(counts.get).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(counts.get).toHaveBeenCalledTimes(2);
  });

  it('Clarity Night\'s room reads no count and shows no line (limited to hikes)', async () => {
    room.access = { ...(room.access as object), event: night };
    counts.get.mockResolvedValue({ notHere: 5 });
    mount();
    await flush();
    await rosterOk([member('a', null)]);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(counts.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId('room-not-here-line')).toBeNull();
  });
});
