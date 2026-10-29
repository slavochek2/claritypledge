// @vitest-environment jsdom
/**
 * P1562 round 6 (R3, metered-services rule 3): the room roster subscription makes no read in a hidden tab — not the
 * first read, not the 30s poll, not a realtime-triggered reload. Becoming visible sends exactly one read when the
 * roster went stale (or was never read). The realtime channel itself stays subscribed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let fetches = 0;
let answer: { data: unknown[] | null; error: unknown } = { data: [], error: null };
/** Queued answers for the next fetches, in order (each a promise the test can hold); then `answer`. */
const queue: Array<Promise<unknown>> = [];
let realtimeHandler: (() => void) | null = null;
let channelsOpened = 0;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => { fetches++; return queue.shift() ?? Promise.resolve(answer); } }) }),
    }),
    channel: () => {
      channelsOpened++;
      const ch = {
        on: (_e: string, _f: unknown, cb: () => void) => { realtimeHandler = cb; return ch; },
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: vi.fn(),
  },
}));

import { subscribeToRoomRoster } from '@/app/data/event-room-service';

/** event-room-service's reconciliation poll (not exported). */
const RECONCILE_POLL_MS = 30_000;

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const show = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };

beforeEach(() => {
  fetches = 0;
  channelsOpened = 0;
  realtimeHandler = null;
  answer = { data: [], error: null };
  queue.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('the roster subscription in a hidden tab', () => {
  it('hidden for 60s (polls and realtime events included): 0 reads; shown: exactly 1 read', async () => {
    setVisibility('hidden');
    const stop = subscribeToRoomRoster('e1', () => {});
    expect(channelsOpened).toBe(1); // the socket stays
    realtimeHandler!();
    await vi.advanceTimersByTimeAsync(60_000);
    realtimeHandler!();
    expect(fetches).toBe(0);
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    stop();
  });

  it('visible from the start: one first read, then one per poll tick as before', async () => {
    const stop = subscribeToRoomRoster('e1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    await vi.advanceTimersByTimeAsync(RECONCILE_POLL_MS);
    expect(fetches).toBe(2);
    stop();
  });

  it('hidden after a good read: nothing while hidden, one read on return; nothing on return if nothing went stale', async () => {
    const stop = subscribeToRoomRoster('e1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    show(); // back before any poll or event: nothing is stale
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(RECONCILE_POLL_MS * 2);
    expect(fetches).toBe(1);
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2);
    stop();
  });

  it("the first read (sent on becoming visible) fails → `failed` is reported then, not while hidden", async () => {
    answer = { data: null, error: { message: 'x' } };
    setVisibility('hidden');
    const onUpdate = vi.fn();
    const onStatus = vi.fn();
    const stop = subscribeToRoomRoster('e1', onUpdate, onStatus);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onStatus.mock.calls).toEqual([['pending']]);
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus.mock.calls).toEqual([['pending'], ['failed']]);
    expect(onUpdate).toHaveBeenCalledWith([]); // P1586: the [] before the first success, with `failed` beside it
    stop();
  });

  it('after stop, becoming visible sends nothing', async () => {
    setVisibility('hidden');
    const stop = subscribeToRoomRoster('e1', () => {});
    stop();
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(0);
  });
});

const row = (id: string) => ({ id, event_id: 'e1', profile_id: null, display_name: id, opted_in: null, comprehension_rating: null, joined_at: '2026-10-27T00:00:00Z', profile: null });
function held<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('round 7 (H1): the reload loop re-checks the tab before every fetch', () => {
  it("Codex's sequence: a visible read out, a realtime event queues another, the tab hides → no hidden request; shown → 1 more", async () => {
    const first = held<unknown>();
    queue.push(first.promise);
    const stop = subscribeToRoomRoster('e1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    realtimeHandler!(); // queued while the read is out
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    first.resolve({ data: [row('ann')], error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1); // the queued read did not go out hidden
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2);
    stop();
  });
});

describe('round 7 (H2): a thrown roster read is a failed read, never a rejection', () => {
  it('a rejecting query is reported as a failed first read, and the next poll still reads', async () => {
    const thrown = held<unknown>();
    queue.push(thrown.promise);
    const onStatus = vi.fn();
    const onUpdate = vi.fn();
    const stop = subscribeToRoomRoster('e1', onUpdate, onStatus);
    thrown.reject(new TypeError('fetch failed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).toHaveBeenLastCalledWith('failed');
    answer = { data: [row('ann')], error: null };
    await vi.advanceTimersByTimeAsync(RECONCILE_POLL_MS);
    expect(fetches).toBe(2);
    expect(onStatus).toHaveBeenLastCalledWith('ready'); // the loop was not left stuck in flight
    expect(onUpdate).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'ann' })]);
    stop();
  });
});

