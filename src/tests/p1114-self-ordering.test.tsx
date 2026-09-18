/**
 * 2026-09-18 adversarial review (Codex, three rounds): the room's `self` is fed by reads
 * (every roster event refreshes it) and by the person's own writes, which resolve out of
 * order — and request order does not tell which response holds the newer DATABASE state.
 * These pin the rules in useEventRoomSelf:
 *   1. a write's row beats every read sent while it was in flight;
 *   2. every write is followed by a fresh read sent after it resolved;
 *   3. among reads, only one sent after the last applied may apply; a failed read applies
 *      nothing and reports false;
 *   4. rows from another event never apply.
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

const E1 = { id: 'e1' } as unknown as EventWithHost;
const E2 = { id: 'e2' } as unknown as EventWithHost;
const row = (optedIn: boolean | null, rating: number | null = null, eventId = 'e1') =>
  ({ id: `m-${eventId}`, eventId, optedIn, comprehensionRating: rating } as unknown as EventRoomSelf);

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

async function mounted() {
  getMyRoomStatus.mockResolvedValueOnce(row(null));
  const hook = renderHook(({ ev }) => useEventRoomSelf(ev, true), { initialProps: { ev: E1 } });
  await waitFor(() => expect(hook.result.current.self?.optedIn).toBeNull());
  return hook;
}

beforeEach(() => { getMyRoomStatus.mockReset(); joinEventRoom.mockReset(); });

describe('useEventRoomSelf ordering', () => {
  it('a read sent BEFORE a write, landing AFTER it, cannot put the pre-write row back', async () => {
    const { result } = await mounted();
    const staleRead = deferred<EventRoomSelf>();
    getMyRoomStatus.mockReturnValueOnce(staleRead.promise);   // the read, sent first
    getMyRoomStatus.mockResolvedValueOnce(row(true, 7));      // the post-write re-read

    let refreshP!: Promise<boolean>;
    act(() => { refreshP = result.current.refresh(); });
    await act(async () => { await result.current.runSelfWrite(async () => row(true, 7)); });
    expect(result.current.self?.comprehensionRating).toBe(7);

    await act(async () => { staleRead.resolve(row(true, null)); await refreshP; });
    expect(result.current.self?.comprehensionRating, 'the rating card must not come back').toBe(7);
  });

  it('a read sent WHILE the write was in flight (pre-commit snapshot), landing after it, is fenced off', async () => {
    const { result } = await mounted();
    const write = deferred<EventRoomSelf>();
    const midRead = deferred<EventRoomSelf>();

    let writeP!: Promise<void>;
    act(() => { writeP = result.current.runSelfWrite(() => write.promise); });
    getMyRoomStatus.mockReturnValueOnce(midRead.promise);         // another attendee's event -> read
    let readP!: Promise<boolean>;
    act(() => { readP = result.current.refresh(); });
    getMyRoomStatus.mockResolvedValueOnce(row(true));              // the post-write re-read
    await act(async () => { write.resolve(row(true)); await writeP; });
    await act(async () => { midRead.resolve(row(null)); await readP; }); // snapshotted before commit
    expect(result.current.self?.optedIn, 'must not regress to the choosing step').toBe(true);
  });

  it('a delayed write response is corrected by the fresh read that follows every write', async () => {
    const { result } = await mounted();
    const slowWrite = deferred<EventRoomSelf>();
    let writeP!: Promise<void>;
    act(() => { writeP = result.current.runSelfWrite(() => slowWrite.promise); }); // A: Opt in
    getMyRoomStatus.mockResolvedValue(row(false));                                   // DB now: Opt out (device B)
    await act(async () => { slowWrite.resolve(row(true)); await writeP; });
    await waitFor(() => expect(result.current.self?.optedIn, 'the post-write re-read shows the newer state').toBe(false));
  });

  it('a FAILED read reports false, applies nothing, and does not cancel a good read in flight', async () => {
    const { result } = await mounted();
    const goodRead = deferred<EventRoomSelf>();
    getMyRoomStatus.mockReturnValueOnce(goodRead.promise);
    getMyRoomStatus.mockResolvedValueOnce(null);
    joinEventRoom.mockRejectedValueOnce(new Error('down'));

    let p1!: Promise<boolean>;
    act(() => { p1 = result.current.refresh(); });
    let ok = true;
    await act(async () => { ok = await result.current.refresh(); });
    expect(ok, 'refresh must report the failure').toBe(false);
    expect(result.current.self?.optedIn).toBeNull();
    await act(async () => { goodRead.resolve(row(true, 5)); await p1; });
    expect(result.current.self?.comprehensionRating).toBe(5);
  });

  it('after an event switch, a late row from the old event never applies', async () => {
    const hook = await mounted();
    const oldRead = deferred<EventRoomSelf>();
    getMyRoomStatus.mockReturnValueOnce(oldRead.promise);
    let p!: Promise<boolean>;
    act(() => { p = hook.result.current.refresh(); });            // e1 read in flight

    getMyRoomStatus.mockResolvedValueOnce(null);                   // e2 load fails
    joinEventRoom.mockRejectedValueOnce(new Error('down'));
    hook.rerender({ ev: E2 });
    await waitFor(() => expect(hook.result.current.loading).toBe(false));

    await act(async () => { oldRead.resolve(row(true, 3, 'e1')); await p; });
    expect(hook.result.current.self, 'e1\'s row must not show in e2').toBeNull();
  });

  it('a write that fails rejects and changes nothing', async () => {
    const { result } = await mounted();
    await act(async () => {
      await expect(result.current.runSelfWrite(async () => { throw new Error('refused'); })).rejects.toThrow('refused');
    });
    expect(result.current.self?.optedIn).toBeNull();
  });
});
