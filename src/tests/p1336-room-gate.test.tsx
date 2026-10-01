/**
 * P1336 × P1369 (review 2026-10-01): the room's preparation gate under main's offline access.
 * EventRoomAccess grants the room from the SESSION while the profile (`user`) can still be null
 * (offline, or the profile read losing the race). The gate must use the session's id, step aside
 * offline, and never hold the page blank when the preparation read hangs.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { EventWithHost } from '@/app/types';

const auth = vi.hoisted(() => ({ value: { user: null as null | { id: string }, session: { user: { id: 'viewer-1' } } as null | { user: { id: string } } } }));
const conn = vi.hoisted(() => ({ value: { offline: false, reconnectTick: 0 } }));
const prep = vi.hoisted(() => ({ value: { loading: false, error: false, progress: { done: 1, total: 6, complete: false }, prep: null } }));

vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/app/contexts/offline-status-context', () => ({ useConnectivity: () => conn.value }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({ usePrepState: () => prep.value }));

import { useRoomPrepGate } from '@/app/prototypes/events/prep/PrepRoom';

const event = { id: 'ev-1', slug: 'cn', hostId: 'host-1', preparationEnabled: true } as unknown as EventWithHost;

beforeEach(() => {
  auth.value = { user: null, session: { user: { id: 'viewer-1' } } };
  conn.value = { offline: false, reconnectTick: 0 };
  prep.value = { loading: false, error: false, progress: { done: 1, total: 6, complete: false }, prep: null };
  sessionStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe('useRoomPrepGate', () => {
  it('profile not loaded, session present: uses the session id, no crash (gate shows for an unprepared registrant)', () => {
    const { result } = renderHook(() => useRoomPrepGate(event, true));
    expect(result.current.gate).toBe(true);
  });

  it('offline: steps aside (the room shows its cached state, never a gate it cannot load)', () => {
    conn.value = { offline: true, reconnectTick: 0 };
    const { result } = renderHook(() => useRoomPrepGate(event, true));
    expect(result.current.gate).toBe(false);
  });

  it('no session id at all: steps aside', () => {
    auth.value = { user: null, session: null };
    const { result } = renderHook(() => useRoomPrepGate(event, true));
    expect(result.current.gate).toBe(false);
  });

  it('a preparation read that hangs: unknown at first, steps aside after 5s', () => {
    vi.useFakeTimers();
    prep.value = { ...prep.value, loading: true };
    const { result } = renderHook(() => useRoomPrepGate(event, true));
    expect(result.current.gate).toBeNull();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.gate).toBe(false);
  });

  it('the host (by session id) is never gated', () => {
    auth.value = { user: null, session: { user: { id: 'host-1' } } };
    const { result } = renderHook(() => useRoomPrepGate(event, true));
    expect(result.current.gate).toBe(false);
  });
});