describe('round 7 (H3): refresh() reads through the same loop', () => {
  it('refresh while an older read is out: the refresh runs after it, so its answer (with the viewer) is the last applied', async () => {
    const older = held<unknown>();
    queue.push(older.promise);
    const seen: string[][] = [];
    const sub = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)));
    await vi.advanceTimersByTimeAsync(0);
    sub.refresh(); // the viewer's join landed while the older read is still out
    answer = { data: [row('ben'), row('me')], error: null };
    older.resolve({ data: [row('ben')], error: null }); // the pre-join snapshot answers late
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2);
    expect(seen).toEqual([['ben'], ['ben', 'me']]); // the older answer could not erase the viewer
    sub();
  });

  it('refresh in a hidden tab sends nothing until the tab is shown, then exactly one read', async () => {
    const sub = subscribeToRoomRoster('e1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    setVisibility('hidden');
    sub.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2);
    sub();
  });
});

describe('EventHostPage: the 2-argument call', () => {
  it('a failed first read (sent on becoming visible) still reports [] when no onStatus is given', async () => {
    answer = { data: null, error: { message: 'x' } };
    setVisibility('hidden');
    const onUpdate = vi.fn();
    const stop = subscribeToRoomRoster('e1', onUpdate);
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).not.toHaveBeenCalled();
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenCalledWith([]);
    stop();
  });
});

describe('round 8', () => {
  it('F2: after stop(), refresh(), a realtime callback and becoming visible start no read', async () => {
    setVisibility('hidden');
    const sub = subscribeToRoomRoster('e1', () => {});
    realtimeHandler!(); // stale while hidden
    sub();
    sub.refresh();
    realtimeHandler!();
    show();
    await vi.advanceTimersByTimeAsync(RECONCILE_POLL_MS);
    expect(fetches).toBe(0);
  });

  it('F2: a refresh after stop while visible sends nothing', async () => {
    const sub = subscribeToRoomRoster('e1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    sub();
    sub.refresh();
    realtimeHandler!();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
  });

  it('F3: hide / show / hide around an in-flight read — no hidden fetch and no lost read', async () => {
    const first = held<unknown>();
    queue.push(first.promise);
    const stop = subscribeToRoomRoster('e1', () => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    setVisibility('hidden');
    realtimeHandler!(); // queued (dirty) behind the read in flight
    show(); // shown while the read is still out
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    first.resolve({ data: [row('ann')], error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1); // the queued read never went out hidden
    show();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2); // and was not lost
    stop();
  });

  it('F3: a show while a read is out after a stale-while-hidden mark still sends the stale read once that read answers', async () => {
    setVisibility('hidden');
    const stop = subscribeToRoomRoster('e1', () => {});
    realtimeHandler!(); // never read, stale
    const first = held<unknown>();
    queue.push(first.promise);
    show(); // fetch 1 starts (clears stale)
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(1);
    setVisibility('hidden');
    realtimeHandler!(); // dirty behind the read
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    first.resolve({ data: [row('ann')], error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetches).toBe(2);
    stop();
  });
});

