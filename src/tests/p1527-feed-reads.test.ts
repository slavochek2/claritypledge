import { describe, it, expect, vi, beforeEach } from 'vitest';

/** A thenable query builder that records each awaited request and resolves it with `rows`. */
const requests: { table: string; calls: string[] }[] = [];
let rows: unknown[] = [];
/** event_rsvps fixture (its own table): rows the RSVP-count read returns. */
let rsvpRows: unknown[] = [];
let queryError: unknown = null;
const mockFrom = vi.fn((table: string) => {
  const rec = { table, calls: [] as string[] };
  requests.push(rec);
  const builder: Record<string, unknown> = {};
  let containsArg: string[] | null = null;
  for (const m of ['select', 'eq', 'in', 'not', 'gte', 'lte', 'contains', 'order', 'range']) {
    builder[m] = (...a: unknown[]) => {
      rec.calls.push(`${m}:${JSON.stringify(a)}`);
      if (m === 'contains') containsArg = a[1] as string[];
      return builder;
    };
  }
  builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
    let data: unknown[] = table === 'event_rsvps' ? rsvpRows : rows;
    // like PostgREST: .contains('system_tags', [x]) returns only rows whose system_tags include x
    if (containsArg) {
      const want = containsArg;
      data = data.filter((r) => want.every((t) => ((r as { system_tags?: string[] }).system_tags ?? []).includes(t)));
    }
    return Promise.resolve({ data, error: queryError }).then(res, rej);
  };
  return builder;
});

vi.mock('@/lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t), auth: { getSession: () => Promise.resolve({ data: { session: null } }) } } }));
vi.mock('@/app/prototypes/events/banner-utils', () => ({ generateAIBanner: vi.fn() }));

beforeEach(() => { requests.length = 0; rows = []; rsvpRows = []; queryError = null; mockFrom.mockClear(); });

describe('P1527 getStoryBySlug (pinned story in one request)', () => {
  const base = { author_id: 'a1', content: 'c', created_at: '2026-01-01T00:00:00Z', visibility: 'public', tags: [], author: null };

  it('one request; the highest vN version wins', async () => {
    rows = [
      { ...base, id: 'old', system_tags: ['st1', 'v1'] },
      { ...base, id: 'new', system_tags: ['st1', 'v2'] },
      // a competing slug with a HIGHER version: only returned if the filter is missing/wrong
      { ...base, id: 'other', system_tags: ['st2', 'v9'] },
    ];
    const { getStoryBySlug } = await import('@/app/data/stories-service-real');
    const s = await getStoryBySlug('st1');
    const stories = requests.filter((r) => r.table === 'stories');
    expect(stories).toHaveLength(1);
    expect(stories[0].calls).toContain('contains:["system_tags",["st1"]]');
    expect(s?.id).toBe('new');
  });

  it('a query error is logged and returns null; a genuinely missing story stays silent', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getStoryBySlug } = await import('@/app/data/stories-service-real');
    rows = [];
    expect(await getStoryBySlug('st1')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    queryError = { message: 'boom', code: 'XX000' };
    expect(await getStoryBySlug('st1')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('a story with no version tag still resolves; a missing slug or non-slug gives null', async () => {
    const { getStoryBySlug } = await import('@/app/data/stories-service-real');
    rows = [{ ...base, id: 'only', system_tags: ['st1'] }];
    expect((await getStoryBySlug('st1'))?.id).toBe('only');
    rows = [];
    expect(await getStoryBySlug('st9')).toBeNull();
    requests.length = 0;
    expect(await getStoryBySlug('not-a-slug')).toBeNull();
    expect(requests).toHaveLength(0);
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

  it('getUpcomingEventsByOrg: ONE events query + ONE rsvp query for 3 orgs, each list = its own events', async () => {
    rows = [ev('e1', 'A', '2026-11-01T10:00:00Z'), ev('e2', 'B', '2026-11-02T10:00:00Z'), ev('e3', 'A', '2026-11-03T10:00:00Z'), ev('e4', 'A', '2026-11-04T10:00:00Z')];
    const { realEventsService } = await import('@/app/data/events-service-real');
    const out = await realEventsService.getUpcomingEventsByOrg(['A', 'B', 'C']);
    expect(requests.map((r) => r.table)).toEqual(['events', 'event_rsvps']);
    expect(requests[0].calls.some((c) => c.startsWith('in:["org_id",["A","B","C"]]'))).toBe(true);
    expect(out.A.map((e) => e.id)).toEqual(['e1', 'e3', 'e4']);
    expect(out.B.map((e) => e.id)).toEqual(['e2']);
    expect(out.C).toEqual([]);
  });

  it('attendeeCount and hostHasRsvp are computed per event from the RSVP rows (host with and without own RSVP)', async () => {
    rows = [
      { ...ev('hostIn', 'A', '2026-11-01T10:00:00Z'), host_id: 'h1' },
      { ...ev('hostOut', 'B', '2026-11-02T10:00:00Z'), host_id: 'h2' },
      { ...ev('empty', 'A', '2026-11-03T10:00:00Z'), host_id: 'h3' },
    ];
    rsvpRows = [
      { event_id: 'hostIn', profile_id: 'h1' }, { event_id: 'hostIn', profile_id: 'p1' }, { event_id: 'hostIn', profile_id: 'p2' },
      { event_id: 'hostOut', profile_id: 'p1' }, { event_id: 'hostOut', profile_id: 'h1' }, // h1 is NOT hostOut's host
    ];
    const { realEventsService } = await import('@/app/data/events-service-real');
    const out = await realEventsService.getUpcomingEventsByOrg(['A', 'B']);
    const byId = Object.fromEntries([...out.A, ...out.B].map((e) => [e.id, e]));
    expect(byId.hostIn.attendeeCount).toBe(3);
    expect(byId.hostIn.hostHasRsvp).toBe(true);
    expect(byId.hostOut.attendeeCount).toBe(2);
    expect(byId.hostOut.hostHasRsvp).toBe(false);
    expect(byId.empty.attendeeCount).toBe(0);
    expect(byId.empty.hostHasRsvp).toBe(false);
  });

  it('getUpcomingEventsByOrg([]) makes no request', async () => {
    const { realEventsService } = await import('@/app/data/events-service-real');
    expect(await realEventsService.getUpcomingEventsByOrg([])).toEqual({});
    expect(requests).toHaveLength(0);
  });

  it('homeRead flattens in group order (group A events, then group B), one read for both', async () => {
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
    vi.doUnmock('@/app/data/organizations-service');
    vi.doUnmock('@/app/data/events-service');
  });
});
