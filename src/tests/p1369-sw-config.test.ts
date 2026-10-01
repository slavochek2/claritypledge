/**
 * P1369 — the service worker's caching rules (src/pwa/workbox-config.ts), evaluated the way
 * Workbox evaluates them: each rule's urlPattern against a real request shape.
 *
 * Invariant: the service worker never caches Supabase or other auth-bearing requests. Every REST
 * call carries a user's JWT (and maybe a guest room code), and Cache Storage keys by URL — a
 * cached response would be served to the next person on the device. No rule may MATCH a Supabase
 * request at all (unmatched requests are never intercepted). Known-good controls below prove the
 * matcher is not blind: the same evaluation does match the app's own chunks and navigations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runtimeCaching, createShellPrecache, JS_CACHE_MAX_ENTRIES, type RuntimeCachingRule } from '@/pwa/workbox-config';

const APP_ORIGIN = 'https://claritypledge.com';

interface Probe {
  url: string;
  mode?: RequestMode;
  method?: string;
}

function matches(rule: RuntimeCachingRule, probe: Probe): boolean {
  const url = new URL(probe.url);
  const pattern = rule.urlPattern;
  if (pattern instanceof RegExp) return pattern.test(url.href);
  if (typeof pattern === 'string') return url.href === new URL(pattern, APP_ORIGIN).href;
  const request = { mode: probe.mode ?? 'cors', method: probe.method ?? 'GET', url: url.href } as unknown as Request;
  return Boolean(
    (pattern as (o: { url: URL; request: Request; sameOrigin: boolean }) => unknown)({
      url,
      request,
      sameOrigin: url.origin === APP_ORIGIN,
    }),
  );
}

const matchingRules = (probe: Probe) => runtimeCaching.filter((r) => matches(r, probe));

const SUPABASE_REQUESTS: Probe[] = [
  { url: 'https://besjtuodziykmjidubzw.supabase.co/rest/v1/stories?select=*&id=eq.1' },
  { url: 'https://gfjctyxqlwexxwsmkakq.supabase.co/rest/v1/points?select=id' },
  { url: 'https://besjtuodziykmjidubzw.supabase.co/rest/v1/rpc/get_ready_distribution', method: 'POST' },
  { url: 'https://besjtuodziykmjidubzw.supabase.co/auth/v1/token?grant_type=refresh_token', method: 'POST' },
  { url: 'https://besjtuodziykmjidubzw.supabase.co/auth/v1/user' },
  { url: 'https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/story-images/a/b.png' },
  { url: 'https://besjtuodziykmjidubzw.supabase.co/storage/v1/object/public/avatars/x.jpg' },
  { url: 'https://besjtuodziykmjidubzw.supabase.co/functions/v1/gcs-signed-url', method: 'POST' },
  // A Supabase URL that happens to end like a chunk or an image.
  { url: 'https://besjtuodziykmjidubzw.supabase.co/assets/evil.js' },
];

describe('P1369: no service-worker rule touches Supabase', () => {
  it.each(SUPABASE_REQUESTS)('$url is matched by no runtimeCaching rule', (probe) => {
    expect(matchingRules(probe).map((r) => r.handler)).toEqual([]);
  });

  it('known-good controls: the same evaluation DOES match the app\'s own requests', () => {
    expect(matchingRules({ url: `${APP_ORIGIN}/assets/index-abc123.js` }).map((r) => r.handler)).toEqual(['CacheFirst']);
    expect(matchingRules({ url: `${APP_ORIGIN}/story/1`, mode: 'navigate' }).map((r) => r.handler)).toEqual(['NetworkOnly']);
    expect(matchingRules({ url: `${APP_ORIGIN}/founder-photo.jpg` }).map((r) => r.handler)).toEqual(['CacheFirst']);
  });

  it('vite.config.ts takes its runtime caching from this module (no inline rules to drift)', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
    expect(cfg).toMatch(/runtimeCaching,\s*\n/);
    expect(cfg).not.toMatch(/runtimeCaching:\s*\[/);
  });
});

describe('P1369: the app shell boots offline from one build', () => {
  const navRule = runtimeCaching.find((r) => matches(r, { url: `${APP_ORIGIN}/x`, mode: 'navigate' }))!;
  const jsRule = runtimeCaching.find((r) => matches(r, { url: `${APP_ORIGIN}/assets/a.js` }))!;

  it('navigations are network-only (P838: a deploy lands on the next online load)', () => {
    expect(navRule.handler).toBe('NetworkOnly');
    expect(navRule.options?.cacheName).toBeUndefined(); // never stored per URL
  });

  it('offline, navigations fall back to the PRECACHED index.html (P864: a precached URL)', () => {
    expect(navRule.options?.precacheFallback).toEqual({ fallbackURL: 'index.html' });
    const cfg = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
    expect(cfg).toMatch(/globPatterns:\s*\[[^\]]*'index\.html'[^\]]*\]/);
  });

  it('the precache route never answers "/" (P838 — otherwise home serves the old build after a deploy)', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8');
    expect(cfg).toMatch(/directoryIndex:\s*null/);
  });

  it('JS chunks are CacheFirst with a cap sized above a whole build', () => {
    expect(jsRule.handler).toBe('CacheFirst');
    // A production build has ~185 JS files; the old cap of 30 evicted what an offline boot needs.
    expect(JS_CACHE_MAX_ENTRIES).toBeGreaterThanOrEqual(300);
    expect(jsRule.options?.expiration?.maxEntries).toBe(JS_CACHE_MAX_ENTRIES);
  });
});

describe('P1369: precache holds exactly the shell chunks', () => {
  type Bundle = Record<string, { type: 'chunk'; fileName: string; isEntry: boolean; imports: string[] } | { type: 'asset'; fileName: string }>;
  const bundle: Bundle = {
    'assets/index-A.js': { type: 'chunk', fileName: 'assets/index-A.js', isEntry: true, imports: ['assets/vendor-B.js'] },
    'assets/vendor-B.js': { type: 'chunk', fileName: 'assets/vendor-B.js', isEntry: false, imports: [] },
    'assets/story-page-C.js': { type: 'chunk', fileName: 'assets/story-page-C.js', isEntry: false, imports: ['assets/vendor-B.js'] },
    'assets/index-D.css': { type: 'asset', fileName: 'assets/index-D.css' },
  };
  const entries = [
    { url: 'index.html', revision: 'r1', size: 1 },
    { url: 'assets/index-A.js', revision: null, size: 1 },
    { url: 'assets/vendor-B.js', revision: null, size: 1 },
    { url: 'assets/story-page-C.js', revision: null, size: 1 },
    { url: 'assets/index-D.css', revision: null, size: 1 },
  ];

  function run(b: Bundle) {
    const { plugin, manifestTransform } = createShellPrecache();
    (plugin.generateBundle as unknown as (o: unknown, b: Bundle) => void).call({}, {}, b);
    return manifestTransform(entries as never);
  }

  it('keeps index.html, CSS and the entry + its static imports; drops lazy route chunks', async () => {
    const result = await run(bundle);
    expect(result.manifest.map((e) => e.url).sort()).toEqual(
      ['assets/index-A.js', 'assets/index-D.css', 'assets/vendor-B.js', 'index.html'].sort(),
    );
  });

  it('fails the build when the shell set was never computed (would be a blank page offline)', async () => {
    const { manifestTransform } = createShellPrecache();
    await expect(manifestTransform(entries as never)).rejects.toThrow(/never computed/);
  });

  it('fails the build when a shell chunk is missing from the precache glob', async () => {
    const b: Bundle = {
      ...bundle,
      'assets/index-A.js': { type: 'chunk', fileName: 'assets/index-A.js', isEntry: true, imports: ['assets/missing-Z.js'] },
      'assets/missing-Z.js': { type: 'chunk', fileName: 'assets/missing-Z.js', isEntry: false, imports: [] },
    };
    await expect(run(b)).rejects.toThrow(/missing-Z/);
  });
});
