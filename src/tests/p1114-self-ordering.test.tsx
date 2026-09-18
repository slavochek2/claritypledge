/**
 * 2026-09-18 adversarial review (Codex, two rounds): the room's `self` is fed by reads
 * (every roster event refreshes it) and by the person's own writes, which resolve out of
 * order. These pin the ordering rule in useEventRoomSelf: a response is applied only if its
 * ticket — taken when the read or write STARTED — is newer than the last one applied.
 * Promises are resolved by hand, so each interleaving is exact, not timing-dependent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { EventRoomSelf, EventWithHost } from '@/app/types';

const getMyRoomStatus = vi.fn();
const joinEventRoom = vi.fn();
vi.mock('@/app/data/event-room-service', () => ({
  getMyRoomStatus: (...a: unknown[]) => getMyRoomStatus(...a),
  joinEventRoom: (...a: unknown[]) => joinEventRoom(...a),
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: {} }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { name: 'T' } }) }));

import { useEventRoomSelf } from '@/app/prototypes/events/components/EventRoomAccess';

const EVENT = { id: 'e1' } as unknown as EventWithHost;
const row = (optedIn: boolean | null, rating: number | null = null) =>
  ({ id: 'm1', eventId: 'e1', optedIn, comprehensionRating: rating } as unknown as EventRoomSelf);

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function mounted() {
  getMyRoomStatus.mockResolvedValueOnce(row(null));
  const hook = renderHook(() => useEventRoomSelf(EVENT, true));
  await waitFor(() => expect(hook.result.current.self?.optedIn).toBeNull());
  return hook;
}

beforeEach(() => { getMyRoomStatus.mockReset(); joinEventRoom.mockReset(); });

describe('useEventRoomSelf ordering', () => {
  it('a read issued BEFORE a write, landing AFTER it, cannot put the pre-write row back', async () => {
    const { result } = await mounted();
    const staleRead = deferred<EventRoomSelf>();
    getMyRoomStatus.mockReturnValueOnce(staleRead.promise);

    let refreshP!: Promise<void>;
    act(() => { refreshP = result.current.refresh(); });            // read issued first
    await act(async () => { await result.current.runSelfWrite(async () => row(true, 7)); });
    expect(result.current.self?.comprehensionRating).toBe(7);

    await act(async () => { staleRead.resolve(row(true, null)); await refreshP; });
    expect(result.current.self?.comprehensionRating, 'the rating card must not come back').toBe(7);
  });

  it('a write whose response is delayed cannot overwrite a newer state a later read already showed', async () => {
    const { result } = await mounted();
    const slowWrite = deferred<EventRoomSelf>();

    let writeP!: Promise<void>;
    act(() => { writeP = result.current.runSelfWrite(() => slowWrite.promise); }); // A: Opt in, response slow
    getMyRoomStatus.mockResolvedValueOnce(row(false));                            // B changed it to Opt out
    await act(async () => { await result.current.refresh(); });                   // realtime read, issued later
    expect(result.current.self?.optedIn).toBe(false);

    await act(async () => { slowWrite.resolve(row(true)); await writeP; });        // A's old response arrives
    expect(result.current.self?.optedIn, 'the late response must lose to the later read').toBe(false);
  });

  it('a FAILED read applies nothing and does not cancel a good read still in flight', async () => {
    const { result } = await mounted();
    const goodRead = deferred<EventRoomSelf>();
    getMyRoomStatus.mockReturnValueOnce(goodRead.promise);   // read 1: good, slow
    getMyRoomStatus.mockResolvedValueOnce(null);             // read 2: failed (null)...
    joinEventRoom.mockRejectedValueOnce(new Error('down'));  // ...and the join fallback fails

    let p1!: Promise<void>;
    act(() => { p1 = result.current.refresh(); });
    await act(async () => { await result.current.refresh(); });
    await act(async () => { goodRead.resolve(row(true, 5)); await p1; });
    expect(result.current.self?.comprehensionRating).toBe(5);
  });

  it('a write that fails rejects and changes nothing', async () => {
    const { result } = await mounted();
    await act(async () => {
      await expect(result.current.runSelfWrite(async () => { throw new Error('refused'); })).rejects.toThrow('refused');
    });
    expect(result.current.self?.optedIn).toBeNull();
  });
});
