/**
 * P1337 item 2 — the offline strip said "Offline · saved copy from 40 min ago" while the internet
 * worked (founder, 2026-10-05, on a VPN).
 *
 * Cause: a read slower than its 4 s deadline was answered from the cache AND marked the app
 * unreachable. Its own late answer could not undo that — it was sent before the mark, and a
 * success only counts as a reconnect when sent after the latest failure — and nothing put the
 * late answer on screen. On a network that is slow, not down, every re-read went the same way.
 *
 * Contract: slow is not offline; a late, complete answer replaces the saved copy.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readThrough, clearOfflineReadCache, MemoryEntryStore, _setOfflineEntryStoreForTesting } from '@/lib/offline-read-cache';
import { isSupabaseUnreachable, recordNetworkFailure, _resetNetworkOutcomeForTesting } from '@/lib/network-outcome';

const slow = <T,>(value: T, ms: number) => () => new Promise<T>((res) => setTimeout(() => res(value), ms));
const hang = <T,>() => () => new Promise<T>(() => {});

let store: MemoryEntryStore;

beforeEach(async () => {
  // A previous test's slow fetch still settling must not announce into this one.
  await clearOfflineReadCache();
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  _resetNetworkOutcomeForTesting();
  localStorage.clear();
});

async function seed(id: string, data: unknown) {
  await readThrough('story', id, async () => data);
  await new Promise((res) => setTimeout(res, 20));
}

describe('slow is not offline', () => {
  it('a slow read served from the cache is marked slow and does not make the app unreachable', async () => {
    await seed('s1', { v: 'old' });
    const r = await readThrough('story', 's1', slow({ v: 'new' }, 120), { deadlineMs: 20, uncachedDeadlineMs: 1000 });
    expect(r.source).toBe('cache');
    expect(r.source === 'cache' && r.slow).toBe(true);
    expect(isSupabaseUnreachable()).toBe(false);
  });

  it('a read that fails at the network is still offline, not slow', async () => {
    await seed('s1', { v: 'old' });
    const r = await readThrough('story', 's1', async () => {
      recordNetworkFailure();
      return null;
    });
    expect(r.source).toBe('cache');
    expect(r.source === 'cache' && r.slow).toBeFalsy();
    expect(isSupabaseUnreachable()).toBe(true);
  });

  it('a read that never answers counts as unreachable once the longer bound passes', async () => {
    await seed('s1', { v: 'old' });
    await readThrough('story', 's1', hang(), { deadlineMs: 20, slowGiveUpMs: 80 });
    expect(isSupabaseUnreachable()).toBe(false);
    await new Promise((res) => setTimeout(res, 120));
    expect(isSupabaseUnreachable()).toBe(true);
  });
});

describe('the late answer replaces the saved copy', () => {
  it("a slow read's own late answer goes to the page, once, with no second fetch", async () => {
    await seed('s1', { v: 'old' });
    const got: unknown[] = [];
    let fetches = 0;
    const r = await readThrough('story', 's1', () => {
      fetches += 1;
      return new Promise<{ v: string }>((res) => setTimeout(() => res({ v: 'new' }), 60));
    }, { deadlineMs: 20, onLate: (d) => got.push(d) });
    expect(r.source === 'cache' && r.slow).toBe(true);
    expect(got).toEqual([]);
    await new Promise((res) => setTimeout(res, 100));
    expect(got).toEqual([{ v: 'new' }]);
    expect(fetches).toBe(1);
  });

  it('a read answered live never calls onLate', async () => {
    const got: unknown[] = [];
    await readThrough('story', 's1', async () => ({ v: 'live' }), { onLate: (d) => got.push(d) });
    await new Promise((res) => setTimeout(res, 50));
    expect(got).toEqual([]);
  });

  it('a late answer that arrives after a network failure is not delivered', async () => {
    await seed('s1', { v: 'old' });
    const got: unknown[] = [];
    await readThrough('story', 's1', () => new Promise<{ v: string }>((res) => setTimeout(() => { recordNetworkFailure(); res({ v: 'partial' }); }, 40)), {
      deadlineMs: 10,
      onLate: (d) => got.push(d),
    });
    await new Promise((res) => setTimeout(res, 80));
    expect(got).toEqual([]);
  });

  it('a late "not found" (deleted, or no longer visible) is delivered and removes the saved copy', async () => {
    await seed('s1', { v: 'old' });
    const got: unknown[] = [];
    await readThrough('story', 's1', slow(null, 40), { deadlineMs: 10, onLate: (d) => got.push(d) });
    await new Promise((res) => setTimeout(res, 80));
    expect(got).toEqual([null]);
    expect(await store.listType('story')).toEqual([]);
  });

  it("a give-up timer from before a sign-out never marks the next session unreachable", async () => {
    await seed('s1', { v: 'old' });
    await readThrough('story', 's1', hang(), { deadlineMs: 10, slowGiveUpMs: 40 });
    await clearOfflineReadCache();
    _resetNetworkOutcomeForTesting();
    await new Promise((res) => setTimeout(res, 80));
    expect(isSupabaseUnreachable()).toBe(false);
  });

  it('a late answer after a sign-out (cache cleared) is neither stored nor delivered', async () => {
    await seed('s1', { v: 'old' });
    const got: unknown[] = [];
    await readThrough('story', 's1', slow({ v: 'new' }, 60), { deadlineMs: 10, onLate: (d) => got.push(d) });
    await clearOfflineReadCache();
    await new Promise((res) => setTimeout(res, 100));
    expect(got).toEqual([]);
    expect(await store.listType('story')).toEqual([]);
  });

  it('a late answer fetched for a different viewer than the stored session is not delivered', async () => {
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify({ access_token: 'x', user: { id: 'owner' } }));
    await readThrough('story', 's1', async () => ({ v: 'old' }), { viewerId: 'owner' });
    await new Promise((res) => setTimeout(res, 20));
    const got: unknown[] = [];
    await readThrough('story', 's1', slow({ v: 'theirs' }, 40), { deadlineMs: 10, viewerId: 'someone-else', onLate: (d) => got.push(d) });
    await new Promise((res) => setTimeout(res, 80));
    expect(got).toEqual([]);
  });
});

describe('an answer that arrives after the give-up bound', () => {
  it('is still delivered, and it ends the "unreachable" state it caused', async () => {
    await seed('s1', { v: 'old' });
    const got: unknown[] = [];
    await readThrough('story', 's1', slow({ v: 'new' }, 90), { deadlineMs: 10, slowGiveUpMs: 40, onLate: (d) => got.push(d) });
    await new Promise((res) => setTimeout(res, 60));
    expect(isSupabaseUnreachable()).toBe(true);
    await new Promise((res) => setTimeout(res, 80));
    expect(got).toEqual([{ v: 'new' }]);
    expect(isSupabaseUnreachable()).toBe(false);
  });
});

describe('round 2 review (Codex)', () => {
  it('a slow read whose late answer fails says offline, so "updating…" never stays up with nothing coming', async () => {
    await seed('s1', { v: 'old' });
    await readThrough('story', 's1', () => new Promise((_, rej) => setTimeout(() => rej(new Error('boom')), 40)), {
      deadlineMs: 10,
      onLate: () => {},
    });
    expect(isSupabaseUnreachable()).toBe(false);
    await new Promise((res) => setTimeout(res, 70));
    expect(isSupabaseUnreachable()).toBe(true);
  });

  it('the give-up bound counts from the start of the read, not from the deadline', async () => {
    await seed('s1', { v: 'old' });
    const started = Date.now();
    await readThrough('story', 's1', hang(), { deadlineMs: 60, slowGiveUpMs: 90 });
    await new Promise((res) => setTimeout(res, Math.max(0, started + 110 - Date.now())));
    expect(isSupabaseUnreachable()).toBe(true);
  });
});
