/**
 * @file workbox-config.ts
 * @description P1369: the service worker's caching rules. BUILD-TIME ONLY — imported by
 * vite.config.ts, never by the app. Kept here (not inline in vite.config.ts) so a unit test can
 * evaluate every rule against real request shapes (src/tests/p1369-sw-config.test.ts).
 *
 * The invariants this file carries, and why:
 *
 * 1. THE APP BOOTS OFFLINE, FROM ONE BUILD. The precache holds `index.html` (with a revision) and
 *    exactly the JS the shell statically needs — the entry chunk and its static imports, computed
 *    from the bundle by `createShellPrecache`. A service worker version therefore always has a
 *    shell and that shell's own chunks, from the same build, installed atomically. Lazy route
 *    chunks are NOT precached (nothing is pre-downloaded); they are cached as they are used.
 *    A route whose chunk was never fetched shows "needs a connection" offline (App.tsx
 *    ChunkErrorFallback), never the "Refresh" chunk error, which would loop.
 *
 * 2. P838 HOLDS — a deploy lands on the next online load. Navigations are NetworkOnly: online,
 *    the shell always comes from the network, so it names the newest build's chunks. Only when
 *    the network fails (or hangs past the timeout) does the precached shell answer. Navigations
 *    are never runtime-cached per URL: a URL cached under an older build would point at chunks
 *    the newer worker already deleted — the blank-page failure, offline.
 *
 * 3. P864 HOLDS — no navigation fallback to a non-precached URL. The fallback is `index.html`,
 *    which IS precached (precacheFallback resolves it through the precache, never a runtime cache).
 *
 * 4. JS chunks are content-hashed and immutable, so they are CacheFirst, with a cap sized for
 *    more than one whole build (a build has ~185 JS files) — the old 30-entry cap evicted the
 *    chunks an offline boot needed.
 *
 * 5. THE SERVICE WORKER NEVER CACHES SUPABASE. Every REST call carries a user's JWT (and maybe a
 *    guest room code); Cache Storage keys by URL and would serve one person's rows to another.
 *    No rule here may match the Supabase host at all — requests no rule matches go straight to
 *    the network. Offline reading of data lives in the app (src/lib/offline-read-cache.ts),
 *    partitioned by auth context.
 */
import type { Plugin } from 'vite';
import type { VitePWAOptions } from 'vite-plugin-pwa';

type WorkboxOptions = NonNullable<VitePWAOptions['workbox']>;
export type RuntimeCachingRule = NonNullable<WorkboxOptions['runtimeCaching']>[number];
type ManifestTransform = NonNullable<WorkboxOptions['manifestTransforms']>[number];

/** More than one whole build (~185 JS files), so an offline boot never finds its chunks evicted. */
export const JS_CACHE_MAX_ENTRIES = 400;

/** How long a navigation waits for the network before the precached shell answers. Written as a
 *  literal inside the plugin below (serialized functions cannot reference outer constants). */
export const NAVIGATION_NETWORK_TIMEOUT_MS = 4000;

/**
 * NOTE: urlPattern functions are serialized into sw.js with `toString()` — they must be
 * self-contained (no references to anything outside their own body).
 */
