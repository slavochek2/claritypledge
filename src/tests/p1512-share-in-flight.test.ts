/**
 * P1512: the shell's badge hooks mount on several surfaces at once; concurrent callers share one
 * request, and nothing is cached once it settles.
 */
import { describe, it, expect, vi } from 'vitest';
import { shareInFlight } from '@/lib/share-in-flight';

describe('shareInFlight', () => {
  it('concurrent callers with one key share a single request', async () => {
    let resolve!: (v: number) => void;
    const run = vi.fn(() => new Promise<number>((r) => { resolve = r; }));
    const a = shareInFlight('k1', run);
    const b = shareInFlight('k1', run);
    await Promise.resolve(); // run() starts on the next microtask
    resolve(7);
    expect(await a).toBe(7);
    expect(await b).toBe(7);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a call after the first settled asks again (no caching)', async () => {
    const run = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await shareInFlight('k2', run)).toBe(1);
    expect(await shareInFlight('k2', run)).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('a failure reaches every concurrent caller and is not kept', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(3);
    const a = shareInFlight('k3', run);
    const b = shareInFlight('k3', run);
    await expect(a).rejects.toThrow('boom');
    await expect(b).rejects.toThrow('boom');
    expect(await shareInFlight('k3', run)).toBe(3);
  });

  it('different keys never share', async () => {
    const run = vi.fn().mockResolvedValue(0);
    await Promise.all([shareInFlight('user-a', run), shareInFlight('user-b', run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('shareInFlight, synchronous throw', () => {
  it('a run that throws synchronously rejects and is released', async () => {
    const boom = () => { throw new Error('sync'); };
    await expect(shareInFlight('k4', boom as never)).rejects.toThrow('sync');
    expect(await shareInFlight('k4', async () => 5)).toBe(5);
  });
});
