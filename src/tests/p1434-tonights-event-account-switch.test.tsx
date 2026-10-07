/**
 * @file p1434-tonights-event-account-switch.test.tsx
 * @description P1434 (review of P1433): the header's event button must never show the PREVIOUS
 * account's registered event — not after sign-out, and not while a newly signed-in account's own
 * RSVP lookup is still pending. The stale value used to survive exactly one render (sign-out) or
 * the whole pending lookup (account switch), because `registered` was returned before checking
 * whose lookup it answered.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));

const inTwoHours = () => new Date(Date.now() + 2 * 3600 * 1000).toISOString();
let rsvpFor: Record<string, Promise<unknown>> = {};

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      let profileId: string | null = null;
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (col: string, val: string) => { if (col === 'profile_id') profileId = val; return b; };
      b.gte = () => b;
      b.lte = () => (table === 'event_rsvps' && profileId
        ? rsvpFor[profileId] ?? Promise.resolve({ data: [], error: null })
        : Promise.resolve({ data: [], error: null }));
      return b;
    },
  },
}));

import { useTonightsEvent, __resetTonightsEventCacheForTest } from '@/app/hooks/useTonightsEvent';

const eventRow = (slug: string) => ({
  data: [{ event: { slug, title: slug, datetime: inTwoHours(), timezone: 'UTC', status: 'scheduled', duration_minutes: 120, preparation_enabled: false } }],
  error: null,
});

describe('P1434: no previous account\'s event in the header', () => {
  beforeEach(() => {
    __resetTonightsEventCacheForTest();
    rsvpFor = { 'user-a': Promise.resolve(eventRow('a-night')) };
  });

  it('after sign-out, the first render already drops the signed-out person\'s event', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-a' }, session: null });
    const { result, rerender } = renderHook(() => useTonightsEvent());
    await waitFor(() => expect(result.current?.slug).toBe('a-night'));

    mockUseAuth.mockReturnValue({ user: null, session: null });
    rerender();
    expect(result.current).toBeNull();
  });

  it('switching to another account shows nothing of the first while the second is looked up', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-a' }, session: null });
    const { result, rerender } = renderHook(() => useTonightsEvent());
    await waitFor(() => expect(result.current?.slug).toBe('a-night'));

    let resolveB!: (v: unknown) => void;
    rsvpFor['user-b'] = new Promise(r => { resolveB = r; });
    mockUseAuth.mockReturnValue({ user: { id: 'user-b' }, session: null });
    rerender();
    expect(result.current).toBeNull();

    resolveB(eventRow('b-night'));
    await waitFor(() => expect(result.current?.slug).toBe('b-night'));
  });
});
