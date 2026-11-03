/**
 * P1603: the data side of hidden events — the link ending, the by-slug read with its fallback, the RSVP gate, the by-link
 * registration, and the edit mapping. The database side (who may read what) is e2e/integration/20261103030000_p1603_hidden_events.spec.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const rpcCalls: Array<{ fn: string; args: unknown; select?: string }> = [];
const mockRpc = vi.fn();
const fromCalls: Array<{ table: string; select?: string; eq?: [string, unknown] }> = [];
const mockInvokeEmails = vi.fn();
const mockGuard = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const rec: { table: string; select?: string; eq?: [string, unknown] } = { table };
      fromCalls.push(rec);
      const chain = {
        select: (s: string) => { rec.select = s; return chain; },
        eq: (c: string, v: unknown) => { rec.eq = [c, v]; return chain; },
        single: () => mockSingle(),
        maybeSingle: () => mockMaybeSingle(),
      };
      return chain;
    },
    rpc: (fn: string, args: unknown) => {
      const rec: { fn: string; args: unknown; select?: string } = { fn, args };
      rpcCalls.push(rec);
      return {
        select: (s: string) => { rec.select = s; return { maybeSingle: () => mockMaybeSingle() }; },
        then: (res: (v: unknown) => unknown) => res(mockRpc(fn, args)),
      };
    },
    auth: { getUser: vi.fn(), getSession: vi.fn() },
  },
}));
vi.mock('@/lib/event-emails', () => ({ invokeEventEmails: (...a: unknown[]) => mockInvokeEmails(...a) }));
vi.mock('@/lib/list-return-cache', () => ({ clearListReturnCache: vi.fn() }));
vi.mock('@/lib/session-guard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session-guard')>('@/lib/session-guard');
  return { ...actual, guardSeatWrite: (...a: unknown[]) => mockGuard(...a) };
});
vi.mock('@/app/prototypes/events/banner-utils', () => ({
  extractBannerKeywords: vi.fn().mockReturnValue(null),
  fetchUnsplashBanner: vi.fn().mockResolvedValue(null),
}));

beforeEach(() => {
  vi.clearAllMocks();
  rpcCalls.length = 0;
  fromCalls.length = 0;
  mockGuard.mockResolvedValue(true);
});

describe('hiddenSlugEnding (link generation)', () => {
  it('is at least 12 characters, URL-safe lowercase, and different every time', async () => {
    const { hiddenSlugEnding, HIDDEN_SLUG_ENDING_LENGTH } = await import('@/app/data/event-hidden-slug');
    expect(HIDDEN_SLUG_ENDING_LENGTH).toBeGreaterThanOrEqual(12);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const e = hiddenSlugEnding();
      expect(e).toMatch(/^[a-z2-7]{16}$/);
      seen.add(e);
    }
    expect(seen.size).toBe(200);
  });

  it('reads from the crypto source, never Math.random', async () => {
    const rnd = vi.spyOn(Math, 'random');
    const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const { hiddenSlugEnding } = await import('@/app/data/event-hidden-slug');
    hiddenSlugEnding();
    expect(getRandomValues).toHaveBeenCalled();
    expect(rnd).not.toHaveBeenCalled();
    rnd.mockRestore();
    getRandomValues.mockRestore();
  });
});

describe('generateSlug', () => {
  it('a hidden event gets the long ending, a public one keeps the short one', async () => {
    const { generateSlug } = await import('@/app/data/events-service-real');
    const pub = await generateSlug('Friends test run');
    const hid = await generateSlug('Friends test run', true);
    const tail = (s: string) => s.split(/\d{4}-\d{2}-\d{2}-/)[1];
    expect(tail(pub).length).toBeLessThanOrEqual(4);
    expect(tail(hid)).toMatch(/^[a-z2-7]{16}$/);
    expect(hid.startsWith('friends-test-run-')).toBe(true);
  });
});

describe('eventUpdateColumns', () => {
  it('maps isHidden to is_hidden, and leaves it out when the caller did not pass it', async () => {
    const { eventUpdateColumns } = await import('@/app/data/event-write-columns');
    expect(eventUpdateColumns({ isHidden: true })).toEqual({ is_hidden: true });
    expect(eventUpdateColumns({ isHidden: false })).toEqual({ is_hidden: false });
    expect(eventUpdateColumns({ title: 'x' })).toEqual({ title: 'x' });
    expect('is_hidden' in eventUpdateColumns({ title: 'x' })).toBe(false);
  });
});

describe('selectEventRowBySlug — the by-slug read and its fallback', () => {
  it('a row the table returns is used; the exact-slug function is not called', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'e1', slug: 's' }, error: null });
    const { selectEventRowBySlug } = await import('@/app/data/event-slug-and-group-reads');
    expect(await selectEventRowBySlug('s', false)).toEqual({ id: 'e1', slug: 's' });
    expect(rpcCalls).toHaveLength(0);
  });

  it('no row from the table (PGRST116) -> get_event_by_slug with the exact slug and the same host select', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockMaybeSingle.mockResolvedValue({ data: { id: 'h1', slug: 'secret-aaaa', is_hidden: true }, error: null });
    const { selectEventRowBySlug } = await import('@/app/data/event-slug-and-group-reads');
    const row = await selectEventRowBySlug('secret-aaaa', false);
    expect(row).toEqual({ id: 'h1', slug: 'secret-aaaa', is_hidden: true });
    expect(rpcCalls).toEqual([{ fn: 'get_event_by_slug', args: { p_slug: 'secret-aaaa' }, select: fromCalls[0].select }]);
    expect(fromCalls[0].select).toContain('host:profiles!events_host_id_fkey');
  });

  it('no row from the table and none from the function -> null', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { selectEventRowBySlug } = await import('@/app/data/event-slug-and-group-reads');
    expect(await selectEventRowBySlug('nope', true)).toBeNull();
  });

  it('a failed table read (not "no row") does not fall back, and throws when asked to', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: '500', message: 'boom' } });
    const { selectEventRowBySlug } = await import('@/app/data/event-slug-and-group-reads');
    await expect(selectEventRowBySlug('s', true)).rejects.toThrow(/boom/);
    expect(await selectEventRowBySlug('s', false)).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });

  it('a failed function call throws with throwOnError (not read as "not found") and is null otherwise', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116', message: 'no rows' } });
    mockMaybeSingle.mockResolvedValue({ data: null, error: { code: '500', message: 'rpc down' } });
    const { selectEventRowBySlug } = await import('@/app/data/event-slug-and-group-reads');
    await expect(selectEventRowBySlug('s', true)).rejects.toThrow(/rpc down/);
    expect(await selectEventRowBySlug('s', false)).toBeNull();
  });
});

describe('readRsvpGate', () => {
  it('a readable event is answered by id, with is_hidden', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'e1', max_attendees: 5, status: 'upcoming', is_hidden: false }, error: null });
    const { readRsvpGate } = await import('@/app/data/event-slug-and-group-reads');
    expect(await readRsvpGate('e1', 'slug')).toMatchObject({ is_hidden: false, max_attendees: 5 });
    expect(rpcCalls).toHaveLength(0);
  });

  it('unreadable by id: the slug answers, but only for the row whose id matches', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    mockMaybeSingle.mockResolvedValue({ data: { id: 'e1', max_attendees: null, status: 'upcoming', is_hidden: true }, error: null });
    const { readRsvpGate } = await import('@/app/data/event-slug-and-group-reads');
    expect(await readRsvpGate('e1', 'slug')).toMatchObject({ is_hidden: true });
    expect(await readRsvpGate('someone-elses-id', 'slug')).toBeNull();
  });

  it('unreadable by id and no slug -> null: an id alone is never enough', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });
    const { readRsvpGate } = await import('@/app/data/event-slug-and-group-reads');
    expect(await readRsvpGate('e1')).toBeNull();
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('rsvpToHiddenEvent — registering through the link', () => {
  it('without the slug it refuses and sends nothing', async () => {
    const { rsvpToHiddenEvent } = await import('@/app/data/event-hidden-rsvp');
    expect(await rsvpToHiddenEvent('e1', 'u1', undefined, true)).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it('ok -> true, and the confirmation email goes only when asked', async () => {
    mockRpc.mockReturnValue({ data: 'ok', error: null, status: 200 });
    const { rsvpToHiddenEvent } = await import('@/app/data/event-hidden-rsvp');
    expect(await rsvpToHiddenEvent('e1', 'u1', 'secret', true)).toBe(true);
    expect(rpcCalls[0]).toMatchObject({ fn: 'rsvp_to_event_by_slug', args: { p_slug: 'secret' } });
    expect(mockInvokeEmails).toHaveBeenCalledWith('rsvp', 'e1', 'u1');
    mockInvokeEmails.mockClear();
    expect(await rsvpToHiddenEvent('e1', 'u1', 'secret', false)).toBe(true);
    expect(mockInvokeEmails).not.toHaveBeenCalled();
  });

  it('already registered -> true with no second email; full, cancelled and not_found -> false', async () => {
    const { rsvpToHiddenEvent } = await import('@/app/data/event-hidden-rsvp');
    mockRpc.mockReturnValue({ data: 'already', error: null, status: 200 });
    expect(await rsvpToHiddenEvent('e1', 'u1', 's', true)).toBe(true);
    expect(mockInvokeEmails).not.toHaveBeenCalled();
    for (const refusal of ['full', 'cancelled', 'not_found']) {
      mockRpc.mockReturnValue({ data: refusal, error: null, status: 200 });
      expect(await rsvpToHiddenEvent('e1', 'u1', 's', true), refusal).toBe(false);
    }
  });

  it('an error from the server -> false; the anonymous-session denial -> SessionMismatchError', async () => {
    const { rsvpToHiddenEvent } = await import('@/app/data/event-hidden-rsvp');
    const { SessionMismatchError } = await import('@/lib/session-guard');
    mockRpc.mockReturnValue({ data: null, error: { code: '42501', message: 'removed' }, status: 403 });
    expect(await rsvpToHiddenEvent('e1', 'u1', 's', true)).toBe(false);
    mockRpc.mockReturnValue({ data: null, error: { code: '42501', message: 'denied' }, status: 401 });
    await expect(rsvpToHiddenEvent('e1', 'u1', 's', true)).rejects.toBeInstanceOf(SessionMismatchError);
  });

  it('a client that does not hold the user sends nothing', async () => {
    mockGuard.mockResolvedValue(false);
    const { rsvpToHiddenEvent } = await import('@/app/data/event-hidden-rsvp');
    expect(await rsvpToHiddenEvent('e1', 'u1', 's', true)).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe('realEventsService.rsvpToEvent routes a hidden event through the link', () => {
  it('a hidden gate -> rsvp_to_event_by_slug, never a direct event_rsvps insert', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'e1', max_attendees: 2, status: 'upcoming', is_hidden: true }, error: null });
    mockRpc.mockReturnValue({ data: 'ok', error: null, status: 200 });
    const { realEventsService } = await import('@/app/data/events-service-real');
    expect(await realEventsService.rsvpToEvent('e1', 'u1', 'the-link')).toBe(true);
    expect(rpcCalls.map(c => c.fn)).toEqual(['rsvp_to_event_by_slug']);
    expect(fromCalls.some(c => c.table === 'event_rsvps')).toBe(false);
  });
});

describe('rsvpToHiddenEvent — why a link holder was refused (P1603 review round)', () => {
  it('full and cancelled leave a reason the page reads once; other outcomes leave none', async () => {
    const { rsvpToHiddenEvent, takeHiddenRsvpRefusal } = await import('@/app/data/event-hidden-rsvp');
    for (const reason of ['full', 'cancelled'] as const) {
      mockRpc.mockReturnValue({ data: reason, error: null, status: 200 });
      expect(await rsvpToHiddenEvent('e1', 'u1', 's', true)).toBe(false);
      expect(takeHiddenRsvpRefusal()).toBe(reason);
      expect(takeHiddenRsvpRefusal(), 'read-and-clear').toBeNull();
    }
    mockRpc.mockReturnValue({ data: 'not_found', error: null, status: 200 });
    await rsvpToHiddenEvent('e1', 'u1', 's', true);
    expect(takeHiddenRsvpRefusal()).toBeNull();
    mockRpc.mockReturnValue({ data: 'full', error: null, status: 200 });
    await rsvpToHiddenEvent('e1', 'u1', 's', true);
    mockRpc.mockReturnValue({ data: 'ok', error: null, status: 200 });
    await rsvpToHiddenEvent('e1', 'u1', 's', true);
    expect(takeHiddenRsvpRefusal(), 'a later success clears an earlier refusal').toBeNull();
  });

  it('the sign-up auto-RSVP passes the link (slug) to rsvpToEvent, which reaches the door with it', async () => {
    const fs = await import('node:fs');
    const cb = fs.readFileSync('src/auth/AuthCallbackPage.tsx', 'utf8');
    expect(cb).toMatch(/rsvpToEvent\(event\.id, authUser\.id, eventSlug\)/);
    mockMaybeSingle.mockResolvedValue({ data: { id: 'h1', max_attendees: null, status: 'upcoming', is_hidden: true }, error: null });
    mockRpc.mockReturnValue({ data: 'ok', error: null, status: 200 });
    const { realEventsService } = await import('@/app/data/events-service-real');
    expect(await realEventsService.rsvpToEvent('h1', 'u1', 'secret-slug')).toBe(true);
    expect(rpcCalls.some(c => c.fn === 'rsvp_to_event_by_slug' && (c.args as { p_slug: string }).p_slug === 'secret-slug')).toBe(true);
  });
});
