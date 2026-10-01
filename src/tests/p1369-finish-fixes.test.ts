/**
 * P1369 /finish review fixes: per-key ordered writes. (The IndexedDB versionchange fix is covered
 * in a real browser: e2e/offline/p1369-regressions.spec.ts "cache delete from another tab".)
 */
import { describe, it, expect } from 'vitest';
import { saveInOrder } from '@/app/hooks/use-online-write-guard';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('saveInOrder', () => {
  it('a second write for the same key is not sent until the first has settled', async () => {
    const sent: string[] = [];
    const first = deferred<undefined>();
    const p1 = saveInOrder('position:p1', () => { sent.push('first'); return first.promise; }, 1000);
    const p2 = saveInOrder('position:p1', async () => { sent.push('second'); });
    await new Promise((r) => setTimeout(r, 30));
    expect(sent).toEqual(['first']); // second waits for the slow first
    first.resolve(undefined);
    await p1;
    await p2;
    expect(sent).toEqual(['first', 'second']); // server sees click order
  });

  it('a write that never answers does not block later writes for that key past its window', async () => {
    const sent: string[] = [];
    const p1 = saveInOrder('position:hang', () => { sent.push('first'); return new Promise<undefined>(() => {}); }, 20);
    await expect(p1).rejects.toThrow(); // timed out (captive portal), reported as not saved
    await saveInOrder('position:hang', async () => { sent.push('second'); }, 200);
    expect(sent).toEqual(['first', 'second']);
  });

  it('control: different keys do not wait on each other', async () => {
    const sent: string[] = [];
    const slow = deferred<undefined>();
    void saveInOrder('position:a', () => { sent.push('a'); return slow.promise; }, 1000).catch(() => undefined);
    await saveInOrder('position:b', async () => { sent.push('b'); });
    expect(sent).toEqual(['a', 'b']);
    slow.resolve(undefined);
  });
});
