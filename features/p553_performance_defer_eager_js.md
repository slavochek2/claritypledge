---
status: in-progress
type: task
rank: 250007.75
workstream: foundation
created_date: 2026-03-19
flow: dev
tags: [performance]
delivery_stage: 4-tests-ready
test_files:
  - e2e/p553-performance.spec.ts
---

# TASK: P553 — Performance: defer eager JS and optimize loading

## Goal

ClarityPledge loads too slowly. Root cause analysis identified 1.2MB of third-party JS (LogRocket 794KB + Mixpanel 436KB) loaded eagerly, 12 synchronously imported pages, render-blocking service worker registration, and missing preconnect hints. Fix the critical path.

## Root Cause (5 Whys)

1. Page is slow → browser downloads/executes ~2.5MB before interactive
2. So much JS upfront → 12 pages sync-imported, LogRocket+Mixpanel+Sentry init before render
3. Not lazy-loaded → early dev when app was small, never revisited
4. Analytics before first paint → Mixpanel inline in `<head>`, LogRocket in main.tsx before render
5. Not caught → no perf budget or Lighthouse CI

## Steps

### Phase 1 — Highest impact
1. **Defer LogRocket + Mixpanel**: load after `requestIdleCallback` or after LCP, not in critical path
2. **Lazy-import 12 pages** in App.tsx: convert synchronous imports to `React.lazy()`
3. **Add `<link rel="preconnect">`** to `<head>`: Supabase, Google Fonts, fonts.gstatic.com
4. **Defer `registerSW.js`**: currently render-blocking (+313ms)

### Phase 2 — Medium impact
5. **Set immutable cache headers** on hashed assets in vercel.json
6. **KaTeX fonts**: lazy-load with /manifesto route only (move CSS import inside component)

### Phase 3 — Consider
7. Auth check: show landing content while session resolves (AuthContext.tsx)
8. Evaluate LogRocket necessity — Sentry alone may suffice

## Metrics (pre-optimization baseline from Lighthouse)

- LCP: 918ms (lab, no throttling)
- FCP: ~620ms
- TTFB: 302ms
- Critical path latency: 1,848ms
- Third-party JS: 1.2MB (LogRocket 794KB + Mixpanel 436KB)
- Main bundle: 1MB (298KB gzip)
- registerSW.js: 313ms render-blocking

## Key Files

- `src/App.tsx:13-22` — 12 synchronous page imports
- `src/main.tsx:14-60` — LogRocket + Sentry eager init
- `index.html:83-95` — Mixpanel inline in `<head>`
- `src/auth/AuthContext.tsx:50-90` — auth session blocks render
- `src/app/pages/full-article-page.tsx:13` — KaTeX CSS import
- `vite.config.ts` — build config
- `vercel.json` — cache headers

## Done When

- [ ] LogRocket and Mixpanel deferred to after first paint
- [ ] All non-landing pages lazy-loaded
- [ ] Preconnect hints added for Supabase + Google Fonts
- [ ] registerSW.js deferred
- [ ] Hashed assets have immutable cache headers
- [ ] KaTeX fonts only load on /manifesto
- [ ] Lighthouse re-audit shows improvement
