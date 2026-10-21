import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dedupeInFlight } from '@/lib/in-flight';

/** A thenable query builder that records each awaited request and resolves it with `rows`. */
const requests: { table: string; calls: string[] }[] = [];
let rows: unknown[] = [];
/** While set, a SELECT on `stories` waits for it (its data is snapshotted when the query starts). */
let gate: Promise<void> | null = null;
const mockFrom = vi.fn((table: string) => {
  const rec = { table, calls: [] as string[] };
  const snapshot = rows; // what the database holds when this query is built (= when the read starts)
  requests.push(rec);
  const builder: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lte', 'contains', 'order', 'range', 'single', 'update', 'delete', 'insert']) {
    builder[m] = (...a: unknown[]) => { rec.calls.push(`${m}:${JSON.stringify(a)}`); return builder; };
  }
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    const single = rec.calls.some((c) => c.startsWith('single:'));
    const isRead = rec.calls.some((c) => c.startsWith('select:')) && !rec.calls.some((c) => c.startsWith('delete:') || c.startsWith('update:'));
    const wait = table === 'stories' && isRead && gate ? gate : Promise.resolve();
    return wait.then(() => ({ data: single ? snapshot[0] : snapshot, error: null })).then(res, rej);
  };
  return builder;
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({ generateAIBanner: vi.fn() }));

beforeEach(() => { requests.length = 0; rows = []; gate = null; mockFrom.mockClear(); });

