/**
 * @file p1229-pledgers-bounded-in.test.ts
 * @description P1229 D1/D2 — /pledgers must never issue a PostgREST `in()` list over
 * MAX_IN_LIST, and must fetch one bounded page (not the whole set).
 *
 * Before the fix, getVerifiedProfiles() pulled every verified profile (~5.2k in prod)
 * and asked `witnesses?profile_id=in.(<all ids>)`; the gateway refused the URL
 * (net::ERR_HTTP2_PROTOCOL_ERROR) and the failure was swallowed as "non-fatal".
 *
 * CONTRACT:
 *   - boundedInList(ids) returns ids when length <= MAX_IN_LIST, throws otherwise.
 *   - getVerifiedProfilesPage(offset) calls the `get_pledgers_page` RPC with a
 *     p_limit <= MAX_IN_LIST, never touches `witnesses`, and returns the server total.
 *   - getFeaturedProfiles()' witness `in()` stays bounded even when the RPC hands back
 *     far more rows than MAX_FEATURED_PROFILES.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const inCalls: unknown[][] = [];
const from = vi.fn(() => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.not = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn((_col: string, ids: unknown[]) => { inCalls.push(ids); return chain; });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return chain;
});

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) } }));
vi.mock('@sentry/react', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { MAX_IN_LIST, boundedInList } from '@/app/data/query-limits';
import { getVerifiedProfilesPage, getFeaturedProfiles, PLEDGERS_PAGE_SIZE, MAX_FEATURED_PROFILES } from '@/app/data/api';

const row = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  slug: `pledger-${i}`,
  name: `Pledger ${i}`,
  role: 'Tester',
  linkedin_url: null,
  reason: i % 2 ? 'because' : '',
  created_at: '2026-01-01T00:00:00Z',
  is_verified: true,
  avatar_color: '#0044CC',
  avatar_url: null,
  avatar_provider: null,
});

beforeEach(() => { rpc.mockReset(); from.mockClear(); inCalls.length = 0; });

describe('boundedInList', () => {
  it('passes lists at the cap through unchanged', () => {
    const ids = Array.from({ length: MAX_IN_LIST }, (_, i) => i);
    expect(boundedInList(ids, 't')).toBe(ids);
  });
  it('throws on a list over the cap, naming the query', () => {
    const ids = Array.from({ length: MAX_IN_LIST + 1 }, (_, i) => i);
    expect(() => boundedInList(ids, 'pledgers.witnesses')).toThrow(/pledgers\.witnesses.*max 100/);
  });
});

describe('getVerifiedProfilesPage (P1229)', () => {
  it('fetches one bounded page and never builds an in() list', async () => {
    rpc.mockResolvedValue({ data: { total: 5232, profiles: Array.from({ length: PLEDGERS_PAGE_SIZE }, (_, i) => row(i)) }, error: null });
    const page = await getVerifiedProfilesPage(60);
    expect(rpc).toHaveBeenCalledWith('get_pledgers_page', { p_limit: PLEDGERS_PAGE_SIZE, p_offset: 60 });
    expect(PLEDGERS_PAGE_SIZE).toBeLessThanOrEqual(MAX_IN_LIST);
    expect(from).not.toHaveBeenCalled();
    expect(inCalls).toEqual([]);
    expect(page.total).toBe(5232);
    expect(page.profiles).toHaveLength(PLEDGERS_PAGE_SIZE);
    expect(page.profiles[0].slug).toBe('pledger-0');
  });
  it('returns an empty page with total 0 on RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getVerifiedProfilesPage(0)).toEqual({ profiles: [], total: 0 });
  });
});

describe('getFeaturedProfiles witness in() stays bounded', () => {
  it('caps the in() list at MAX_FEATURED_PROFILES even when the RPC returns 500 rows', async () => {
    rpc.mockResolvedValue({ data: Array.from({ length: 500 }, (_, i) => row(i)), error: null });
    await getFeaturedProfiles();
    expect(inCalls.length).toBeGreaterThan(0);
    for (const ids of inCalls) expect(ids.length).toBeLessThanOrEqual(MAX_FEATURED_PROFILES);
  });
});
