/**
 * P1369 — the offline read cache (src/lib/offline-read-cache.ts).
 *
 * Network first; the cache answers only when the network did not; partitioned by auth context;
 * cleared on sign-out without a racing read writing rows back.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  readThrough,
  clearOfflineReadCache,
  offlineCacheOwner,
  MemoryEntryStore,
  OFFLINE_CACHE_CAPS,
  OFFLINE_CACHE_MAX_AGE_MS,
  _setOfflineEntryStoreForTesting,
} from '@/lib/offline-read-cache';
import { recordNetworkFailure, recordNetworkSuccess, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';
import { holdRoomCode, _resetHeldRoomCodesForTesting } from '@/lib/room-capability';

// vitest env: VITE_SUPABASE_URL = http://localhost:54321 → supabase-js's key is sb-localhost-auth-token
const AUTH_KEY = 'sb-localhost-auth-token';
const signInAs = (id: string) => localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'x', user: { id } }));
const signOutStorage = () => localStorage.removeItem(AUTH_KEY);

/** A service call that "failed at the network": supabase-js returns null and the fetch rejected. */
const offlineFetch = async () => {
  recordNetworkFailure();
  return null;
};

let store: MemoryEntryStore;

beforeEach(() => {
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  _resetNetworkOutcomeForTesting();
  _resetHeldRoomCodesForTesting();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('network first', () => {
  it('online: returns the network result and stores it', async () => {
    const r = await readThrough('story', 's1', async () => ({ content: 'hello' }));
    expect(r).toEqual({ source: 'network', data: { content: 'hello' } });
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
  });

  it('online with a cached copy: still the network, never the cache', async () => {
    await readThrough('story', 's1', async () => ({ v: 1 }));
    const r = await readThrough('story', 's1', async () => ({ v: 2 }));
    expect(r).toEqual({ source: 'network', data: { v: 2 } });
  });

  it('network fails: answers from the cache with the entry storedAt', async () => {
    const before = Date.now();
    await readThrough('story', 's1', async () => ({ content: 'seen' }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    const r = await readThrough('story', 's1', offlineFetch);
    expect(r.source).toBe('cache');
    if (r.source !== 'cache') throw new Error('unreachable');
    expect(r.data).toEqual({ content: 'seen' });
    expect(r.storedAt).toBeGreaterThanOrEqual(before);
  });

  it('network fails and nothing was cached: offline (not "not found")', async () => {
    expect(await readThrough('story', 'never', offlineFetch)).toEqual({ source: 'offline' });
  });

  it('a genuine not-found online is not offline, and it deletes the stale copy', async () => {
    await readThrough('story', 's1', async () => ({ v: 1 }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    expect(await readThrough('story', 's1', async () => null)).toEqual({ source: 'network', data: null });
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(0));
    expect(await readThrough('story', 's1', offlineFetch)).toEqual({ source: 'offline' });
  });

  it('an UNRELATED request failing during a read that then succeeds: fresh data, not the cache', async () => {
    await readThrough('story', 's1', async () => ({ v: 1 }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    const r = await readThrough('story', 's1', async () => {
      recordNetworkFailure(); // e.g. another component's poll failed
      recordNetworkSuccess(); // this read's own request reached the server afterwards
      return { v: 2 };
    });
    expect(r).toEqual({ source: 'network', data: { v: 2 } });
  });

  it('a real (non-network) error is rethrown, not masked as offline', async () => {
    await expect(readThrough('story', 's1', async () => { throw new Error('bug'); })).rejects.toThrow('bug');
  });

  it('a network failure mid-read never overwrites a complete copy with a partial one', async () => {
    await readThrough('story', 's1', async () => ({ points: ['a', 'b'] }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    const partial = await readThrough('story', 's1', async () => {
      recordNetworkFailure(); // the points sub-query failed
      return { points: [] };
    });
    expect(partial.source).toBe('cache');
    expect(partial.source === 'cache' && partial.data).toEqual({ points: ['a', 'b'] });
  });
});

describe('deadline (offline auth refresh can block a read ~25 s)', () => {
  it('a hanging read with a cached copy answers from the cache after the deadline', async () => {
    await readThrough('story', 's1', async () => ({ v: 1 }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    const r = await readThrough('story', 's1', () => new Promise(() => {}), { deadlineMs: 30 });
    expect(r.source).toBe('cache');
  });

  it('a hanging read with no copy but a failed request is offline', async () => {
    recordNetworkFailure(); // e.g. the refresh-token request that is blocking the read
    const r = readThrough('story', 's1', () => new Promise<null>(() => {}), { deadlineMs: 30 });
    recordNetworkFailure();
    expect(await r).toEqual({ source: 'offline' });
  });

  it('a slow read with no copy and no failure keeps waiting for the network', async () => {
    const r = await readThrough('story', 's1', () => new Promise((res) => setTimeout(() => res({ v: 1 }), 80)), { deadlineMs: 20 });
    expect(r).toEqual({ source: 'network', data: { v: 1 } });
  });
});

describe('partitioned by auth context', () => {
  it('owner comes from the stored session', async () => {
    expect(await offlineCacheOwner()).toBe('anon');
    signInAs('user-a');
    expect(await offlineCacheOwner()).toBe('u:user-a');
    localStorage.setItem(AUTH_KEY, '{not json');
    expect(await offlineCacheOwner()).toBe('unknown'); // never falls back to the anonymous cache
  });

  it("account B never reads account A's cached copy of the same story", async () => {
    signInAs('user-a');
    await readThrough('story', 's1', async () => ({ secret: 'A' }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    signInAs('user-b');
    expect(await readThrough('story', 's1', offlineFetch)).toEqual({ source: 'offline' });
    signOutStorage();
    expect(await readThrough('story', 's1', offlineFetch)).toEqual({ source: 'offline' });
  });

  it('a guest holding a room code and one without never share a copy', async () => {
    holdRoomCode('ABC123');
    await readThrough('story', 's1', async () => ({ roomOnly: true }));
    await vi.waitFor(async () => expect((await store.listType('story')).length).toBe(1));
    expect(await offlineCacheOwner()).not.toContain('ABC123'); // the capability itself is not stored
    _resetHeldRoomCodesForTesting();
    expect(await readThrough('story', 's1', offlineFetch)).toEqual({ source: 'offline' });
  });
});

describe('cleared on sign-out', () => {
  it('clear removes every owner’s entries', async () => {
    signInAs('user-a');
    await readThrough('point', 'p1', async () => ({ x: 1 }));
    await vi.waitFor(async () => expect((await store.listType('point')).length).toBe(1));
    await clearOfflineReadCache();
    expect(await readThrough('point', 'p1', offlineFetch)).toEqual({ source: 'offline' });
  });

  it('a read in flight during sign-out never writes its rows back', async () => {
    signInAs('user-a');
    let release!: (v: { x: number }) => void;
    const pending = readThrough('point', 'p1', () => new Promise((res) => { release = res; }), { deadlineMs: 10_000 });
    await clearOfflineReadCache();
    release({ x: 1 });
    await pending;
    await new Promise((r) => setTimeout(r, 10));
    expect(await store.listType('point')).toEqual([]);
  });
});

describe('caps and age', () => {
  it('keeps at most the cap per resource type, evicting the oldest', async () => {
    const cap = OFFLINE_CACHE_CAPS.event;
    for (let i = 0; i < cap + 5; i++) {
      await readThrough('event', `e${i}`, async () => ({ i }));
      await vi.waitFor(async () => expect((await store.listType('event')).length).toBe(Math.min(i + 1, cap)));
    }
    const keys = (await store.listType('event')).map((r) => r.key);
    expect(keys.some((k) => k.endsWith('|e0'))).toBe(false);
    expect(keys.some((k) => k.endsWith(`|e${cap + 4}`))).toBe(true);
  });

  it('an entry older than the max age is not served', async () => {
    await store.put({ key: 'anon|story|old', type: 'story', data: { v: 1 }, storedAt: Date.now() - OFFLINE_CACHE_MAX_AGE_MS - 1000 });
    expect(await readThrough('story', 'old', offlineFetch)).toEqual({ source: 'offline' });
  });
});
