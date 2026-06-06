---
status: qa
type: bug
rank: 1000794.0
severity: high
date_reported: '2026-06-06'
created_date: '2026-06-06'
tags: [csp, cm, calendar, embed]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
date_resolved: '2026-06-06'
root_cause: CSP default-src 'self' with no frame-src directive — browser fallback blocked framing calendar.google.com; dev serves no CSP header so it shipped unseen
resolution: frame-src 'self' https://calendar.google.com added to vercel.json; /cm added to PROD_HEALTH_ROUTES; page rebuilt calendar-dominant (single matchMedia-picked iframe, MONTH desktop / AGENDA mobile)
---

# P906: /cm calendar iframe blocked by CSP on prod

## Summary

The shipped `/cm` page (commit `fd578870`) renders a grey broken-document icon instead of the Google Calendar embed on prod — the site's CSP blocks framing `calendar.google.com` because no `frame-src` directive exists.

## Root Cause

The CSP header in `vercel.json` sets `default-src 'self'` and never declares `frame-src`. Per CSP spec, `frame-src` falls back to `default-src`, so the browser refuses to frame any external origin. Captured prod console error:

```
Framing 'https://calendar.google.com/' violates the following Content Security
Policy directive: "default-src 'self'". The request has been blocked. Note that
'frame-src' was not explicitly set, so 'default-src' is used as a fallback.
```

The bug shipped undetected because `npm run dev` (Vite) serves no CSP header — the embed worked locally and was never browser-verified on prod after deploy.

## Reproduction Steps

1. Open `https://claritypledge.com/cm` (no auth required)
2. Observe the calendar area: grey box with broken-document icon instead of calendar
3. Open DevTools console: CSP violation error for `https://calendar.google.com/`

**Reproduction rate:** 100%

## Expected Behavior

The Google Calendar embed renders inside the page showing upcoming Chiang Mai events, with no CSP violations.

## Actual Behavior

Iframe load is blocked by the browser; user sees an empty grey panel. The page's main content never renders.

## Affected Files

- `vercel.json` — line 114, `Content-Security-Policy` header value — missing `frame-src` directive
- `src/app/pages/chiang-mai-page.tsx` — layout (secondary, approved change): narrow `max-w-2xl` container, fixed `h-[600px]` iframe, oversized hero padding

## Severity

**High** — the page's sole purpose (showing the events calendar) is broken for 100% of prod visitors.

## Fix Approach

1. **CSP:** add `frame-src 'self' https://calendar.google.com` to the CSP value in `vercel.json`. One directive; no other directives change.
2. **Layout (approved by founder in same session):** make `/cm` calendar-dominant — compact header (small title + subscribe link, minimal padding), wide container, iframe height near full viewport (`h-[calc(100dvh-…)]`), MONTH view on desktop / AGENDA on mobile (responsive pair of embeds, hidden by breakpoint).
3. **Regression test:** unit test on `vercel.json` (pattern: `src/tests/p805-csp-connect-src-gcs.test.ts`) asserting the CSP contains an explicit `frame-src` directive that allows `https://calendar.google.com`.

## Acceptance Criteria

- [x] `vercel.json` CSP contains `frame-src` allowing `'self'` and `https://calendar.google.com`
- [x] Regression test passes: `src/tests/p906-csp-frame-src-calendar.test.ts` (failed against pre-fix CSP, passes after fix)
- [x] `/cm` layout is calendar-dominant: compact header, calendar fills most of the viewport at desktop and mobile widths (screenshots at 1440/375/320)
- [x] Desktop shows MONTH view; mobile shows AGENDA view (incl. live mode-switch test on matchMedia change)
- [x] Existing CSP tests (p805, p865) still pass (full suite 2325 passed)
- [ ] [post-deploy] Calendar visibly renders events on `https://claritypledge.com/cm` with zero CSP violations in DevTools console
