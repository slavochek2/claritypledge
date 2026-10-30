// @vitest-environment jsdom
/**
 * Codex review (metered rules 3 and 4): the room's re-read after a failed write.
 *  - reconcile-retry.ts: the first read at once, then waits of 2s, 4s, 8s, 16s, 30s… each ±20%, a budget of 9 reads,
 *    nothing from a hidden tab, nothing after an abort.
 *  - use-room-write.ts (the caller EventRoomMeet uses): the FIRST re-read waits for a visible tab too; an unmount while
 *    the write is out makes 0 refreshes after it; a refresh that throws (even synchronously) never leaves a latch held; a spent budget keeps the controls locked and offers "Try again",
 *    which runs one more budgeted loop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { RECONCILE_READS, reconcileDelay, retryUntilRead } from '@/app/prototypes/events/components/reconcile-retry';
import { useRoomWrite } from '@/app/prototypes/events/components/use-room-write';
import type { EventRoomSelf } from '@/app/types';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}
const show = () => { setVisibility('visible'); document.dispatchEvent(new Event('visibilitychange')); };
const mid = () => 0.5; // no jitter
const MAX_WAIT = (2 + 4 + 8 + 16 + 30 * 4) * 1000 * 1.2; // every wait of one loop at +20%

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); setVisibility('visible'); });

describe('retryUntilRead', () => {
  it('base waits 2s, 4s, 8s, 16s, then 30s; the budget is the first read + 8 retries', () => {
    expect([1, 2, 3, 4, 5, 6, 8].map(reconcileDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    expect(RECONCILE_READS).toBe(9);
  });

  it('the first read goes at once; a success ends it', async () => {
    const read = vi.fn().mockResolvedValue(true);
    await expect(retryUntilRead(read, new AbortController().signal, () => {}, mid)).resolves.toBe('read');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('jitter: each wait is the base ±20%', async () => {
    const read = vi.fn().mockResolvedValue(false);
    void retryUntilRead(read, new AbortController().signal, () => {}, () => 0); // −20%: 1.6s
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1599);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    const late = vi.fn().mockResolvedValue(false);
    void retryUntilRead(late, new AbortController().signal, () => {}, () => 1); // +20%: 2.4s
    await vi.advanceTimersByTimeAsync(2399);
    expect(late).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(late).toHaveBeenCalledTimes(2);
  });

  it('budget spent: exactly 9 reads, then "exhausted" and no more reads, ever', async () => {
    const read = vi.fn().mockResolvedValue(false);
    const done = retryUntilRead(read, new AbortController().signal, () => {}, Math.random);
    await vi.advanceTimersByTimeAsync(MAX_WAIT);
    await expect(done).resolves.toBe('exhausted');
    expect(read).toHaveBeenCalledTimes(9);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(read).toHaveBeenCalledTimes(9);
  });

  it('a hidden tab sends nothing (not even the first read); shown, it goes out', async () => {
    const read = vi.fn().mockResolvedValue(true);
    setVisibility('hidden');
    const done = retryUntilRead(read, new AbortController().signal, () => {}, mid);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).not.toHaveBeenCalled();
    show();
    await expect(done).resolves.toBe('read');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('abort ends it: "aborted", no read after, no onWaiting after', async () => {
    const read = vi.fn().mockResolvedValue(false);
    const onWaiting = vi.fn();
    const stop = new AbortController();
    const done = retryUntilRead(read, stop.signal, onWaiting, mid);
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    stop.abort();
    await expect(done).resolves.toBe('aborted');
    const waits = onWaiting.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onWaiting).toHaveBeenCalledTimes(waits);
  });
});

describe('useRoomWrite (the room caller)', () => {
  const failingWrite = () => Promise.reject(new Error('down'));
  const setup = (refresh: () => Promise<boolean>) => {
    const runSelfWrite = vi.fn((write: () => Promise<EventRoomSelf>) => write());
    return renderHook(() => useRoomWrite(runSelfWrite, refresh));
  };

  it('a write that fails while the tab is hidden: 0 re-reads until the tab is visible, then one', async () => {
    const refresh = vi.fn().mockResolvedValue(true);
    const { result } = setup(refresh);
    setVisibility('hidden');
    await act(async () => { void result.current.runWrite(failingWrite as never); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10 * 60_000); });
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(true); // still locked
    await act(async () => { show(); await vi.advanceTimersByTimeAsync(0); });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.submitting).toBe(false);
    expect(result.current.reconciled).toBe(true);
  });

  it('unmounted while the write is out: 0 refreshes after the unmount', async () => {
    const refresh = vi.fn().mockResolvedValue(false);
    let fail!: (e: Error) => void;
    const pending = () => new Promise<EventRoomSelf>((_, rej) => { fail = rej; });
    const { result, unmount } = setup(refresh);
    await act(async () => { void result.current.runWrite(pending); });
    unmount();
    await act(async () => { fail(new Error('down')); await vi.advanceTimersByTimeAsync(10 * 60_000); });
    // Only the request count is observable here (React 19 does not warn on a set after unmount), so that is the claim.
    expect(refresh).not.toHaveBeenCalled();
  });

  it('budget spent: still locked and stuck; "Try again" runs one more budgeted loop', async () => {
    const refresh = vi.fn().mockResolvedValue(false);
    const { result } = setup(refresh);
    await act(async () => { void result.current.runWrite(failingWrite as never); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MAX_WAIT); });
    expect(refresh).toHaveBeenCalledTimes(9);
    expect(result.current.stuck).toBe(true);
    expect(result.current.submitting).toBe(true); // the controls stay locked
    expect(result.current.reconciled).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000); });
    expect(refresh).toHaveBeenCalledTimes(9); // nothing more on its own
    refresh.mockResolvedValue(true);
    await act(async () => { result.current.retryReconcile(); await vi.advanceTimersByTimeAsync(0); });
    expect(refresh).toHaveBeenCalledTimes(10);
    expect(result.current.stuck).toBe(false);
    expect(result.current.submitting).toBe(false);
    expect(result.current.reconciled).toBe(true);
  });

  it('two "Try again" taps in the same frame start ONE loop: at most 9 reads', async () => {
    const refresh = vi.fn().mockResolvedValue(false);
    const { result } = setup(refresh);
    await act(async () => { void result.current.runWrite(failingWrite as never); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MAX_WAIT); });
    expect(result.current.stuck).toBe(true);
    refresh.mockClear();
    act(() => { result.current.retryReconcile(); result.current.retryReconcile(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MAX_WAIT); });
    expect(refresh.mock.calls.length).toBeLessThanOrEqual(9);
    expect(refresh).toHaveBeenCalledTimes(9); // exactly one budgeted loop, not two
    expect(result.current.stuck).toBe(true);
  });

  it('the re-read gets the loop\'s signal (so a refresh can gate its own second request)', async () => {
    const refresh = vi.fn().mockResolvedValue(true);
    const { result } = setup(refresh);
    await act(async () => { void result.current.runWrite(failingWrite as never); await vi.advanceTimersByTimeAsync(0); });
    expect(refresh.mock.calls[0]![0]).toBeInstanceOf(AbortSignal);
  });

  it('a refresh that throws synchronously: counted as a failed read, and both latches are released', async () => {
    let throwing = true;
    const refresh = vi.fn((): Promise<boolean> => { if (throwing) throw new Error('boom'); return Promise.resolve(true); });
    const { result } = setup(refresh);
    await act(async () => { void result.current.runWrite(failingWrite as never); });
    await act(async () => { await vi.advanceTimersByTimeAsync(MAX_WAIT); });
    expect(refresh).toHaveBeenCalledTimes(9); // every throw was a failed read; the loop ran its budget
    expect(result.current.stuck).toBe(true); // locked, with the way forward
    throwing = false;
    await act(async () => { result.current.retryReconcile(); await vi.advanceTimersByTimeAsync(0); });
    // `reconciling` was released (Try again started a loop) and `inFlight` too (a new write goes through).
    expect(refresh).toHaveBeenCalledTimes(10);
    expect(result.current.submitting).toBe(false);
    const write = vi.fn().mockResolvedValue({ id: 'm1' });
    await act(async () => { await result.current.runWrite(write); });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('a write path that throws unexpectedly still releases the write latch', async () => {
    const runSelfWrite = vi.fn(() => { throw new TypeError('not a promise'); });
    const { result } = renderHook(() => useRoomWrite(runSelfWrite as never, vi.fn().mockResolvedValue(true)));
    await act(async () => { await result.current.runWrite(vi.fn() as never); });
    expect(result.current.submitting).toBe(false);
    await act(async () => { await result.current.runWrite(vi.fn() as never); });
    expect(runSelfWrite).toHaveBeenCalledTimes(2); // the latch was free for the second write
  });
});