describe('dedupeInFlight', () => {
  it('N concurrent callers with one key start ONE request and share its result', async () => {
    const start = vi.fn(() => new Promise<number>((r) => setTimeout(() => r(7), 5)));
    const results = await Promise.all([1, 2, 3, 4].map(() => dedupeInFlight('k', start)));
    expect(start).toHaveBeenCalledTimes(1);
    expect(results).toEqual([7, 7, 7, 7]);
  });

  it('different keys do not share', async () => {
    const start = vi.fn(async () => 1);
    await Promise.all([dedupeInFlight('a', start), dedupeInFlight('b', start)]);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('is not a cache: a call after settle starts a fresh request (sees data written meanwhile)', async () => {
    let value = 'before';
    const start = vi.fn(async () => value);
    expect(await dedupeInFlight('k', start)).toBe('before');
    value = 'after-mutation';
    expect(await dedupeInFlight('k', start)).toBe('after-mutation');
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('a rejection is shared by concurrent callers, then cleared so the next call retries', async () => {
    const start = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    const settled = await Promise.allSettled([dedupeInFlight('k', start), dedupeInFlight('k', start)]);
    expect(settled.map((s) => s.status)).toEqual(['rejected', 'rejected']);
    expect(start).toHaveBeenCalledTimes(1);
    expect(await dedupeInFlight('k', start)).toBe('ok');
  });
});

describe('P1527 services issue one request for concurrent identical reads', () => {
  it('getEventTopicTags: StrictMode-style double call -> 1 events request', async () => {
    rows = [{ statement_tag: 'a' }, { statement_tag: 'a' }, { statement_tag: 'b' }];
    const { getEventTopicTags } = await import('@/app/data/event-topic-tags');
    const [x, y] = await Promise.all([getEventTopicTags(), getEventTopicTags()]);
    expect(requests.filter((r) => r.table === 'events')).toHaveLength(1);
    expect(x).toEqual(['a', 'b']);
    expect(y).toEqual(['a', 'b']);
    await getEventTopicTags();
    expect(requests.filter((r) => r.table === 'events')).toHaveLength(2); // settled -> fresh read
  });

  it('getPublicStoriesFeed: same args -> 1 stories request; different tag -> its own', async () => {
    const { realStoriesService } = await import('@/app/data/stories-service-real');
    await Promise.all([
      realStoriesService.getPublicStoriesFeed(50, 0, undefined, false),
      realStoriesService.getPublicStoriesFeed(50, 0, undefined, false),
      realStoriesService.getPublicStoriesFeed(50, 0, 'understanding', false),
    ]);
    expect(requests.filter((r) => r.table === 'stories')).toHaveLength(2);
  });

  it('getStoryBySlug: one request, highest vN version wins; resolveStorySlug shares in flight', async () => {
    const base = { author_id: 'a1', content: 'c', created_at: '2026-01-01T00:00:00Z', visibility: 'public', tags: [], author: null };
    rows = [
      { ...base, id: 'old', system_tags: ['st1', 'v1'] },
      { ...base, id: 'new', system_tags: ['st1', 'v2'] },
    ];
    const { getStoryBySlug, resolveStorySlug } = await import('@/app/data/stories-service-real');
    const [a, b] = await Promise.all([getStoryBySlug('st1'), getStoryBySlug('st1')]);
    expect(requests.filter((r) => r.table === 'stories')).toHaveLength(1);
    expect(a?.id).toBe('new');
    expect(b?.id).toBe('new');
    requests.length = 0;
    const ids = await Promise.all([resolveStorySlug('st1'), resolveStorySlug('st1')]);
    expect(requests).toHaveLength(1);
    expect(ids).toEqual(['new', 'new']);
    expect(await getStoryBySlug('not-a-slug')).toBeNull();
  });

  it('getUpcomingEvents: same org concurrently -> 1 events request; other org separate', async () => {
    rows = [];
    const { realEventsService } = await import('@/app/data/events-service-real');
    await Promise.all([
      realEventsService.getUpcomingEvents('org1'),
      realEventsService.getUpcomingEvents('org1'),
      realEventsService.getUpcomingEvents('org2'),
    ]);
    expect(requests.filter((r) => r.table === 'events')).toHaveLength(2);
  });
});

describe('P1527 multi-org upcoming events (side rail)', () => {
  const ev = (id: string, org: string | null, at: string) => ({
    id, org_id: org, slug: id, title: id, description: '', datetime: at, duration_minutes: 60, timezone: 'UTC',
    location: '', host_id: 'h', max_attendees: null, created_at: at, status: 'upcoming', host: null,
  });

  it('groupEventsByOrg: uneven counts, empty group, order kept, strangers dropped', async () => {
    const { groupEventsByOrg } = await import('@/app/data/events-service-real');
    const out = groupEventsByOrg(
      [
        { orgId: 'A', event: 'a1' }, { orgId: 'B', event: 'b1' }, { orgId: 'A', event: 'a2' },
        { orgId: 'A', event: 'a3' }, { orgId: 'X', event: 'x1' }, { orgId: null, event: 'n1' },
      ],
      ['A', 'B', 'C'],
    );
    expect(out).toEqual({ A: ['a1', 'a2', 'a3'], B: ['b1'], C: [] });
  });

  it('getUpcomingEventsByOrg: ONE events query + ONE rsvp query for 2 groups, each list = its own events', async () => {
    rows = [ev('e1', 'A', '2026-11-01T10:00:00Z'), ev('e2', 'B', '2026-11-02T10:00:00Z'), ev('e3', 'A', '2026-11-03T10:00:00Z'), ev('e4', 'A', '2026-11-04T10:00:00Z')];
    const { realEventsService } = await import('@/app/data/events-service-real');
    const out = await realEventsService.getUpcomingEventsByOrg(['A', 'B', 'C']);
    expect(requests.map((r) => r.table)).toEqual(['events', 'event_rsvps']);
    expect(requests[0].calls.some((c) => c.startsWith('in:["org_id",["A","B","C"]]'))).toBe(true);
    expect(out.A.map((e) => e.id)).toEqual(['e1', 'e3', 'e4']);
    expect(out.B.map((e) => e.id)).toEqual(['e2']);
    expect(out.C).toEqual([]);
  });

  it('getUpcomingEventsByOrg([]) makes no request', async () => {
    const { realEventsService } = await import('@/app/data/events-service-real');
    expect(await realEventsService.getUpcomingEventsByOrg([])).toEqual({});
    expect(requests).toHaveLength(0);
  });

  it('homeRead flattens in group order (group A events, then group B), like one read per group', async () => {
    vi.resetModules();
    vi.doMock('@/app/data/organizations-service', () => ({
      organizationsService: { listPublicOrganizations: async () => [{ id: 'A', slug: 'a' }, { id: 'B', slug: 'b' }, { id: 'C', slug: 'cm' }] },
    }));
    const byOrg = vi.fn(async () => ({ A: [{ id: 'a1' }, { id: 'a2' }], B: [{ id: 'b1' }] }));
    vi.doMock('@/app/data/events-service', () => ({ eventsService: { getUpcomingEventsByOrg: byOrg } }));
    const { homeRead } = await import('@/app/data/offline-reads');
    const res = await homeRead().fetch();
    expect(byOrg).toHaveBeenCalledTimes(1);
    expect(byOrg).toHaveBeenCalledWith(['A', 'B']);
    expect(res?.events.map((e) => e.id)).toEqual(['a1', 'a2', 'b1']);
    expect(res?.groups.map((g) => g.id)).toEqual(['A', 'B', 'C']);
    vi.doUnmock('@/app/data/organizations-service');
    vi.doUnmock('@/app/data/events-service');
  });
});

describe('P1527 write-aware invalidation (a read after a write must not join a read from before it)', () => {
  const storyRow = (content: string) => ({
    id: 's1', author_id: 'a1', content, created_at: '2026-01-01T00:00:00Z', visibility: 'public', tags: [], system_tags: [], author: null,
  });

  it('getStory: two concurrent calls -> ONE stories request', async () => {
    rows = [storyRow('v1')];
    const { realStoriesService } = await import('@/app/data/stories-service-real');
    const [a, b] = await Promise.all([realStoriesService.getStory('s1'), realStoriesService.getStory('s1')]);
    expect(requests.filter((r) => r.table === 'stories')).toHaveLength(1);
    expect(a?.content).toBe('v1');
    expect(b?.content).toBe('v1');
  });

  it('REGRESSION: read pending -> write completes -> new read starts a fresh fetch and sees post-write data', async () => {
    rows = [storyRow('before')];
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    const { realStoriesService } = await import('@/app/data/stories-service-real');

    const pending = realStoriesService.getStory('s1');          // starts, snapshots 'before', waits on the gate
    rows = [];                                                   // the write lands in the database...
    await realStoriesService.deleteStory('s1');                  // ...and the write call completes
    gate = null;
    const after = await realStoriesService.getStory('s1');       // must NOT join `pending`

    expect(requests.filter((r) => r.table === 'stories' && r.calls.some((c) => c.startsWith('select:')))).toHaveLength(2);
    expect(after).toBeNull();                                    // post-write data (story is gone)
    release();
    expect((await pending)?.content).toBe('before');             // the dropped read still resolves for its own caller
  });

  it('invalidateInFlight drops only matching prefixes; the old promise cleanup never deletes a newer entry', async () => {
    const { invalidateInFlight, dedupeInFlight } = await import('@/lib/in-flight'); // same module graph as the services
    let releaseOld!: (v: string) => void;
    const old = dedupeInFlight('story:x', () => new Promise<string>((r) => { releaseOld = r; }));
    const other = dedupeInFlight('event:y', async () => 'y');
    invalidateInFlight('story');
    const start = vi.fn(async () => 'new');
    const fresh = dedupeInFlight('story:x', start);              // new entry under the same key
    releaseOld('old');                                           // old settles AFTER the new entry exists
    expect(await old).toBe('old');
    expect(await fresh).toBe('new');
    // the old promise's cleanup must not have removed the (already settled) new entry's slot wrongly:
    const again = vi.fn(async () => 'again');
    const third = dedupeInFlight('story:x', again);
    expect(await third).toBe('again');
    expect(await other).toBe('y');
  });

  it('event writes drop pending event reads (topic tags)', async () => {
    rows = [{ statement_tag: 'old' }];
    const { getEventTopicTags } = await import('@/app/data/event-topic-tags');
    const { invalidateInFlight, EVENT_READS } = await import('@/lib/in-flight');
    const p1 = getEventTopicTags();
    rows = [{ statement_tag: 'new' }];
    invalidateInFlight(EVENT_READS);
    expect(await getEventTopicTags()).toEqual(['new']);
    expect(await p1).toEqual(['old']);
  });
});
