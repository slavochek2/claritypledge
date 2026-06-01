---
status: week
type: bug
rank: 1000765
severity: high
workstream: C1
date_reported: '2026-06-01'
created_date: '2026-06-01'
tags: [csp, security, analytics, session-replay, regression]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P863: CSP blocks session-replay workers + Mixpanel recorder fetch in production

## Summary

The enforcing CSP in `vercel.json:109` has no `worker-src` directive and omits `https://cdn.mxpnl.com` from `connect-src`, so LogRocket/Mixpanel session-replay workers (loaded from `blob:`) and the Mixpanel recorder bundle fetch are both blocked in production. Session-replay/analytics data is silently lost for every browser user. Sibling of P805 — same root: the Apr 4 Report-Only → enforce flip (`c64dfd81`) was not audited against worker contexts and all outbound-fetch destinations.

## Root Cause

`vercel.json:109` defines the enforcing `Content-Security-Policy` for the `/(.*)` route. Two gaps:

1. **No `worker-src` directive.** Per CSP spec, `worker-src` falls back to `script-src` when unset. `script-src` is `'self' 'unsafe-inline' https://cdn.mxpnl.com https://cdn.lr-in-prod.com https://js.sentry-cdn.com` — no `blob:`. LogRocket and the Mixpanel session recorder create web workers from `blob:` URLs, so those worker loads are blocked. The browser confirms the fallback explicitly: *"Note that 'worker-src' was not explicitly set, so 'script-src' is used as a fallback."*

2. **`cdn.mxpnl.com` is in `script-src` but absent from `connect-src`.** The Mixpanel session recorder fetches its recorder bundle (`mixpanel-recorder-*.min.js`) via `fetch()`, which is governed by `connect-src`, not `script-src`. The fetch is blocked before leaving the browser.

Both are the worker/recorder slice of the same audit gap that produced P805: `c64dfd81` (Apr 4) flipped the header from `Content-Security-Policy-Report-Only` to enforcing without auditing worker contexts or the full outbound-fetch destination list.

## Reproduction Steps

1. Open `https://claritypledge.com` (any page; observed on `/letter/...`) in a fresh browser profile
2. Open DevTools → Console
3. Observe CSP violation errors (below) on load

**Reproduction rate:** 100% on prod (post-Apr-4 CSP enforce flip)

## Expected Behavior

LogRocket and Mixpanel session-replay workers load from `blob:` URLs without CSP violation; the Mixpanel recorder bundle fetch to `https://cdn.mxpnl.com` succeeds. Console shows zero CSP violations attributable to worker creation or the recorder fetch. Session-replay data is captured.

## Actual Behavior

Console (prod, screenshot 2026-06-01):

- `Creating a worker from 'blob:...' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline' https://cdn.mxpnl.com https://cdn.lr-in-prod.com https://js.sentry-cdn.com". Note that 'worker-src' was not explicitly set, so 'script-src' is used as a fallback. The action has been blocked.`
- `Connecting to 'https://cdn.mxpnl.com/libs/mixpanel-recorder-861POiHc.min.js' violates the following Content Security Policy directive: "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://storage.googleapis.com https://api-eu.mixpanel.com https://*.sentry.io https://*.lr-in-prod.com https://api.web3forms.com https://api.unsplash.com". The request has been blocked.`
- `LogRocket: script mixpanel-recorder-...min.js could not load. Check that you have a valid network connection.`

Session-replay tools fail silently — no user-facing error, core letter/pledge flow renders normally.

## Affected Files

- `vercel.json` line 109 — `/(.*)` route `Content-Security-Policy` header (the enforcing CSP). Missing `worker-src`; `connect-src` missing `https://cdn.mxpnl.com`.
- `src/tests/p805-csp-connect-src-gcs.test.ts` — existing CSP canary (parses `vercel.json`, asserts directive contents). Extend with assertions for `worker-src 'self' blob:` and `cdn.mxpnl.com` in `connect-src`.
- No app-code changes — single-config-file fix.

## Severity

**High** — session-replay/analytics data has been silently lost for every browser user since the Apr 4 CSP enforce flip. No user-visible error and core flows are unaffected, but a paid-for observability capability is non-functional in production with no workaround.

## Fix Approach

Single-file config change in `vercel.json:109` (the `/(.*)` route CSP only — do **not** touch the `/point/(.*)` or `/story/(.*)` `frame-ancestors` routes):

1. **Add a `worker-src 'self' blob:` directive.** This is the precise directive for worker contexts; once set, worker loads no longer fall back to `script-src`, so `blob:` workers are allowed. Narrower than adding `blob:` to `script-src`.
2. **Add `https://cdn.mxpnl.com` to `connect-src`** (adjacent to the existing `https://api-eu.mixpanel.com` entry). `cdn.mxpnl.com` is already trusted in `script-src`, so extending it to `connect-src` does not widen the trust domain.

Then extend `src/tests/p805-csp-connect-src-gcs.test.ts` with two assertions: the enforcing CSP contains a `worker-src` directive listing `blob:`, and `connect-src` contains `cdn.mxpnl.com`.

Risk: `worker-src ... blob:` permits workers from blob URLs site-wide. This is required by both session-replay SDKs and is standard for these tools; `script-src` retains its allowlist for non-worker script loads, so the script execution surface is unchanged.

## Out of Scope (separate follow-up)

A Workbox PWA precache error — `Uncaught (in promise) non-precached-url {"url":"index.html"}` (`workbox-*.js` / `PrecacheController.js`) — appears in the same console. Different subsystem (service-worker precache manifest), not CSP. File separately if it warrants a fix; not addressed here.

## Acceptance Criteria

- [ ] Prod DevTools Console shows zero CSP violations for worker creation (`Creating a worker from 'blob:'`) on page load `[post-deploy]`
- [ ] Prod DevTools Console shows zero CSP violations for the Mixpanel recorder fetch (`Connecting to 'https://cdn.mxpnl.com/...'`) `[post-deploy]`
- [ ] Unit canary: `src/tests/p805-csp-connect-src-gcs.test.ts` asserts the enforcing CSP contains `worker-src` with `blob:`
- [ ] Unit canary: same test asserts `connect-src` contains `cdn.mxpnl.com`
- [ ] No regression on any existing `connect-src` / `script-src` source (existing entries unchanged)
