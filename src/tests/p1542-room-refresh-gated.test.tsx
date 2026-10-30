// @vitest-environment jsdom
/**
 * Codex review (metered rule 3): the room's refresh can make TWO requests — the status read, then, with no row, a
 * join. Given a signal (the re-read loop after a failed write passes one), the join waits for a visible tab and is
 * dropped once the caller gave up. Without a signal (the page's own reads) it behaves as before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const svc = vi.hoisted(() => ({
  status: vi.fn(),
  join: vi.fn(),
}));
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { id: 'u1', name: 'Ana' }, session: { user: { id: 'u1' } } }) }));
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
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const show = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };

beforeEach(() => {
  svc.status.mockReset().mockResolvedValue(row);
  svc.join.mockReset().mockResolvedValue(row);
});
afterEach(() => setVisibility('visible'));

async function mounted() {
  const hook = renderHook(() => useEventRoomSelf(event, true));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  svc.status.mockClear();
  svc.join.mockClear();
  return hook;
}

describe('refresh(signal): the join after the status read is gated', () => {
  it('hidden after the status call: no join until the tab is visible', async () => {
    const { result } = await mounted();
    let answer!: (v: unknown) => void;
    svc.status.mockImplementationOnce(() => new Promise((r) => { answer = r; })); // no row: a join would follow
    const signal = new AbortController().signal;
    let done!: Promise<boolean>;
    act(() => { done = result.current.refresh(signal); });
    setVisibility('hidden');
    await act(async () => { answer(null); await Promise.resolve(); await Promise.resolve(); });
    expect(svc.status).toHaveBeenCalledTimes(1);
    expect(svc.join).not.toHaveBeenCalled();
    await act(async () => { show(); await done; });
    expect(svc.join).toHaveBeenCalledTimes(1);
    await expect(done).resolves.toBe(true);
  });

  it('aborted between the status read and the join: no join, ever', async () => {
    const { result } = await mounted();
    let answer!: (v: unknown) => void;
    svc.status.mockImplementationOnce(() => new Promise((r) => { answer = r; }));
    const stop = new AbortController();
    let done!: Promise<boolean>;
    act(() => { done = result.current.refresh(stop.signal); });
    setVisibility('hidden');
    await act(async () => { answer(null); await Promise.resolve(); });
    stop.abort();
    await act(async () => { await expect(done).resolves.toBe(false); });
    show();
    expect(svc.join).not.toHaveBeenCalled();
  });

  it('control: without a signal (the page\'s own reads) the join goes as before', async () => {
    const { result } = await mounted();
    svc.status.mockResolvedValueOnce(null);
    await act(async () => { await expect(result.current.refresh()).resolves.toBe(true); });
    expect(svc.join).toHaveBeenCalledTimes(1);
  });
});
