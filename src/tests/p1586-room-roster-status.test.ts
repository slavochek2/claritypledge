/**
 * P1586 §4: the roster subscription reports a status alongside the roster, so the page can tell
 * "not loaded yet" from "first read failed". Additive: the roster callback (the [] before the
 * first success, the ordering, the keep-last-good rule) is pinned by p1114-roster-reload-ordering.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { subscribeToRoomRoster, type RosterStatus } from '@/app/data/event-room-service';

const dbRow = (id: string) => ({ id, event_id: 'e1', profile_id: null, display_name: id, opted_in: null, comprehension_rating: null, joined_at: '2026-09-18T00:00:00Z', profile: null });
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (...ids: string[]) => Promise.resolve({ data: ids.map(dbRow), error: null });
const fail = () => Promise.resolve({ data: null, error: { message: 'down' } });

beforeEach(() => { queue.length = 0; realtimeHandler = null; });

describe('subscribeToRoomRoster status (P1586 §4)', () => {
  it('reports pending, then ready after a success', async () => {
    queue.push(ok('ann'));
    const statuses: RosterStatus[] = [];
    const stop = subscribeToRoomRoster('e1', () => {}, (s) => statuses.push(s));
    expect(statuses).toEqual(['pending']);
    await flush();
    expect(statuses).toEqual(['pending', 'ready']);
    stop();
  });

  it('reports failed when the first read fails, and the roster still reports []', async () => {
    queue.push(fail());
    const statuses: RosterStatus[] = [];
    const seen: unknown[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r), (s) => statuses.push(s));
    await flush();
    expect(statuses).toEqual(['pending', 'failed']);
    expect(seen).toEqual([[]]);
    stop();
  });

  it('goes failed -> ready when a later read succeeds', async () => {
    queue.push(fail());
    const statuses: RosterStatus[] = [];
    const stop = subscribeToRoomRoster('e1', () => {}, (s) => statuses.push(s));
    await flush();
    queue.push(ok('ann'));
    realtimeHandler!();
    await flush();
    expect(statuses).toEqual(['pending', 'failed', 'ready']);
    stop();
  });

  it('stays ready, keeping the rows, when a later read fails', async () => {
    queue.push(ok('ann'));
    const statuses: RosterStatus[] = [];
    const seen: string[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)), (s) => statuses.push(s));
    await flush();
    queue.push(fail());
    realtimeHandler!();
    await flush();
    expect(statuses).toEqual(['pending', 'ready']);
    expect(seen).toEqual([['ann']]);
    stop();
  });

  it('a fetch that THROWS counts as a failed read: status leaves pending, roster reports []', async () => {
    queue.push(Promise.reject(new Error('network down')));
    const statuses: RosterStatus[] = [];
    const seen: unknown[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r), (s) => statuses.push(s));
    await flush();
    expect(statuses).toEqual(['pending', 'failed']);
    expect(seen).toEqual([[]]);
    // and the single-flight loop survives it: a later event reads again and recovers
    queue.push(ok('ann'));
    realtimeHandler!();
    await flush();
    expect(statuses).toEqual(['pending', 'failed', 'ready']);
    stop();
  });

  it('a throw after rows were shown keeps the rows and stays ready', async () => {
    queue.push(ok('ann'));
    const statuses: RosterStatus[] = [];
    const seen: string[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)), (s) => statuses.push(s));
    await flush();
    queue.push(Promise.reject(new Error('network down')));
    realtimeHandler!();
    await flush();
    expect(statuses).toEqual(['pending', 'ready']);
    expect(seen).toEqual([['ann']]);
    stop();
  });

  it('is optional: a caller that passes no status callback is unaffected', async () => {
    queue.push(ok('ann'));
    const seen: string[][] = [];
    const stop = subscribeToRoomRoster('e1', (r) => seen.push(r.map((m) => m.displayName)));
    await flush();
    expect(seen).toEqual([['ann']]);
    stop();
  });
});
