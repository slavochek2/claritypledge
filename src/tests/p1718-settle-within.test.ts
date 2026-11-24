/**
 * P1718 review round 4: settleWithin is the budget behind the Ready save, its re-read and the rounds read. Its own
 * contract, tested directly: the work wins before `ms`, a SettleTimeout after, the timer cleared either way, and the
 * work itself never cancelled.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { settleWithin, SettleTimeout } from '@/app/prototypes/events/components/settle-within';

afterEach(() => vi.useRealTimers());

describe('settleWithin', () => {
  it('resolves with the work when it settles first, and leaves no timer behind', async () => {
    vi.useFakeTimers();
    await expect(settleWithin(Promise.resolve('done'), 1000)).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects with the work's own error when it fails first", async () => {
    vi.useFakeTimers();
    await expect(settleWithin(Promise.reject(new Error('offline')), 1000)).rejects.toThrow('offline');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with SettleTimeout once ms pass, and the work still settles afterwards', async () => {
    vi.useFakeTimers();
    let finish: (v: string) => void = () => {};
    const work = new Promise<string>((r) => { finish = r; });
    const raced = settleWithin(work, 1000);
    const caught = raced.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    const err = await caught;
    expect(err).toBeInstanceOf(SettleTimeout);
    expect((err as Error).name).toBe('SettleTimeout');
    expect(vi.getTimerCount()).toBe(0);
    finish('late');
    await expect(work).resolves.toBe('late');
  });

  it('a late rejection of the work after the timeout is not left unhandled', async () => {
    vi.useFakeTimers();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    let fail: (e: Error) => void = () => {};
    const work = new Promise<string>((_, j) => { fail = j; });
    const caught = settleWithin(work, 1000).catch(() => 'timed out');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(caught).resolves.toBe('timed out');
    fail(new Error('late failure'));
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
