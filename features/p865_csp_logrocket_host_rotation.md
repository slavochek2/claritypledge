---
status: today
type: bug
rank: 1000767
severity: high
workstream: C1
date_reported: '2026-06-01'
created_date: '2026-06-01'
tags: [csp, security, analytics, session-replay, logrocket, regression]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: e2e/csp-smoke.spec.ts
  canary_file: src/tests/p865-csp-logrocket-hosts.test.ts
  root_cause: "The enforcing CSP allowlists only one LogRocket CDN host (cdn.lr-in-prod.com). LogRocket rotates across ~12 CDN host families to evade ad-blockers; the SDK (v10.1.1) loaded its bundle from cdn.lgrckt-in.com, which is not in script-src, so the script-src directive blocked logger-1.min.js in production. Third instance of the same Apr-4 Report-Only→enforce audit gap (P805 connect-src, P863 worker-src + recorder fetch)."
  confidence: high
  surfaces_in_scope: [vercel.json-default-route-csp]
  reproduced_at: '2026-06-01'
---

# P865: CSP blocks LogRocket session replay — only 1 of ~12 rotating CDN hosts allowlisted

## Summary

The enforcing CSP on the `/(.*)` route (`vercel.json`) allowlists a single LogRocket CDN host (`cdn.lr-in-prod.com`). LogRocket **deliberately rotates the host it serves its bundle from** across ~12 CDN families (`lgrckt-in.com`, `lrkt-in.com`, `lr-ingest.io`, …) to evade ad-blockers. The SDK (v10.1.1) picked `cdn.lgrckt-in.com`, which is not in `script-src`, so `logger-1.min.js` was blocked in production and session replay silently stopped recording for every browser user.

Third instance of the same root: the Apr-4 Report-Only → enforce flip (`c64dfd81`) was audited host-by-host instead of against each SDK's full host pool. P805 (connect-src GCS) and P863 (worker-src + Mixpanel recorder fetch) were the prior two. Patching the one failing host each time loses to the next rotation — this fix allowlists the **whole LogRocket pool** and adds two runtime gates so the class self-surfaces instead of waiting for someone to open DevTools.

## Root Cause

`script-src` on the enforcing CSP listed `cdn.mxpnl.com`, `cdn.lr-in-prod.com`, `js.sentry-cdn.com`. LogRocket's bundle load is a `<script src>` (governed by `script-src`), and the SDK served it from `https://cdn.lgrckt-in.com/logger-1.min.js` — absent from the allowlist:

```
Loading the script 'https://cdn.lgrckt-in.com/logger-1.min.js' violates the
following Content Security Policy directive: "script-src 'self' 'unsafe-inline'
https://cdn.mxpnl.com https://cdn.lr-in-prod.com https://js.sentry-cdn.com".
The action has been blocked.
```

LogRocket's ingest/telemetry POSTs (governed by `connect-src`) fire only **after** the bundle loads, so the matching `connect-src` gap is latent — it would have surfaced on the next push as a new "still broken" report once the script host was fixed. Both are closed here together.

## Reproduction

- **Live:** Open `https://claritypledge.com/` in a fresh profile → DevTools console shows the violation above (100% repro on prod pre-fix).
- **Automated:** `CSP_SMOKE_URL=https://claritypledge.com npm run smoke:csp` fails on all 5 strict-CSP routes, each capturing the `cdn.lgrckt-in.com` block. (Run against prod pre-deploy: 5 failed — proves the gate catches the class.)

## Fix (four layers — defense in depth)

1. **`vercel.json` — allowlist the full LogRocket host pool.** Add all 12 LogRocket CDN hosts to `script-src` and all 13 wildcard ingest origins to `connect-src` (LogRocket CSP docs). `worker-src` already has `blob:` (P863), which is all LogRocket workers need. Stops the rotation whack-a-mole.
2. **`src/tests/p865-csp-logrocket-hosts.test.ts` — static canary.** Parses `vercel.json`, asserts every LogRocket host is present in `script-src`/`connect-src`. Locks the hosts we know about; reverting the fix fails the build. Sibling of P805/P863 canaries.
3. **`e2e/csp-smoke.spec.ts` + `npm run smoke:csp` — active runtime gate.** Loads the deployed strict-CSP routes in a real browser and fails on any CSP violation. The only thing that catches hosts we do **not** yet know about (the actual recurring failure mode). Runs post-deploy and on a 6-hour cron (`.github/workflows/csp-smoke.yml`) — LogRocket rotates hosts independently of our deploys, so prod can break with no commit from us.
4. **`api/csp-report.ts` + CSP `report-uri`/`report-to` — passive always-on backstop.** Browsers POST CSP violations to a same-origin proxy that forwards to Sentry, so a block surfaces as an alert from real users without anyone checking the console. Keeps the Sentry DSN out of this public repo (reads `SENTRY_CSP_REPORT_URL` from Vercel env).

## Why static checks never caught this

The CSP is a Vercel **response header**, not app code — the local dev server never applies it, so a localhost smoke (e.g. `app-boot-smoke.spec.ts`) sees no CSP. And which host the SDK picks is a **runtime** decision. So the entire class is invisible to `tsc`, ESLint, `vite build`, and unit tests. Only loading the deployed page in a browser surfaces it. That gap is what layers 3–4 close.

## Verification

- `npx vitest run src/tests/p865-*.test.ts src/tests/p863-*.test.ts src/tests/p805-*.test.ts` → 41 passed (no regression).
- `CSP_SMOKE_URL=https://claritypledge.com npm run smoke:csp` against **pre-deploy** prod → 5 failed, each on `cdn.lgrckt-in.com` (gate proven to catch the live bug). Re-run **after deploy** must go green.

## Operator note (one manual step)

Layer 4 needs `SENTRY_CSP_REPORT_URL` set in the Vercel project env (Sentry Security Header endpoint, derived from the existing DSN). Until set, the proxy accepts-and-drops reports (no error); layers 1–3 are fully active without it.

## Out of Scope

- P864 (Workbox `non-precached-url`) — separate PWA subsystem, tracked independently.
- Self-hosting/proxying LogRocket through our own domain (would avoid widening `script-src` to the vendor pool) — larger infra change; not warranted for a vendor we already trust with full session replay.
