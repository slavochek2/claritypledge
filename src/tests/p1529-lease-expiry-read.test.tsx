/** P1529: a refused run gets bounded reads at/after its lease's end, only while visible, at most MAX_READS per run id. */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEASE_MARGIN_MS, MAX_READS, RETRY_MS, RETRY_JITTER_MS, useLeaseExpiryRead } from '@/app/pages/chat/use-lease-expiry-read';

const load = vi.fn(async () => undefined);
let n = 0;
const fresh = () => `lease-${++n}`; // the read count is module-level: each test uses its own run id
let ID = '';
beforeEach(() => { vi.useFakeTimers(); ID = fresh(); });
afterEach(() => { vi.useRealTimers(); load.mockReset(); load.mockResolvedValue(undefined); });
type P = { id: string | null; remaining: number | null; visible: boolean };
const mount = (p: P) => renderHook((q: P) => useLeaseExpiryRead(q.id, q.remaining, q.visible, load), { initialProps: p });
const STEP = RETRY_MS + RETRY_JITTER_MS + 1;

describe('useLeaseExpiryRead', () => {
  it('visible, past the lease: the first read comes after the margin, not before', async () => {
    mount({ id: ID, remaining: -5_000, visible: true });
    await vi.advanceTimersByTimeAsync(LEASE_MARGIN_MS - 1_000);
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('clock skew: the first read finds the run still queued, the second (30 s on) settles it and stops the chain', async () => {
    const view = mount({ id: ID, remaining: 0, visible: true });
    await vi.advanceTimersByTimeAsync(LEASE_MARGIN_MS + 100);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(STEP);
    expect(load).toHaveBeenCalledTimes(2);
    view.rerender({ id: null, remaining: null, visible: true }); // the run left queued
    await vi.advanceTimersByTimeAsync(5 * STEP);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('a failed read is retried', async () => {
    load.mockRejectedValueOnce(new Error('rpc failed'));
    mount({ id: ID, remaining: 0, visible: true });
    await vi.advanceTimersByTimeAsync(LEASE_MARGIN_MS + 100);
    await vi.advanceTimersByTimeAsync(STEP);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('never more than MAX_READS per run id, even when the hook is really unmounted and mounted again', async () => {
    const view = mount({ id: ID, remaining: 0, visible: true });
    await vi.advanceTimersByTimeAsync(LEASE_MARGIN_MS + 100 + 6 * STEP);
    expect(load).toHaveBeenCalledTimes(MAX_READS);
    view.unmount();
    mount({ id: ID, remaining: 0, visible: true });
    await vi.advanceTimersByTimeAsync(LEASE_MARGIN_MS + 10 * STEP);
    expect(load).toHaveBeenCalledTimes(MAX_READS);
  });
  it('hidden pauses; visible resumes', async () => {
    const view = mount({ id: ID, remaining: -5_000, visible: false });
    await vi.advanceTimersByTimeAsync(5 * STEP);
    expect(load).not.toHaveBeenCalled();
    view.rerender({ id: ID, remaining: -5_000, visible: true });
    await vi.advanceTimersByTimeAsync(LEASE_MARGIN_MS + 100);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('no refused run: nothing', async () => {
    mount({ id: null, remaining: null, visible: true });
    await vi.advanceTimersByTimeAsync(10 * STEP);
    expect(load).not.toHaveBeenCalled();
  });
});
