/**
 * @file p1675-r19-reads.test.tsx
 * @description P1675 R19 review fixes: getMyHikeWhen shares one in-flight read per (event, viewer) and never reuses a rejection;
 * the calendar hook keeps a hike's failed read at undefined (the link stays hidden), a mastermind's at null; an optional hike reads nothing.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ single: vi.fn(), role: vi.fn() }));
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = () => h.single();
  return { supabase: { from: () => chain } };
});
vi.mock('@/app/data/my-registration-answers', () => ({ getMyRegistrationRole: (...a: unknown[]) => h.role(...a) }));

import { getMyHikeWhen } from '@/app/data/my-hike-when';
import { ARRIVAL_RETRY_MS, useMyRegistrationArrival } from '@/app/prototypes/events/use-my-arrival';

const HIKE = { id: 'h1', flow: 'social-hike', seriesSlug: 'social-hike' };

describe('getMyHikeWhen in-flight dedupe', () => {
  beforeEach(() => { h.single.mockReset(); });

  it('two concurrent calls make one request and share the answer', async () => {
    h.single.mockResolvedValue({ data: { when_choice: 'event' }, error: null });
    const [a, b] = await Promise.all([getMyHikeWhen('e1', 'u1'), getMyHikeWhen('e1', 'u1')]);
    expect(h.single).toHaveBeenCalledTimes(1);
    expect([a, b]).toEqual(['event', 'event']);
    await getMyHikeWhen('e1', 'u1'); // settled: a later call reads afresh
    expect(h.single).toHaveBeenCalledTimes(2);
  });

  it('a different event or viewer is its own read', async () => {
    h.single.mockResolvedValue({ data: null, error: null });
    await Promise.all([getMyHikeWhen('e1', 'u1'), getMyHikeWhen('e2', 'u1'), getMyHikeWhen('e1', 'u2')]);
    expect(h.single).toHaveBeenCalledTimes(3);
  });

  it('a rejected read is not reused: the next call reads again', async () => {
    h.single.mockResolvedValueOnce({ data: null, error: { message: 'net', code: 'x' } });
    const [r1, r2] = await Promise.allSettled([getMyHikeWhen('e1', 'u1'), getMyHikeWhen('e1', 'u1')]);
    expect(r1.status).toBe('rejected');
    expect(r2.status).toBe('rejected');
    expect(h.single).toHaveBeenCalledTimes(1);
    h.single.mockResolvedValueOnce({ data: { when_choice: 'now' }, error: null });
    await expect(getMyHikeWhen('e1', 'u1')).resolves.toBe('now');
    expect(h.single).toHaveBeenCalledTimes(2);
  });
});

describe('useMyRegistrationArrival: a failed read', () => {
  beforeEach(() => { vi.useFakeTimers(); h.single.mockReset(); h.role.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });
  const settle = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(ARRIVAL_RETRY_MS * 1.25 + 10); }); };

  it('Codex final review: while the session is restored (no viewer yet) a hike is undefined; once settled signed out it is null; a mastermind is null either way', async () => {
    expect(renderHook(() => useMyRegistrationArrival(HIKE, null, true, true)).result.current).toBeUndefined();
    expect(renderHook(() => useMyRegistrationArrival(HIKE, null, true, false)).result.current).toBeNull();
    const MASTERMIND = { id: 'm1', flow: 'mastermind', seriesSlug: 'mastermind' };
    expect(renderHook(() => useMyRegistrationArrival(MASTERMIND, null, true, true)).result.current).toBeNull();
    expect(h.single).not.toHaveBeenCalled();
  });

  it('a hike stays undefined (the calendar link stays hidden)', async () => {
    h.single.mockResolvedValue({ data: null, error: { message: 'net', code: 'x' } });
    const { result } = renderHook(() => useMyRegistrationArrival(HIKE, 'u1'));
    await settle();
    expect(h.single).toHaveBeenCalledTimes(2);
    expect(result.current).toBeUndefined();
  });

  it('a mastermind counts a failed read as null (unchanged)', async () => {
    h.role.mockRejectedValue(new Error('net'));
    const { result } = renderHook(() => useMyRegistrationArrival({ id: 'm1', flow: 'sales-mastermind' }, 'u1'));
    await settle();
    expect(result.current).toBeNull();
  });

  it('a registered viewer on a hike now switched to the optional preset, with a stored event answer, still arrives at the doors', async () => {
    h.single.mockResolvedValue({ data: { when_choice: 'event' }, error: null });
    const { result } = renderHook(() => useMyRegistrationArrival({ ...HIKE, hikeRegistration: 'optional' }, 'u1'));
    await settle();
    expect(result.current).toEqual({ owner: true, atDoors: true });
  });

  it('a disabled read (EventDetail for an unregistered viewer) reads nothing and is null', async () => {
    const { result } = renderHook(() => useMyRegistrationArrival(HIKE, 'u1', false));
    await settle();
    expect(h.single).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it('a registered hiker with an event answer arrives at the doors', async () => {
    h.single.mockResolvedValue({ data: { when_choice: 'event' }, error: null });
    const { result } = renderHook(() => useMyRegistrationArrival(HIKE, 'u1'));
    await settle();
    expect(result.current).toEqual({ owner: true, atDoors: true });
  });
});
