/**
 * @file p1698-fetch-my-events.test.ts
 * @description P1698: `fetchMyEvents` (src/app/data/event-list-reads.ts) against a mocked Supabase client.
 *  - the upcoming/past split is the global lists' rule (status upcoming or cancelled, and not before the grace
 *    cutoff, the cutoff itself included), with upcoming soonest first and past most recent first;
 *  - an event hosted AND registered appears once, from the hosted row, and its id is in registeredIds;
 *  - the `!inner` embed is read as an object or a one-element array, and a null embed is skipped;
 *  - a hosted or registered error rejects with throwOnError (and resolves empty without it);
 *  - an aborted signal returns empty and never sends the counts read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventWithHost } from '@/app/types';

type Row = { id: string; title: string; datetime: string; status: string; host_id: string };
type Query = { table: string; select: string };
type Result = { data: unknown; error: unknown };

const db = vi.hoisted(() => ({
  queries: [] as { table: string; select: string }[],
  respond: (() => ({ data: [], error: null })) as (q: { table: string; select: string }) => { data: unknown; error: unknown },
  /** Runs when a query is awaited, before it answers (to abort mid-flight). */
  onAwait: null as null | (() => void),
}));

// A thenable builder per query: chained calls return it, awaiting it answers `db.respond(query)`.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const query = { table, select: '' };
      const builder: Record<string, unknown> = {};
      for (const m of ['eq', 'in', 'order', 'abortSignal']) builder[m] = () => builder;
      builder.select = (cols: string) => {
        query.select = cols;
        return builder;
      };
      builder.then = (resolve: (v: unknown) => unknown) => {
        db.queries.push(query);
        db.onAwait?.();
        return resolve(db.respond(query));
      };
      return builder;
    },
  },
}));

const { fetchMyEvents } = await import('@/app/data/event-list-reads');

const ME = 'user-id-me';
const OTHER = 'user-id-other';
const CUTOFF = '2026-11-17T00:00:00.000Z';
const at = (offsetMs: number) => new Date(Date.parse(CUTOFF) + offsetMs).toISOString();
const HOUR = 3_600_000;
const DB_ERROR = { message: 'permission denied', code: '42501', details: '', hint: '' };

function row(id: string, offsetMs: number, status = 'upcoming', host = ME, title = id): Row {
  return { id, title, datetime: at(offsetMs), status, host_id: host };
}
const toEvent = (r: Row) =>
  ({ id: r.id, title: r.title, datetime: r.datetime, status: r.status, hostId: r.host_id }) as unknown as EventWithHost;

const isHosted = (q: Query) => q.table === 'events';
const isRegistered = (q: Query) => q.table === 'event_rsvps' && q.select.startsWith('event:events!inner(');
const isCounts = (q: Query) => q.table === 'event_rsvps' && q.select === 'event_id, profile_id';

function answer(hosted: Result, registered: Result, counts: Result = { data: [], error: null }) {
  db.respond = (q) => (isHosted(q) ? hosted : isRegistered(q) ? registered : isCounts(q) ? counts : { data: null, error: DB_ERROR });
}
const ok = (data: unknown): Result => ({ data, error: null });
const ids = (events: EventWithHost[]) => events.map((e) => e.id);

beforeEach(() => {
  db.queries = [];
  db.onAwait = null;
  answer(ok([]), ok([]));
});

describe('P1698 fetchMyEvents: the upcoming/past split and order', () => {
  it('splits by status and the grace cutoff, the cutoff itself upcoming; upcoming soonest first, past most recent first', async () => {
    answer(
      ok([
        row('upcoming-in-3d', 72 * HOUR),
        row('cancelled-inside-window', 1 * HOUR, 'cancelled'),
        row('upcoming-at-cutoff', 0),
        row('upcoming-1ms-before-cutoff', -1),
        row('cancelled-before-cutoff', -1 * HOUR, 'cancelled'),
        row('completed-in-future', 5 * 24 * HOUR, 'completed'),
        row('completed-long-ago', -30 * 24 * HOUR, 'completed'),
      ]),
      ok([]),
    );
    const mine = await fetchMyEvents(ME, CUTOFF, toEvent);
    expect(ids(mine.upcoming)).toEqual(['upcoming-at-cutoff', 'cancelled-inside-window', 'upcoming-in-3d']);
    expect(ids(mine.past)).toEqual([
      'completed-in-future', // completed is always past, wherever its date
      'upcoming-1ms-before-cutoff',
      'cancelled-before-cutoff',
      'completed-long-ago',
    ]);
  });
});

