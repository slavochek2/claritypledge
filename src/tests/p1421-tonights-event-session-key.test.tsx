/**
 * @file p1421-tonights-event-session-key.test.tsx
 * @description P1421 review: the header's event-day button is looked up by the SESSION user id,
 * which exists before the profile loads, so it is not inserted into the nav row on profile arrival.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseAuth = vi.fn();
vi.mock('@/auth', () => ({ useAuth: () => mockUseAuth() }));

const eqSpy = vi.fn();
vi.mock('@/lib/supabase', () => {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (col: string, val: string) => { eqSpy(col, val); return builder; };
  builder.gte = () => builder;
  builder.lte = () => Promise.resolve({ data: [], error: null });
  return { supabase: { from: () => builder } };
});

import { useTonightsEvent, __resetTonightsEventCacheForTest } from '@/app/hooks/useTonightsEvent';

describe('P1421: useTonightsEvent keys on the session user id', () => {
  beforeEach(() => {
    eqSpy.mockClear();
    __resetTonightsEventCacheForTest();
  });

  it('queries with the session user id while the profile is still loading', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: { user: { id: 'sess-1' } } });
    renderHook(() => useTonightsEvent());
    await waitFor(() => expect(eqSpy).toHaveBeenCalledWith('profile_id', 'sess-1'));
  });

  it('no session and no profile: no RSVP query (P1433: only the public in-window one)', async () => {
    mockUseAuth.mockReturnValue({ user: null, session: null });
    renderHook(() => useTonightsEvent());
    await new Promise((r) => setTimeout(r, 20));
    expect(eqSpy).not.toHaveBeenCalledWith('profile_id', expect.anything());
    expect(eqSpy).toHaveBeenCalledWith('preparation_enabled', true);
  });
});
