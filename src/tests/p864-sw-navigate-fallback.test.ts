/**
 * P864 Canary — the service worker must not bind a navigation fallback to a
 * URL that isn't in the precache manifest.
 *
 * P838 (commit 5c37ab2f) stopped precaching index.html so the app shell is
 * served NetworkFirst (always-fresh shell on deploy). It excluded html from
 * `globPatterns` but left `navigateFallback` at vite-plugin-pwa's default of
 * 'index.html'. That default generates a Workbox NavigationRoute:
 *
 *     registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))
 *
 * Since index.html is no longer precached, that handler throws at runtime:
 *
 *     Uncaught (in promise) non-precached-url {"url":"index.html"}
 *
 * On a fresh visit (no warm SW yet) this surfaces as the SPA failing to route
 * — a recipient opening a shared /letter/<uuid> link gets "Page not found"
 * instead of the letter. localhost never reproduces it (the dev server has no
 * production service worker), which is exactly why static checks, tsc, and
 * unit tests all missed it — the same blind spot as the P863/P865 CSP class.
 *
 * The invariant this canary locks: if index.html is excluded from the precache
 * (the P838 decision), the SW config MUST disable the navigation fallback
 * (`navigateFallback: null`) so no NavigationRoute is bound to a non-precached
 * URL. Re-adding index.html to the precache would also satisfy the invariant,
 * so this test accepts either fix and only fails on the broken combination.
 *
 * Sibling of the P865 vercel.json canary. Complementary runtime gate (fetch the
 * deployed /sw.js and assert no createHandlerBoundToURL to a non-precached URL)
 * is added in /fix as the post-deploy backstop — see P864 spec.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Extract the `workbox: { ... }` options block from vite.config.ts as text. */
function loadWorkboxConfigBlock(): string {
  const path = resolve(process.cwd(), 'vite.config.ts');
  const raw = readFileSync(path, 'utf-8');
  const start = raw.indexOf('workbox:');
  expect(start, 'vite.config.ts must contain a workbox config block').toBeGreaterThan(-1);
  // Grab a generous window after `workbox:` — large enough to include the
  // whole option object (globPatterns, navigateFallback, runtimeCaching).
  return raw.slice(start, start + 1500);
}

describe('P864: SW navigation fallback must not bind to a non-precached URL', () => {
  const workbox = loadWorkboxConfigBlock();

  // Whether index.html is precached: globPatterns includes an html glob.
  const precachesHtml = /globPatterns\s*:\s*\[[^\]]*html[^\]]*\]/.test(workbox);

  // Whether the navigation fallback is explicitly disabled.
  const navFallbackDisabled = /navigateFallback\s*:\s*null/.test(workbox);

  it('does not bind a navigation fallback to a non-precached index.html', () => {
    // The bug: html excluded from precache AND navigateFallback left at its
    // 'index.html' default → NavigationRoute throws non-precached-url at runtime.
    expect(
      precachesHtml || navFallbackDisabled,
      'Workbox would bind the navigation fallback to a non-precached index.html ' +
        '(throws `non-precached-url` at runtime → fresh visitors get "Page not found" ' +
        'on deep links like /letter/<uuid>). Fix: set `navigateFallback: null` in the ' +
        'workbox config (navigation is already handled by the NetworkFirst app-shell ' +
        'route), or re-add index.html to globPatterns. Current workbox block does neither.',
    ).toBe(true);
  });
});
