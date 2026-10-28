// @vitest-environment jsdom
/**
 * P1586 §4: the room roster card tells "not loaded yet" (skeleton rows) from "first read failed"
 * (a quiet readable line) and from the loaded roster. P1114 invariant: never an error state,
 * never an empty wall, so every state here renders something readable or a skeleton.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { InShellContentContext } from '@/components/ui/loader-context';
import type { EventRoomMember } from '@/app/types';

vi.mock('@/auth', () => ({ useAuth: () => ({ user: null, session: null, isLoading: false, sessionChecked: true }) }));
vi.mock('@/hooks/use-nav-auth-state', () => ({ useNavAuthState: () => ({ showUserMenu: false }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn(), identify: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const room = vi.hoisted(() => ({
  onUpdate: null as null | ((r: unknown[]) => void),
  onStatus: null as null | ((s: 'pending' | 'ready' | 'failed') => void),
}));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => ({
    slug: 'night-2', event: { id: 'ev-1', slug: 'night-2' }, loading: false, granted: true, isLoggedIn: true, offline: false,
  }),
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn().mockResolvedValue(true), runSelfWrite: vi.fn() }),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({
  useRoomPrepGate: () => ({ gate: false }),
  PrepRoomGate: () => null,
  PrepRoomBanner: () => null,
}));
vi.mock('@/app/prototypes/events/arrival/ArrivalGate', () => ({
  useArrivalGate: () => ({ gate: false, answered: () => {} }),
  ArrivalQuestion: () => null,
}));
vi.mock('@/app/contexts/room-capture-context', () => ({
  useRoomCapture: () => ({ isCapturingForEvent: () => false, barVisible: false }),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useOfflineStripShown: () => false,
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflinePageReport: () => {},
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn(() => new Promise(() => {})),
  setRoomReadiness: vi.fn(),
  setRoomOptIn: vi.fn(),
  setRoomRating: vi.fn(),
  resetRoomAnswer: vi.fn(),
  subscribeToRoomRoster: vi.fn((_id: string, onUpdate: (r: unknown[]) => void, onStatus?: (s: 'pending' | 'ready' | 'failed') => void) => {
    room.onUpdate = onUpdate;
    room.onStatus = onStatus ?? null;
    onStatus?.('pending');
    return () => {};
  }),
}));
vi.mock('@/app/prototypes/events/rounds/RoomSteps', () => ({ RoomSteps: () => null }));

import { EventRoomMeet } from '@/app/prototypes/events/components/EventRoomMeet';

const member = (id: string, optedIn: boolean | null): EventRoomMember => ({
  id, eventId: 'ev-1', profileId: null, displayName: id, optedIn, comprehensionRating: null, joinedAt: '2026-09-18T00:00:00Z',
  avatarColor: null, avatarUrl: null, hasPledged: false, earsCount: 0, slug: null,
} as unknown as EventRoomMember);

function mount() {
  return render(
    <InShellContentContext.Provider value={true}>
      <MemoryRouter initialEntries={['/events/night-2/meet']}>
        <Routes><Route path="/events/:slug/meet" element={<EventRoomMeet />} /></Routes>
      </MemoryRouter>
    </InShellContentContext.Provider>,
  );
}

beforeEach(() => { room.onUpdate = null; room.onStatus = null; });

describe('P1586 §4 — room roster states', () => {
  it('pending: skeleton rows inside the roster card, no "Loading" text', () => {
    mount();
    const card = screen.getByTestId('room-roster');
    const skeleton = screen.getByTestId('room-roster-skeleton');
    expect(card.contains(skeleton)).toBe(true);
    expect(skeleton.children.length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/loading who is here/i)).toBeNull();
  });

  it('first read failed: a quiet readable line, no skeleton, no alarm', () => {
    mount();
    act(() => { room.onUpdate!([]); room.onStatus!('failed'); });
    expect(screen.queryByTestId('room-roster-skeleton')).toBeNull();
    const line = screen.getByTestId('room-roster-unavailable');
    expect(line.textContent?.trim().length).toBeGreaterThan(0);
    expect(line.getAttribute('role')).toBeNull();
    expect(screen.queryByText(/loading who is here/i)).toBeNull();
  });

  it('ready with rows: the groups, no skeleton, no placeholder line', () => {
    mount();
    act(() => { room.onStatus!('ready'); room.onUpdate!([member('ann', true), member('bo', false)]); });
    expect(screen.queryByTestId('room-roster-skeleton')).toBeNull();
    expect(screen.queryByTestId('room-roster-unavailable')).toBeNull();
    expect(screen.getByTestId('room-roster-in')).toBeTruthy();
    expect(screen.getByTestId('room-roster-out')).toBeTruthy();
  });

  it('ready but empty: still a readable line, never an empty wall', () => {
    mount();
    act(() => { room.onStatus!('ready'); room.onUpdate!([]); });
    expect(screen.queryByTestId('room-roster-skeleton')).toBeNull();
    expect(screen.getByTestId('room-roster-empty').textContent?.trim().length).toBeGreaterThan(0);
  });

  it('a later failure after rows were shown keeps the rows', () => {
    mount();
    act(() => { room.onStatus!('ready'); room.onUpdate!([member('ann', true)]); });
    // the service emits nothing on a later failure; the rows must still be on screen
    expect(screen.getByTestId('room-roster-in')).toBeTruthy();
  });
});
