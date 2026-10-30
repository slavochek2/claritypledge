// @vitest-environment jsdom
/**
 * The two RSVP reads behind the events list (event-list-reads.ts), at the batch boundary and in a hidden tab:
 *  - every `in.(…)` carries at most 100 ids (one read over 373 events exceeded the URL limit, HTTP 414);
 *  - the answers are joined across batches;
 *  - a failure in a LATER batch rejects (counts: with `throwOnError`; the viewer's marks: always) and leaves no
 *    partial counts behind;
 *  - metered rule 3: no request from a hidden tab until it is shown, and none at all once the caller aborted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { EventWithHost } from '@/app/types';

type Row = { event_id: string; profile_id?: string };
const db = vi.hoisted(() => ({
  /** One entry per awaited read: the ids its `in.()` carried. */
  batches: [] as string[][],
  /** Which batch (0-based) answers with an error, if any. */
  failBatch: -1,
  rows: [] as Row[],
  /** Runs while the reads are in flight (after they were sent, before they answer). */
  inFlight: null as null | (() => void),
  /** The signal each read was given (PostgREST's abortSignal), if any. */
  signals: [] as AbortSignal[],
}));

vi.mock('@/lib/supabase', () => {
  const builder = () => {
    let ids: string[] = [];
    let profileId: string | undefined;
    const b = {
      select: () => b,
      eq: (_col: string, v: string) => { profileId = v; return b; },
      in: (_col: string, v: string[]) => { ids = v; return b; },
      abortSignal: (sig: AbortSignal) => { db.signals.push(sig); return b; },
      then: (resolve: (r: unknown) => void) => {
        const n = db.batches.push(ids) - 1;
        db.inFlight?.();
        if (n === db.failBatch) return resolve({ data: null, error: { message: 'batch failed', code: 'XX000' } });
        const data = db.rows.filter((r) => ids.includes(r.event_id) && (profileId === undefined || r.profile_id === profileId));
        return resolve({ data, error: null });
      },
    };
    return b;
  };
  return { supabase: { from: () => builder() } };
});
vi.mock('@/app/data/db-error-logger', () => ({
  logDbError: vi.fn(),
  throwDbError: (_c: string, _e: unknown, msg: string) => { throw new Error(msg); },
}));

