---
status: qa
type: bug
rank: 1000766
severity: high
workstream: C1
date_reported: '2026-06-01'
created_date: '2026-06-01'
tags: [pwa, service-worker, workbox, console-error]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p864-sw-navigate-fallback.test.ts
  root_cause: "vite-plugin-pwa defaults navigateFallback:'index.html', generating a Workbox NavigationRoute via createHandlerBoundToURL('index.html'). P838 (5c37ab2f) removed index.html from the precache (globPatterns excludes html) but left the default, so the navigation fallback binds to a non-precached URL and throws non-precached-url on navigations. On a fresh load (no warm SW) this surfaces as the SPA failing to route — recipients opening a shared /letter/<uuid> link get 'Page not found'. Confirmed: deployed sw.js contains createHandlerBoundToURL('index.html') and the precache manifest has no index.html entry (only assets/index-*.js/css)."
  confidence: high
  surfaces_in_scope: [vite.config.ts-workbox-navigateFallback]
  reproduced_at: '2026-06-01'
---

# P864: Workbox precache "non-precached-url" error for index.html in prod console

## Summary

The prod console logs an uncaught promise rejection from the Workbox service worker: `Uncaught (in promise) non-precached-url {"url":"index.html"}`, originating in `workbox-*.js` / `PrecacheController.js`. Surfaced alongside the P863 CSP violations (screenshot 2026-06-01) but is a separate subsystem (PWA service-worker precache, not CSP). Severity and user impact are unconfirmed — this spec is primarily to track and triage, not a confirmed defect.

## Root Cause

**Confirmed (2026-06-01).** `vite-plugin-pwa` defaults `navigateFallback: 'index.html'` when the option is not set. In `generateSW` mode this emits a Workbox NavigationRoute:

```js
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")))
```

`createHandlerBoundToURL` requires its URL to be in the precache manifest. P838 (commit `5c37ab2f`, "NetworkFirst navigation — stop precaching index.html") removed html from `globPatterns` so the shell is served NetworkFirst — but did **not** also set `navigateFallback: null`. So the navigation fallback now binds to a URL that is no longer precached, and the handler throws `non-precached-url` whenever it is invoked.

Verified against the deployed artifact:
- `https://claritypledge.com/sw.js` contains `createHandlerBoundToURL("index.html")`.
- Its `precacheAndRoute([...])` manifest has **no** `index.html` entry — only `assets/index-*.js` / `assets/index-*.css` (different files).

## Reproduction Steps

**Confirmed user-facing (not just console noise):**
1. Fresh cookieless browser context (no warm service worker) → open a deep link, e.g. `https://claritypledge.com/letter/<public-uuid>`.
2. The SPA fails to route and renders the app's "Page not found" catch-all instead of the page. A second load (SW now warm) renders correctly.
3. With the SW active, the console logs `Uncaught (in promise) non-precached-url {"url":"index.html"}`.

**Why localhost is clean:** the dev server has no production service worker (and no CSP), so neither the `non-precached-url` throw nor the routing failure can occur — the app code/routing is identical. This is why the class is invisible to `tsc`, ESLint, `vite build`, and unit tests — same blind spot as the P863/P865 CSP class.

**Reproduction rate:** intermittent, tied to SW activation state — observed once on first fresh load (then clean on retry) and confirmed in the original prod console screenshot. The underlying misconfiguration is **deterministic** (always present in the build); only the moment the fallback handler fires is timing-dependent.

## Expected Behavior

Navigation requests are served by the NetworkFirst app-shell route (P838's intent); no NavigationRoute is bound to a non-precached URL; the console is free of `non-precached-url` errors and fresh deep-link loads route correctly.

## Actual Behavior

The navigation fallback handler throws `non-precached-url`, and on a fresh (cold-SW) load the deep-link navigation fails → "Page not found" for first-time visitors of shared links.

## Affected Files

- `vite.config.ts` — the `VitePWA({ workbox: { … } })` block. `globPatterns` excludes html (P838) but `navigateFallback` is left at its `'index.html'` default. **Single-point fix site.**

## Severity

**High** (was Low at triage). Confirmed user-facing: fresh visitors to shared deep links (`/letter/<uuid>`, `/agreements/:id`, `/p/:slug`) can get "Page not found" on first load. Growth depends on these shared links working for first-time recipients, so the blast radius is the entire public-link surface, not console noise.

## Fix Approach

Set `navigateFallback: null` in the workbox config. Navigation is already handled by the existing NetworkFirst `app-shell` runtime-caching rule (`request.mode === 'navigate'`), so removing the broken precache-bound NavigationRoute keeps P838's "always-fresh shell" behavior while eliminating the `non-precached-url` throw. (Re-adding index.html to the precache would also satisfy the invariant but reverts P838's intent.) Verify by building and grepping `dist/sw.js` for `createHandlerBoundToURL` (must be absent post-fix), then post-deploy on prod.

**Defense-in-depth (deferred — folds into P865):** a runtime gate that fetches the deployed `/sw.js` and asserts no `createHandlerBoundToURL(X)` where `X` is absent from the precache manifest — the SW sibling of P865's `csp-smoke` post-deploy gate, since static/unit checks can't see the deployed SW. **Not built standalone here:** it belongs in the same smoke harness as P865's CSP check (`e2e/csp-smoke.spec.ts` + `.github/workflows/csp-smoke.yml`), which is still uncommitted on P865's branch. Building a parallel harness now would duplicate that infra. This fix's static canary already locks the specific regression (navigateFallback ↔ precache consistency); the runtime gate adds coverage for *unknown-future* non-precached bindings and should land when P865's smoke harness merges.

## Acceptance Criteria

- [x] Root cause confirmed: `index.html` is missing from the precache manifest (P838) while `navigateFallback` defaults to `'index.html'`, so `createHandlerBoundToURL('index.html')` throws
- [x] Impact classified: **user-facing** — fresh-load deep-link routing failure, not benign console noise
- [x] Fix applied: `navigateFallback: null`; built `dist/sw.js` contains no `createHandlerBoundToURL` and no `NavigationRoute` (verified post-build); navigation still served by the NetworkFirst `app-shell` route
- [x] Canary `src/tests/p864-sw-navigate-fallback.test.ts` passes after fix; full unit suite green (2214 passed, no regression)
- [ ] Prod console shows zero `non-precached-url` errors on load `[post-deploy]`
- [ ] Fresh cookieless load of a `/letter/<uuid>` link renders the letter (not "Page not found") `[post-deploy]`

**Deferred (folds into P865 smoke harness — see Fix Approach):** runtime gate asserting the deployed `/sw.js` is free of non-precached navigation bindings.
