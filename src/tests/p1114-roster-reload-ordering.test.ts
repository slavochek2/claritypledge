/**
 * 2026-09-18 adversarial review, round 2: the projected roster reloads on every realtime
 * event. A reload that FAILS must not paint an empty roster over a good one, and an older
 * response must not land over a newer one. The first load keeps the `[]` contract so the
 * page's whole-roster zero-state still renders.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Result = { data: unknown[] | null; error: unknown };
const queue: Array<Promise<Result>> = [];
let realtimeHandler: (() => void) | null = null;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => queue.shift() }) }),
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

beforeEach(() => { queue.length = 0; realtimeHandler = null; vi.useRealTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('subscribeToRoomRoster ordering', () => {
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

  it('an older response landing after a newer one is dropped', async () => {
    queue.push(Promise.resolve({ data: [], error: null }));
    const seen: string[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)));
    await flush();
    const slow = deferred();
    queue.push(slow.promise);
    realtimeHandler!();                                         // reload A (older), slow
    queue.push(Promise.resolve({ data: [dbRow('ann'), dbRow('bo')], error: null }));
    realtimeHandler!();                                         // reload B (newer), fast
    await flush();
    slow.resolve({ data: [dbRow('ann')], error: null });        // A lands last
    await flush();
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
