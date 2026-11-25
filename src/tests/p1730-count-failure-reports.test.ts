/**
 * P1730: the room re-reads its counts every 30 s, so a failing get_event_room_counts must be reported once per event
 * per page load, not once per read (metered-services rule 5: a persistent failure would otherwise send a Sentry event
 * every 30 s for every open room).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
// Mirrors the real logger's contract: true when it reported, false for a suppressed transient (blip, expired token).
const logDbError = vi.fn((_ctx: string, error: { code?: string; message: string }) => !(error.code === 'PGRST303' || error.message === 'Failed to fetch'));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('@/app/data/db-error-logger', () => ({ logDbError: (...a: unknown[]) => logDbError(...a) }));

describe('getEventRoomCounts failure reports', () => {
  beforeEach(() => {
    vi.resetModules();
    rpc.mockReset();
    logDbError.mockReset();
  });

  it('reports a repeated failure for the same event once, and still returns null each time', async () => {
    const { getEventRoomCounts } = await import('@/app/data/event-room-counts');
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } });
    expect(await getEventRoomCounts('ev-1')).toBeNull();
    expect(await getEventRoomCounts('ev-1')).toBeNull();
    expect(await getEventRoomCounts('ev-1')).toBeNull();
    expect(logDbError).toHaveBeenCalledTimes(1);
  });

  it('reports a failure for each different event', async () => {
    const { getEventRoomCounts } = await import('@/app/data/event-room-counts');
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied', code: '42501' } });
    await getEventRoomCounts('ev-1');
    await getEventRoomCounts('ev-2');
    expect(logDbError).toHaveBeenCalledTimes(2);
  });

  it('a suppressed transient does not use up the report of a later real failure, even with the same code', async () => {
    const { getEventRoomCounts } = await import('@/app/data/event-room-counts');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch', code: '' } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'JWT expired', code: 'PGRST303' } });
    rpc.mockResolvedValue({ data: null, error: { message: 'Bad Gateway', code: '' } });
    await getEventRoomCounts('ev-1');
    await getEventRoomCounts('ev-1');
    await getEventRoomCounts('ev-1');
    await getEventRoomCounts('ev-1');
    const reported = logDbError.mock.results.filter((r) => r.value === true).length;
    expect(reported).toBe(1); // the 502, once
    expect(logDbError).toHaveBeenCalledTimes(3); // blip, expired token, then the 502; the fourth read is not reported again
  });

  it('two different real failures for one event on one page load are reported once in all', async () => {
    const { getEventRoomCounts } = await import('@/app/data/event-room-counts');
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied', code: '42501' } });
    rpc.mockResolvedValue({ data: null, error: { message: 'schema cache', code: 'PGRST202' } });
    await getEventRoomCounts('ev-1');
    await getEventRoomCounts('ev-1');
    expect(logDbError).toHaveBeenCalledTimes(1);
  });

  it('a successful read still returns the counts', async () => {
    const { getEventRoomCounts } = await import('@/app/data/event-room-counts');
    rpc.mockResolvedValue({ data: { not_here: 2 }, error: null });
    expect(await getEventRoomCounts('ev-1')).toEqual({ notHere: 2 });
    expect(logDbError).not.toHaveBeenCalled();
  });
});