export const runtimeCaching: RuntimeCachingRule[] = [
  // Slides (P1369 Scope v2): the static decks under public/presiN/ (vercel.json redirects /presiN
  // to /presiN/). They are not part of the build — no hashed chunks, no app shell — so caching
  // them per URL cannot bring back a stale shell (P838), and keeping them OUT of the precache
  // keeps a large deck from blocking a new worker's install. NetworkFirst: online always
  // fresh; offline the copy from the last fetch (a visit, or the offline pack's prefetch).
  // Images in a deck go through the images rule; its fonts are in the precache already.
  {
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      sameOrigin && /^\/presi\d*\/(?:index\.html|[^/]+\.js)?$/.test(url.pathname),
    handler: 'NetworkFirst',
    options: {
      cacheName: 'static-decks',
      networkTimeoutSeconds: 4,
      cacheableResponse: { statuses: [200] },
      expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
    },
  },
  // The bare /presiN link (the links menu's "Slides"): online the network answers with Vercel's
  // redirect; offline the redirect is recreated here so the deck's relative paths still resolve.
  {
    urlPattern: ({ url, sameOrigin, request }: { url: URL; sameOrigin: boolean; request: Request }) =>
      sameOrigin && request.mode === 'navigate' && /^\/presi\d*$/.test(url.pathname),
    handler: 'NetworkOnly',
    options: {
      plugins: [
        {
          handlerDidError: async ({ request }: { request: Request }) =>
            Response.redirect(new URL(`${new URL(request.url).pathname}/`, request.url).href, 302),
        },
      ],
    },
  },
  // Navigations: network, else the precached shell of THIS worker's build (invariants 1–3).
  // workbox-build allows networkTimeoutSeconds only on NetworkFirst, and NetworkFirst would store
  // shells per URL — so the timeout is a plugin that gives the network request an abort signal.
  // If a browser refuses to rebuild a navigation Request, the original is sent without one.
  {
    urlPattern: ({ request }: { request: Request }) => request.mode === 'navigate',
    handler: 'NetworkOnly',
    options: {
      precacheFallback: { fallbackURL: 'index.html' },
      plugins: [
        {
          requestWillFetch: async ({ request }: { request: Request }) => {
            try {
              if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return request;
              return new Request(request, { signal: AbortSignal.timeout(4000) });
            } catch {
              return request;
            }
          },
        },
      ],
    },
  },
  // JS chunks: hashed and immutable → CacheFirst (invariant 4). Same-origin /assets only.
  {
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      sameOrigin && /^\/assets\/.+\.js$/.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: 'js-assets',
      cacheableResponse: { statuses: [200] },
      expiration: {
        maxEntries: JS_CACHE_MAX_ENTRIES,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      },
    },
  },
  // Images — cache first, SAME-ORIGIN ONLY. Never Supabase Storage (invariant 5).
  // A fetch made by the service worker is governed by sw.js's CSP `connect-src`, not the page's
  // `img-src`: intercepting a YouTube thumbnail (i.ytimg.com, img-src only) made every one of
  // them fail to load once the worker was installed — the black video posters of 2026-10-01.
  // Nothing is lost by not intercepting: a cross-origin <img> is a no-cors request, its opaque
  // response is never cacheable here anyway.
  {
    urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
      sameOrigin && /\.(?:png|jpg|jpeg|webp|gif)$/i.test(url.pathname),
    handler: 'CacheFirst',
    options: {
      cacheName: 'images',
      expiration: {
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      },
    },
  },
  // Google Fonts stylesheets
  {
    urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'google-fonts-stylesheets',
      expiration: {
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      },
    },
  },
  // Google Fonts webfonts
  {
    urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
    handler: 'CacheFirst',
    options: {
      cacheName: 'google-fonts-webfonts',
      expiration: {
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      },
    },
  },
  // Third-party scripts (Sentry, Mixpanel) - Network only
  {
    urlPattern: /^https:\/\/(cdn\.mxpnl\.com|api-eu\.mixpanel\.com|.*\.sentry\.io)\/.*/,
    handler: 'NetworkOnly',
  },
  // Supabase: deliberately NO rule (invariant 5). Unmatched requests are not intercepted.
];

/**
 * Invariant 1: precache exactly the shell's own JS. A Vite plugin records the entry chunk and its
 * static-import closure from the final bundle; the manifest transform then drops every other JS
 * file from the precache manifest (CSS, fonts, SVG and index.html pass through untouched).
 */
export function createShellPrecache(): { plugin: Plugin; manifestTransform: ManifestTransform } {
  const shell = new Set<string>();

  const plugin: Plugin = {
    name: 'p1369-shell-precache',
    apply: 'build',
    generateBundle(_options, bundle) {
      shell.clear();
      const visit = (fileName: string) => {
        if (shell.has(fileName)) return;
        const out = bundle[fileName];
        if (!out || out.type !== 'chunk') return;
        shell.add(fileName);
        for (const dep of out.imports) visit(dep);
      };
      for (const out of Object.values(bundle)) {
        if (out.type === 'chunk' && out.isEntry) visit(out.fileName);
      }
    },
  };

  const manifestTransform: ManifestTransform = async (entries) => {
    if (shell.size === 0) {
      // Without the shell's chunks precached, an offline boot of this build would be a blank page.
      throw new Error('p1369-shell-precache: the shell chunk set was never computed');
    }
    const manifest = entries.filter((e) => !e.url.endsWith('.js') || shell.has(e.url));
    const missing = [...shell].filter((f) => !manifest.some((e) => e.url === f));
    if (missing.length) {
      throw new Error(`p1369-shell-precache: shell chunks absent from the precache glob: ${missing.join(', ')}`);
    }
    return { manifest, warnings: [] };
  };

  return { plugin, manifestTransform };
}
