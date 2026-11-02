// @vitest-environment jsdom
/**
 * P1596 review: the join after a status read needs the person's profile name (a stored "Guest" would title their
 * threads). That name read is a third request: it must not outlive the caller that gave up (abort), and it must not
 * hang the refresh for ever (deadline). A name that never arrives joins nobody; the next refresh tries again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({ status: vi.fn(), join: vi.fn(), name: vi.fn() }));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } } }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => svc.name() }) }) }) },
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: {} }));
vi.mock('@/app/data/event-room-service', () => ({
  getMyRoomStatus: (...a: unknown[]) => svc.status(...a),
  joinEventRoom: (...a: unknown[]) => svc.join(...a),
}));
vi.mock('@/lib/offline-read-cache', () => ({
  readThrough: async (_k: string, _id: string, fn: () => Promise<unknown>) => ({ source: 'network', data: await fn() }),
  rememberOffline: vi.fn(),
}));
vi.mock('@/app/contexts/offline-status-context', () => ({
  useConnectivity: () => ({ offline: false, reconnectTick: 0 }),
  useOfflinePageReport: () => {},
}));

import { useEventRoomSelf } from '@/app/prototypes/events/components/EventRoomAccess';

const event = { id: 'ev-1', slug: 'walk' } as never;
const row = { id: 'm1', eventId: 'ev-1', optedIn: null, comprehensionRating: null } as never;

beforeEach(() => {
  svc.status.mockReset().mockResolvedValue(row);
  svc.join.mockReset().mockResolvedValue(row);
  svc.name.mockReset().mockResolvedValue({ data: { name: 'Ana' } });
});
afterEach(() => vi.useRealTimers());

async function mounted() {
  const hook = renderHook(() => useEventRoomSelf(event, true));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  svc.status.mockClear();
  svc.join.mockClear();
  return hook;
}

describe('the profile-name read before a join', () => {
  it('aborted while the name is being read: no join', async () => {
    const { result } = await mounted();
    let name!: (v: unknown) => void;
    svc.name.mockImplementationOnce(() => new Promise((r) => { name = r; }));
    svc.status.mockResolvedValueOnce(null);
    const stop = new AbortController();
    let done!: Promise<boolean>;
    act(() => { done = result.current.refresh(stop.signal); });
    await waitFor(() => expect(svc.name).toHaveBeenCalled());
    stop.abort();
    await act(async () => { name({ data: { name: 'Ana' } }); await expect(done).resolves.toBe(false); });
    expect(svc.join).not.toHaveBeenCalled();
  });

  it('a name read that never answers ends the refresh at the deadline, without a join as Guest', async () => {
    const { result } = await mounted();
    vi.useFakeTimers();
    svc.name.mockImplementationOnce(() => new Promise(() => undefined));
    svc.status.mockResolvedValueOnce(null);
    let done!: Promise<boolean>;
    act(() => { done = result.current.refresh(new AbortController().signal); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    await expect(done).resolves.toBe(false);
    expect(svc.join).not.toHaveBeenCalled();
  });

  it('a name read that FAILED, or found no profile yet, joins nobody as Guest (a name may still come); the next refresh joins under it', async () => {
    const { result } = await mounted();
    for (const failed of [{ data: null, error: { message: 'boom' } }, { data: null, error: null }]) {
      svc.name.mockResolvedValueOnce(failed);
      svc.status.mockResolvedValueOnce(null);
      await act(async () => { await expect(result.current.refresh(new AbortController().signal)).resolves.toBe(false); });
      expect(svc.join).not.toHaveBeenCalled();
    }
    svc.status.mockResolvedValueOnce(null);
    await act(async () => { await expect(result.current.refresh(new AbortController().signal)).resolves.toBe(true); });
    expect(svc.join).toHaveBeenCalledWith('ev-1', 'Ana');
  });

  it('an answered name joins under it', async () => {
    const { result } = await mounted();
    svc.status.mockResolvedValueOnce(null);
    await act(async () => { await result.current.refresh(new AbortController().signal); });
    expect(svc.join).toHaveBeenCalledWith('ev-1', 'Ana');
  });
});
