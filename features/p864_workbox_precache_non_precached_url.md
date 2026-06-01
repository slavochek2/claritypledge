---
status: backlog
type: bug
rank: 1000766
severity: low
workstream: C1
date_reported: '2026-06-01'
created_date: '2026-06-01'
tags: [pwa, service-worker, workbox, console-error]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P864: Workbox precache "non-precached-url" error for index.html in prod console

## Summary

The prod console logs an uncaught promise rejection from the Workbox service worker: `Uncaught (in promise) non-precached-url {"url":"index.html"}`, originating in `workbox-*.js` / `PrecacheController.js`. Surfaced alongside the P863 CSP violations (screenshot 2026-06-01) but is a separate subsystem (PWA service-worker precache, not CSP). Severity and user impact are unconfirmed — this spec is primarily to track and triage, not a confirmed defect.

## Root Cause

**Under investigation.** Observed symptom only. The error comes from `createHandlerBoundToURL('index.html')` (a Workbox `registerRoute` / navigation-fallback handler) where `index.html` is not present in the generated precache manifest. Likely candidates to verify: the SW's `precacheAndRoute(self.__WB_MANIFEST)` manifest does not include `index.html` under that exact key (it may be precached as `/` or with a revision hash), so the navigation fallback's `createHandlerBoundToURL('index.html')` throws `non-precached-url`. Needs verification against the actual SW build output and the Workbox/Vite PWA config.

## Reproduction Steps

1. Open `https://claritypledge.com` in a browser with the service worker active
2. Open DevTools → Console
3. Observe: `Uncaught (in promise) non-precached-url {"url":"index.html"}` (from `workbox-*.js`, `PrecacheController.js`)

**Reproduction rate:** Observed on prod (rate not yet quantified — depends on SW state / navigation).

## Expected Behavior

The navigation fallback resolves to the precached app shell without an uncaught rejection; the console is free of Workbox `non-precached-url` errors.

## Actual Behavior

An uncaught promise rejection is logged. Whether this degrades offline behavior (navigation fallback failing) or is benign console noise (network fallback still serves the page) is **not yet confirmed** — part of the investigation.

## Affected Files

- Service-worker / PWA build config — suspected area (Vite PWA plugin / Workbox config; the `createHandlerBoundToURL('index.html')` registration). Exact file to be located during investigation.

## Severity

**Low** — no confirmed user-facing breakage; core flows render normally. Could be benign console noise or a degraded offline fallback. Triage to confirm impact before investing in a fix.

## Fix Approach

Investigation first (use `/reproduce`): confirm whether `index.html` is in the precache manifest and what key it uses; determine whether the navigation fallback should bind to `/` or the hashed shell entry. Decide fix vs. accept-as-noise based on confirmed impact.

## Acceptance Criteria

- [ ] Root cause confirmed: whether `index.html` is missing from the precache manifest and why `createHandlerBoundToURL` is called with that key
- [ ] Impact classified: degraded offline fallback (fix required) vs. benign console noise (accept + suppress)
- [ ] If fixed: prod console shows zero `non-precached-url` errors on load `[post-deploy]`
