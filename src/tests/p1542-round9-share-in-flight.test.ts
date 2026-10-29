/** P1542 round 9 (speed): concurrent identical reads share one request; a read after it settles goes out again. */
import { describe, expect, it, vi } from 'vitest';
import { shareInFlight } from '@/lib/share-in-flight';

describe('shareInFlight', () => {
  it('two concurrent calls with one key send ONE request and both get its answer', async () => {
    const req = vi.fn(() => Promise.resolve(42));
    const [a, b] = await Promise.all([shareInFlight('k', req), shareInFlight('k', req)]);
    expect([a, b]).toEqual([42, 42]);
    expect(req).toHaveBeenCalledTimes(1);
  });
  it('is never a cache: a call after the first settled sends a fresh request', async () => {
    const req = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await shareInFlight('k2', req)).toBe(1);
    expect(await shareInFlight('k2', req)).toBe(2);
    expect(req).toHaveBeenCalledTimes(2);
  });
  it('a failure reaches every caller and is not kept', async () => {
    const req = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce('ok');
    await expect(Promise.all([shareInFlight('k3', req), shareInFlight('k3', req)])).rejects.toThrow('down');
    expect(await shareInFlight('k3', req)).toBe('ok');
  });
  it('different keys do not share', async () => {
    const req = vi.fn(() => Promise.resolve(0));
    await Promise.all([shareInFlight('a', req), shareInFlight('b', req)]);
    expect(req).toHaveBeenCalledTimes(2);
  });
});

describe('forgetInFlight (round 9b)', () => {
  it('a read started after forget sends a fresh request even while the old one is still out', async () => {
    const { forgetInFlight } = await import('@/lib/share-in-flight');
    let release!: (v: string) => void;
    const first = vi.fn(() => new Promise<string>((r) => { release = r; }));
    const second = vi.fn(() => Promise.resolve('new'));
    const old = shareInFlight('prep:e:u', first);
    forgetInFlight('prep:e:u');
    expect(await shareInFlight('prep:e:u', second)).toBe('new');
    release('old');
    expect(await old).toBe('old');
    expect(second).toHaveBeenCalledTimes(1);
  });
  it('a prefix forgets its keys and no sibling prefix', async () => {
    const { forgetInFlight } = await import('@/lib/share-in-flight');
    const never = () => new Promise<number>(() => {});
    shareInFlight('tag-points:cmp7:u', never);
    shareInFlight('tag-points-x:a', never);
    forgetInFlight('tag-points');
    const fresh = vi.fn(() => Promise.resolve(1));
    await shareInFlight('tag-points:cmp7:u', fresh);
    expect(fresh).toHaveBeenCalledTimes(1);
    const joined = vi.fn(() => Promise.resolve(2));
    void shareInFlight('tag-points-x:a', joined);
    expect(joined).not.toHaveBeenCalled();
  });
});
