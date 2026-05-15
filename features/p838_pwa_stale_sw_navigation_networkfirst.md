---
status: in-progress
type: task
rank: 1000768.0
created_date: '2026-05-15'
tags: [pwa, service-worker, infrastructure, deploy]
delivery_stage: dev
pipeline_ran: [create-spec, challenge-prd, dev]
---

# P838: PWA stale service worker — index.html precache hangs splash / 404s routes after deploy

## Problem

**Situation:** PWA built with `vite-plugin-pwa` (Workbox) precaches `index.html` via `globPatterns: ['**/*.{js,css,html,svg,woff,woff2}']` (`vite.config.ts:169`). On cold-launch, the SW serves the precached shell instantly — before the `autoUpdate` SW activation completes. The cached `index.html` references hashed JS chunks from the build it was cached during.
**Complication:** Two incidents in 24h, same root cause family, different symptoms:
1. **2026-05-15 (yesterday)** — mobile-Brave reported `NotFoundDrift` 404 on a `/letter/<uuid>` magic link. Route exists in `App.tsx:710`. Desktop loaded fine. Cause: precached old `index.html` from before `/letter/:id` was registered, old bundle had no matching route. (See `docs/decisions.md` 2026-05-15 §"Catch-all 404 on a registered SPA route".)
2. **2026-05-15 (today)** — Android PWA hung on splash ("C" icon) when opening a magic link. Browser worked. Cleared site data → fixed. Cause hypothesized: precached `index.html` references chunk hashes that 404 on the deployed CDN, JS never executes, React never mounts.
**Question:** How do we eliminate the "stale precached shell" failure class so deploys don't strand PWA users until they manually clear site data?

## Appetite

Medium blast radius — touches every PWA cold-launch on every deploy. Fully reversible (single config file, git revert restores precache behavior). Low decision density — NetworkFirst-for-navigation is a standard Workbox pattern; no novel trade-offs.

## Solution

Two changes in `vite.config.ts` workbox config:

1. **Drop `html` from `globPatterns`** so `index.html` is no longer precached.
2. **Add `runtimeCaching` entry for navigation requests** with `NetworkFirst` strategy and a short cache fallback for offline:
   - `urlPattern: ({ request }) => request.mode === 'navigate'`
   - `handler: 'NetworkFirst'`
   - Cache name: `app-shell`
   - Network timeout: ~3s before falling back to cache

Result: every cold-launch fetches fresh `index.html` when online (≤50ms overhead). Offline users still get a usable shell from cache. Old chunks referenced by stale shells are no longer served.

The existing `navigateFallback: '/index.html'` stays — it now resolves through the runtime cache, not the precache.

## Risks / Non-Goals

### Risks
- **Offline-first regression.** Currently the precached shell guarantees offline launch. With NetworkFirst, an offline cold-launch on a device that has never visited online would fail. Mitigation: NetworkFirst falls back to cache after timeout; first-visit-while-offline is already an edge case (the PWA install requires an online visit to register the SW).
- **Network timeout tuning.** Too short (1s) → flaky networks fall back to cache unnecessarily, defeating the fix. Too long (10s) → users wait on bad networks. Recommended: 3s — Workbox default, validated in production at scale.
- **CDN cache TTL on `index.html`.** If Vercel/CDN serves stale `index.html` with long TTL, the SW fix is moot. Mitigation: verify Vercel `Cache-Control` for `index.html` is `no-cache` or `max-age=0` (already SPA-default, but confirm).

### Non-Goals
- Do NOT change the SW registration pattern (`autoUpdate`, `skipWaiting`, `clientsClaim` stay as-is).
- Do NOT add a manifest version bump or force-update mechanism — NetworkFirst on navigations makes that unnecessary.
- Do NOT add user-facing "new version available" banners — out of scope for this fix.
- Do NOT modify `runtimeCaching` rules for images, fonts, Supabase, or analytics — only add the navigation rule.
- Do NOT introduce a new dependency (everything available in current Workbox version).

### Alternatives Considered
- **Manifest version bump on every deploy** — forces SW reinstall but doesn't solve cold-launch race; users still hit stale shell once before the new SW activates.
- **Cache-bust `index.html` filename** (`index.html?v=<hash>`) — Vite/Vercel don't support this for the SPA entry; would require build-time scripting.
- **NetworkOnly for navigations** — kills offline launch entirely. NetworkFirst is the correct trade-off.
- **Drop SW entirely / disable PWA** — loses install-to-home-screen, push notifications (future), offline. Too costly.
- **Add a SW update prompt with reload** — UX cost, doesn't help users who never see the prompt because they don't relaunch the PWA between deploys.

### Rollback Strategy
Revert the single commit modifying `vite.config.ts`. SW precache behavior returns to current state on next deploy. Currently-deployed SWs auto-update on next launch. No data migration, no schema change.

## Done-When

- [ ] `vite.config.ts` workbox config no longer precaches `index.html` (verified by inspecting build output `dist/sw.js` — `__WB_MANIFEST` does not list `index.html`)
- [ ] `vite.config.ts` workbox config has `runtimeCaching` entry for navigation requests with `NetworkFirst` handler
- [ ] After deploying a build with new chunk hashes, an installed PWA cold-launch fetches fresh `index.html` from network (verified via Chrome DevTools → connect Android device → Network tab shows `index.html` from network, not `(ServiceWorker)`)
- [ ] Offline cold-launch (after one prior online visit) still renders the app shell (verified via DevTools throttling → offline → relaunch)
- [ ] No regression in Lighthouse PWA score (still installable, still passes offline check)
- [ ] Magic link to `/letter/<uuid>` opens correctly in installed PWA after a fresh deploy without requiring site-data clear

## Reproduction Status

**Not reproduced in controlled environment.** Evidence is indirect:
- Two user reports (NotFoundDrift 404 on letter route; splash hang on magic link) consistent with stale shell hypothesis
- Clearing site data resolved both
- Workbox precache config (`vite.config.ts:169`) confirmed to include `html`

**Mechanism (chunk-hash 404) is hypothesized but not directly observed.** Fix is structurally correct regardless of which precache artifact 404s — NetworkFirst on navigations eliminates the entire class.

If reproduction is desired before shipping: deploy a no-op change → install PWA on Android → wait for next deploy → cold-launch PWA → connect Chrome DevTools → observe network tab. Cost: 1-2 deploy cycles delay.
