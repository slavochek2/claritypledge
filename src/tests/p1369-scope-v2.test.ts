/**
 * P1369 Scope v2 (founder, 2026-09-30) — unit checks for the parts the browser suite cannot
 * isolate: the offline pack's bounds and partitioning, the prefetch write path, the slides'
 * service-worker rules and the "few seconds" deadline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const prefetchCalls: string[] = [];
vi.mock('@/app/data/offline-reads', () => ({
  stakeRead: (tag: string, viewer?: string) => ({ type: 'stake', id: `${tag}:${viewer ?? '-'}`, fetch: async () => ({ tag }) }),
  feedRead: (viewer?: string) => ({ type: 'feed', id: `${viewer ?? '-'}:desc:`, fetch: async () => ({ feed: 1 }) }),
  groupsRead: () => ({ type: 'groups', id: 'directory', fetch: async () => ({ groups: 1 }) }),
}));
vi.mock('@/app/data/offline-reads-letters', () => ({
  // Codes st1..st9 resolve; ck does not (as on a test DB) — proves an unresolved code is skipped.
  letterCodeRead: (code: string) => ({ type: 'letter-code', id: code, fetch: async () => (code === 'ck' ? null : `L-${code}`) }),
  publicLetterRead: (id: string) => ({ type: 'letter', id, fetch: async () => ({ letter: { id } }) }),
}));
// Route chunks: the pack warms them; here they must not load the real pages.
vi.mock('@/app/pages/stake-page', () => ({}));
vi.mock('@/app/pages/letter-reading-page', () => ({}));
vi.mock('@/app/pages/feed-page', () => ({}));
vi.mock('@/app/pages/org-directory-page', () => ({}));

import {
  MemoryEntryStore,
  UNCACHED_DEADLINE_MS,
  NETWORK_DEADLINE_MS,
  _setOfflineEntryStoreForTesting,
  clearOfflineReadCache,
  prefetchThrough,
  readThrough,
} from '@/lib/offline-read-cache';
import { OFFLINE_PACK_DISABLED_KEY, OFFLINE_PACK_REFRESH_MS, runOfflinePack } from '@/lib/offline-pack';
import {
  _resetNetworkOutcomeForTesting,
  isSupabaseUnreachable,
  recordNetworkFailure,
} from '@/lib/network-outcome';
import { STANDARD_LETTER_ENTRIES, STANDARD_STAKE_TAGS } from '@/app/data/event-links';
import { runtimeCaching, type RuntimeCachingRule } from '@/pwa/workbox-config';

const AUTH_KEY = 'sb-localhost-auth-token';
const signInAs = (id: string) => localStorage.setItem(AUTH_KEY, JSON.stringify({ access_token: 'x', user: { id } }));

let store: MemoryEntryStore;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = new MemoryEntryStore();
  _setOfflineEntryStoreForTesting(store);
  _resetNetworkOutcomeForTesting();
  localStorage.clear();
  prefetchCalls.length = 0;
  fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
});

async function keys(): Promise<string[]> {
  const out: string[] = [];
  for (const t of ['stake', 'letter', 'letter-code', 'feed', 'groups'] as const) {
    for (const r of await store.listType(t)) out.push(r.key);
  }
  return out.sort();
}

describe('no endless loading', () => {
  it('with nothing cached, a hanging read gives up within a few seconds (spec: "within a few seconds")', () => {
    expect(UNCACHED_DEADLINE_MS).toBeLessThanOrEqual(5_000);
    expect(NETWORK_DEADLINE_MS).toBeLessThanOrEqual(UNCACHED_DEADLINE_MS);
  });
});

describe('prefetchThrough — the pack writes where the pages read', () => {
  it('a pre-loaded entry is what readThrough answers offline', async () => {
    const out = await prefetchThrough('stake', 'cmp7:-', async () => ({ rows: 7 }));
    expect(out.stored).toBe(true);
    const r = await readThrough('stake', 'cmp7:-', async () => {
      recordNetworkFailure();
      return null;
    });
    expect(r).toMatchObject({ source: 'cache', data: { rows: 7 } });
  });

  it('a failed pre-load stores nothing and does NOT mark the app unreachable (no strip for a background fetch)', async () => {
    const out = await prefetchThrough('stake', 'cmp7:-', async () => {
      recordNetworkFailure();
      return { partial: true };
    });
    expect(out.stored).toBe(false);
    expect(await keys()).toEqual([]);
    _resetNetworkOutcomeForTesting();
    await prefetchThrough('stake', 'cmp3:-', async () => null);
    expect(isSupabaseUnreachable()).toBe(false);
  });

  it('is partitioned by auth context: a signed-in pre-load is not readable anonymously', async () => {
    signInAs('user-a');
    await prefetchThrough('feed', 'x', async () => ({ mine: true }));
    localStorage.removeItem(AUTH_KEY);
    const r = await readThrough('feed', 'x', async () => {
      recordNetworkFailure();
      return null;
    });
    expect(r.source).toBe('offline');
  });
});

describe('offline pack', () => {
  it('pre-loads exactly the links-menu entries + feed first page + groups, once', async () => {
    const r = await runOfflinePack(undefined);
    expect(r.ran).toBe(true);
    const codes = STANDARD_LETTER_ENTRIES.map((l) => l.code);
    const resolved = codes.filter((c) => c !== 'ck');
    // data entries: 6 stake lists + every letter code + each resolved letter + feed + groups
    expect(r.attempted).toBe(STANDARD_STAKE_TAGS.length + codes.length + resolved.length + 2);
    expect(await keys()).toEqual(
      [
        ...STANDARD_STAKE_TAGS.map((t) => `anon|stake|${t}:-`),
        ...resolved.map((c) => `anon|letter-code|${c}`),
        ...resolved.map((c) => `anon|letter|L-${c}`),
        'anon|feed|-:desc:',
        'anon|groups|directory',
      ].sort(),
    );
    // Slides: the deck and its script, nothing else (no images, no video).
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/presi/', '/presi/gsap.min.js']);
  });

  it('does not run again within the refresh window, and runs again after it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      expect((await runOfflinePack(undefined)).ran).toBe(true);
      expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'fresh' });
      vi.setSystemTime(Date.now() + OFFLINE_PACK_REFRESH_MS + 1);
      expect((await runOfflinePack(undefined)).ran).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the stamp is per auth context: signing in makes the pack due for the new owner', async () => {
    expect((await runOfflinePack(undefined)).ran).toBe(true);
    signInAs('user-b');
    expect((await runOfflinePack('user-b')).ran).toBe(true);
    expect((await keys()).some((k) => k.startsWith('u:user-b|stake|cmp7:user-b'))).toBe(true);
  });

  it('sign-out clears the pre-loaded rows AND the stamps (the next load pre-loads again)', async () => {
    await runOfflinePack(undefined);
    await clearOfflineReadCache();
    expect(await keys()).toEqual([]);
    expect((await runOfflinePack(undefined)).ran).toBe(true);
  });

  it('is skipped on Save-Data, offline, when unreachable, and when disabled', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'save-data' });
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });

    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'offline' });
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    recordNetworkFailure();
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'unreachable' });
    _resetNetworkOutcomeForTesting();

    localStorage.setItem(OFFLINE_PACK_DISABLED_KEY, '1');
    expect(await runOfflinePack(undefined)).toMatchObject({ ran: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never retries: a failing entry is attempted once and the run moves on', async () => {
    // Every fetch of the slides fails; the pack still issues each exactly once.
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await runOfflinePack(undefined);
    expect(r.files).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// ─── Slides in the service worker ─────────────────────────────────────────────

const APP_ORIGIN = 'https://claritypledge.com';
function matching(url: string, mode: RequestMode = 'cors'): RuntimeCachingRule[] {
  const u = new URL(url);
  return runtimeCaching.filter((rule) => {
    const p = rule.urlPattern;
    if (p instanceof RegExp) return p.test(u.href);
    if (typeof p !== 'function') return false;
    return Boolean(
      (p as (o: { url: URL; request: Request; sameOrigin: boolean }) => unknown)({
        url: u,
        request: { mode, method: 'GET', url: u.href } as unknown as Request,
        sameOrigin: u.origin === APP_ORIGIN,
      }),
    );
  });
}

describe('slides open offline once fetched', () => {
  it.each(['/presi/', '/presi/index.html', '/presi/gsap.min.js', '/presi3/'])('%s is runtime-cached network-first', (path) => {
    const mode: RequestMode = path.endsWith('.js') ? 'no-cors' : 'navigate';
    const first = matching(`${APP_ORIGIN}${path}`, mode)[0]!;
    expect(first.handler).toBe('NetworkFirst');
    expect(first.options?.cacheName).toBe('static-decks');
  });

  it('the bare /presi link falls back to a redirect offline (not the SPA 404)', () => {
    const first = matching(`${APP_ORIGIN}/presi`, 'navigate')[0]!;
    expect(first.handler).toBe('NetworkOnly');
    const plugin = first.options?.plugins?.[0] as { handlerDidError?: unknown } | undefined;
    expect(typeof plugin?.handlerDidError).toBe('function');
  });

  it('app navigations are still network-only with the precached shell (P838/P864 unchanged)', () => {
    const first = matching(`${APP_ORIGIN}/stake/cmp7`, 'navigate')[0]!;
    expect(first.handler).toBe('NetworkOnly');
    expect(first.options?.precacheFallback).toEqual({ fallbackURL: 'index.html' });
    // A route merely starting with "presi" is an app route, not a deck.
    expect(matching(`${APP_ORIGIN}/presidents`, 'navigate')[0]!.options?.precacheFallback).toEqual({ fallbackURL: 'index.html' });
  });

  it('decks are not in the install-blocking precache', async () => {
    const { readFileSync } = await import('node:fs');
    const cfg = readFileSync(`${process.cwd()}/vite.config.ts`, 'utf-8');
    const globs = cfg.match(/globPatterns:\s*\[([^\]]*)\]/)![1]!;
    expect(globs).not.toMatch(/presi/);
    // No site-wide HTML/JS glob that would sweep public/presi*/ into the precache.
    expect(globs).not.toMatch(/'\*\*\/\*\.(?:html|js|\{[^}]*\b(?:html|js)\b[^}]*\})'/);
  });
});
