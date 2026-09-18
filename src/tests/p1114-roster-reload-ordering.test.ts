/**
 * 2026-09-18 adversarial review, rounds 2-3: the projected roster reloads on every realtime
 * event. One fetch runs at a time; events during it cause exactly one more fetch, sent after
 * it returned — so the last fetch always starts after the last event. A failed fetch never
 * blanks a roster already shown; before the first success it reports [] (zero-state).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Result = { data: unknown[] | null; error: unknown };
const queue: Array<Promise<Result>> = [];
let fetches = 0;
let realtimeHandler: (() => void) | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => { fetches++; return queue.shift(); } }) }),
    }),
    channel: () => {
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

const dbRow = (id: string) => ({ id, event_id: 'e1', profile_id: null, display_name: id, opted_in: null, comprehension_rating: null, joined_at: '2026-09-18T00:00:00Z', profile: null });
function deferred() {
  let resolve!: (v: Result) => void;
  const promise = new Promise<Result>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { queue.length = 0; fetches = 0; realtimeHandler = null; });

describe('subscribeToRoomRoster', () => {
  it('a failed reload keeps the last good roster (no blank projector)', async () => {
    queue.push(Promise.resolve({ data: [dbRow('ann')], error: null }));
    const seen: string[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)));
    await flush();
    queue.push(Promise.resolve({ data: null, error: { message: 'blip' } }));
    realtimeHandler!();
    await flush();
    expect(seen).toEqual([['ann']]);
    stop();
  });

  it('events during a fetch cause exactly ONE more fetch, sent after it returned, and the roster ends on it', async () => {
    const first = deferred();
    queue.push(first.promise);
    const seen: string[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)));
    await flush();
    expect(fetches).toBe(1);

    realtimeHandler!(); realtimeHandler!(); realtimeHandler!();   // three events mid-fetch
    expect(fetches, 'no overlapping fetch while one is in flight').toBe(1);

    queue.push(Promise.resolve({ data: [dbRow('ann'), dbRow('bo')], error: null }));
    first.resolve({ data: [dbRow('ann')], error: null });          // snapshot from before the events
    await flush(); await flush();
    expect(fetches, 'exactly one follow-up fetch for all three events').toBe(2);
    expect(seen.at(-1)).toEqual(['ann', 'bo']);
    stop();
  });

  it('the FIRST load still reports [] on failure, so the zero-state renders', async () => {
    queue.push(Promise.resolve({ data: null, error: { message: 'down' } }));
    const seen: unknown[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r));
    await flush();
    expect(seen).toEqual([[]]);
    stop();
  });
});