import { attachRsvpCounts, fetchViewerRsvpEventIds } from '@/app/data/event-list-reads';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i}`);
const events = (n: number) => ids(n).map((id) => ({ id, hostId: 'host' }) as EventWithHost);
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const show = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };

beforeEach(() => {
  db.batches = [];
  db.failBatch = -1;
  db.rows = [];
  db.inFlight = null;
  db.signals = [];
});
afterEach(() => setVisibility('visible'));

describe.each([101, 201])('%i events', (n) => {
  const expectedBatches = Math.ceil(n / 100);

  it('attachRsvpCounts: every in.() has ≤100 ids, all ids are read once, counts join across batches', async () => {
    db.rows = [{ event_id: 'e0', profile_id: 'a' }, { event_id: 'e0', profile_id: 'host' }, { event_id: `e${n - 1}`, profile_id: 'b' }];
    const list = events(n);
    await attachRsvpCounts(list);
    expect(db.batches).toHaveLength(expectedBatches);
    for (const b of db.batches) expect(b.length).toBeLessThanOrEqual(100);
    expect(db.batches.flat()).toEqual(ids(n));
    expect(list[0]!.attendeeCount).toBe(2);
    expect(list[0]!.hostHasRsvp).toBe(true);
    expect(list[n - 1]!.attendeeCount).toBe(1); // the last id sits in the last batch
    expect(list[1]!.attendeeCount).toBe(0);
  });

  it('attachRsvpCounts: a failure in the LAST batch rejects with throwOnError, and no event keeps a partial count', async () => {
    db.rows = [{ event_id: 'e0', profile_id: 'a' }];
    db.failBatch = expectedBatches - 1;
    const list = events(n);
    await expect(attachRsvpCounts(list, { throwOnError: true })).rejects.toThrow();
    expect(list.every((e) => e.attendeeCount === undefined)).toBe(true);
  });

  it('attachRsvpCounts without throwOnError: a later failure leaves every count unset (never partial) and is logged', async () => {
    db.rows = [{ event_id: 'e0', profile_id: 'a' }];
    db.failBatch = expectedBatches - 1;
    const list = events(n);
    const { logDbError } = await import('@/app/data/db-error-logger');
    vi.mocked(logDbError).mockClear();
    await attachRsvpCounts(list);
    expect(list.every((e) => e.attendeeCount === undefined)).toBe(true);
    expect(vi.mocked(logDbError)).toHaveBeenCalledWith('attachRsvpCounts', expect.objectContaining({ message: 'batch failed' }));
  });

  it("fetchViewerRsvpEventIds: every in.() has ≤100 ids and the viewer's marks join across batches", async () => {
    db.rows = [{ event_id: 'e0', profile_id: 'me' }, { event_id: `e${n - 1}`, profile_id: 'me' }, { event_id: 'e5', profile_id: 'other' }];
    const marked = await fetchViewerRsvpEventIds(ids(n), 'me');
    expect(db.batches).toHaveLength(expectedBatches);
    for (const b of db.batches) expect(b.length).toBeLessThanOrEqual(100);
    expect(db.batches.flat()).toEqual(ids(n));
    expect(marked.sort()).toEqual(['e0', `e${n - 1}`].sort());
  });

  it('fetchViewerRsvpEventIds: a failure in the LAST batch rejects (unknown, never "not going")', async () => {
    db.rows = [{ event_id: 'e0', profile_id: 'me' }];
    db.failBatch = expectedBatches - 1;
    await expect(fetchViewerRsvpEventIds(ids(n), 'me')).rejects.toThrow();
  });
});

describe('fetchViewerRsvpEventIds in a hidden tab (metered rule 3)', () => {
  it('no request while hidden; shown: the batches go out', async () => {
    setVisibility('hidden');
    const pending = fetchViewerRsvpEventIds(ids(3), 'me');
    await Promise.resolve();
    await Promise.resolve();
    expect(db.batches).toHaveLength(0);
    show();
    await pending;
    expect(db.batches).toHaveLength(1);
  });

  it('aborted while waiting for a visible tab: no request at all, even once shown', async () => {
    setVisibility('hidden');
    const gaveUp = new AbortController();
    const pending = fetchViewerRsvpEventIds(ids(3), 'me', { signal: gaveUp.signal });
    gaveUp.abort();
    await expect(pending).resolves.toEqual([]);
    show();
    await Promise.resolve();
    expect(db.batches).toHaveLength(0);
  });

  it('already aborted: no request', async () => {
    const gaveUp = new AbortController();
    gaveUp.abort();
    await expect(fetchViewerRsvpEventIds(ids(3), 'me', { signal: gaveUp.signal })).resolves.toEqual([]);
    expect(db.batches).toHaveLength(0);
  });
});

describe('aborted while the reads are in flight', () => {
  it('attachRsvpCounts: the answers are dropped — no event gets a count — and each read carried the signal', async () => {
    const { logDbError } = await import('@/app/data/db-error-logger');
    vi.mocked(logDbError).mockClear();
    db.rows = [{ event_id: 'e0', profile_id: 'host' }];
    const gaveUp = new AbortController();
    db.inFlight = () => gaveUp.abort();
    const list = events(150);
    await attachRsvpCounts(list, { throwOnError: true, signal: gaveUp.signal });
    expect(db.batches).toHaveLength(2); // sent: the tab was visible and nobody had given up yet
    expect(list.every((e) => e.attendeeCount === undefined && e.hostHasRsvp === undefined)).toBe(true);
    expect(db.signals).toEqual([gaveUp.signal, gaveUp.signal]);
    // Gemini review: an abort is not a failure — nothing is logged for it.
    expect(vi.mocked(logDbError)).not.toHaveBeenCalled();
  });

  it('fetchViewerRsvpEventIds: [] — the answers are dropped — and each read carried the signal', async () => {
    db.rows = [{ event_id: 'e0', profile_id: 'me' }];
    const gaveUp = new AbortController();
    db.inFlight = () => gaveUp.abort();
    await expect(fetchViewerRsvpEventIds(ids(150), 'me', { signal: gaveUp.signal })).resolves.toEqual([]);
    expect(db.batches).toHaveLength(2);
    expect(db.signals).toEqual([gaveUp.signal, gaveUp.signal]);
  });
});

it('attachRsvpCounts: hostHasRsvp only for the event whose OWN host has a row (another event\'s host does not count)', async () => {
  db.rows = [{ event_id: 'e0', profile_id: 'hostB' }, { event_id: 'e1', profile_id: 'hostB' }];
  const list = [{ id: 'e0', hostId: 'hostA' }, { id: 'e1', hostId: 'hostB' }] as EventWithHost[];
  await attachRsvpCounts(list);
  expect(list.map((e) => e.hostHasRsvp)).toEqual([false, true]);
  expect(list.map((e) => e.attendeeCount)).toEqual([1, 1]);
});