describe('P1698 fetchMyEvents: one card per event, Going from the registered read', () => {
  it('an event hosted AND registered appears once, from the hosted row, and its id is in registeredIds', async () => {
    answer(
      ok([row('both', HOUR, 'upcoming', ME, 'hosted copy')]),
      ok([
        { event: row('both', HOUR, 'upcoming', ME, 'registered copy') },
        { event: row('theirs', 2 * HOUR, 'upcoming', OTHER) },
      ]),
    );
    const mine = await fetchMyEvents(ME, CUTOFF, toEvent);
    expect(ids(mine.upcoming)).toEqual(['both', 'theirs']);
    expect(mine.upcoming[0]?.title).toBe('hosted copy');
    expect(mine.registeredIds).toEqual(['both', 'theirs']);
  });

  it('reads the `!inner` embed as an object or a one-element array, and skips a null embed', async () => {
    answer(
      ok([]),
      ok([
        { event: row('as-object', HOUR, 'upcoming', OTHER) },
        { event: [row('as-array', 2 * HOUR, 'upcoming', OTHER)] },
        { event: null },
      ]),
    );
    const mine = await fetchMyEvents(ME, CUTOFF, toEvent);
    expect(ids(mine.upcoming)).toEqual(['as-object', 'as-array']);
    expect(mine.registeredIds).toEqual(['as-object', 'as-array']);
  });

  it('attaches going counts with one counts read over the merged list, and skips it when there is nothing', async () => {
    answer(
      ok([row('mine', HOUR)]),
      ok([{ event: row('theirs', 2 * HOUR, 'upcoming', OTHER) }]),
      ok([
        { event_id: 'mine', profile_id: OTHER },
        { event_id: 'theirs', profile_id: ME },
        { event_id: 'theirs', profile_id: 'user-id-third' },
      ]),
    );
    const mine = await fetchMyEvents(ME, CUTOFF, toEvent);
    expect(mine.upcoming.map((e) => [e.id, e.attendeeCount])).toEqual([['mine', 1], ['theirs', 2]]);
    expect(db.queries.filter(isCounts)).toHaveLength(1);
    expect(db.queries).toHaveLength(3);

    db.queries = [];
    answer(ok([]), ok([]));
    await expect(fetchMyEvents(ME, CUTOFF, toEvent)).resolves.toEqual({ upcoming: [], past: [], registeredIds: [] });
    expect(db.queries.filter(isCounts)).toHaveLength(0);
  });
});

describe('P1698 fetchMyEvents: failure and cancellation', () => {
  it.each([
    ['hosted', () => answer({ data: null, error: DB_ERROR }, ok([]))],
    ['registered', () => answer(ok([]), { data: null, error: DB_ERROR })],
  ])('a %s read error rejects with throwOnError, and resolves empty without it', async (_which, arrange) => {
    arrange();
    await expect(fetchMyEvents(ME, CUTOFF, toEvent, { throwOnError: true })).rejects.toThrow();
    await expect(fetchMyEvents(ME, CUTOFF, toEvent)).resolves.toEqual({ upcoming: [], past: [], registeredIds: [] });
  });

  it('a signal aborted before the call: empty, and no request at all', async () => {
    const gaveUp = new AbortController();
    gaveUp.abort();
    await expect(fetchMyEvents(ME, CUTOFF, toEvent, { signal: gaveUp.signal })).resolves.toEqual({
      upcoming: [],
      past: [],
      registeredIds: [],
    });
    expect(db.queries).toHaveLength(0);
  });

  it('a signal aborted while the reads are out: empty, and the counts read is never sent', async () => {
    answer(ok([row('mine', HOUR)]), ok([]));
    const gaveUp = new AbortController();
    db.onAwait = () => gaveUp.abort();
    await expect(fetchMyEvents(ME, CUTOFF, toEvent, { signal: gaveUp.signal })).resolves.toEqual({
      upcoming: [],
      past: [],
      registeredIds: [],
    });
    expect(db.queries.filter(isCounts)).toHaveLength(0);
    expect(db.queries.filter((q) => isHosted(q) || isRegistered(q))).toHaveLength(2);
  });
});
