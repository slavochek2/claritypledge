---
status: in-progress
type: bug
disclosure: public
rank: 68
severity: low
date_reported: '2026-06-06'
created_date: '2026-06-06'
tags: [csp, security-headers, vercel]
delivery_stage: dev
pipeline_ran: [create-bug, dev]
---

# P907: X-Frame-Options DENY contradicts CSP frame-ancestors 'self'

## Summary

`vercel.json` sends `X-Frame-Options: DENY` on the `/(.*)` route while the same route's CSP sets `frame-ancestors 'self'` — two framing policies that disagree about same-origin framing.

## Root Cause

The two headers were added at different times and never reconciled. In every browser this app supports, CSP `frame-ancestors` takes precedence over `X-Frame-Options` when both are present, so the effective policy is `'self'` and the same-origin `/live` overlay iframe (`LetterLiveOverlay` framing `/live/:sessionCode`) works today. The DENY is dead config — but it reads as a contradiction in any security audit, and legacy user agents that honor XFO over CSP would block the same-origin overlay.

## Reproduction Steps

1. `curl -sI https://claritypledge.com/ | grep -i 'x-frame-options\|content-security-policy'`
2. Observe `X-Frame-Options: DENY` alongside `frame-ancestors 'self'` in the CSP

**Reproduction rate:** 100% (static config)

## Expected Behavior

Both headers express the same policy: same-origin framing allowed, cross-origin framing blocked — i.e. `X-Frame-Options: SAMEORIGIN`.

## Actual Behavior

`X-Frame-Options: DENY` claims no framing at all, contradicted by the CSP and by the app's own `/live` overlay iframe.

## Affected Files

- `vercel.json` — `X-Frame-Options` header on the `/(.*)` route (adjacent to the CSP header line)

## Severity

**Low** — zero runtime effect in supported browsers (CSP wins); audit-clarity and legacy-UA correctness only.

## Fix Approach

One-token change: `"DENY"` → `"SAMEORIGIN"` on the `/(.*)` route in `vercel.json`. Extend a CSP/headers unit test (pattern: `src/tests/p906-csp-frame-src-calendar.test.ts`) to assert XFO and `frame-ancestors` agree.

Deferred from P906 (QA-gate decision: keep the calendar fix's blast radius to the bug; security-header changes get their own reviewed change).

## Acceptance Criteria

- [x] `/(.*)` route configured to send `X-Frame-Options: SAMEORIGIN` — *`vercel.json` `/(.*)` block now `SAMEORIGIN`, asserted by `src/tests/p907-xfo-frame-ancestors-agree.test.ts` (red on `DENY`, green after). The prod-observable half is tracked as a post-push check, see § Post-push checks.*
- [x] CSP `frame-ancestors 'self'` unchanged — *`git diff vercel.json` touches only the XFO value line; `frame-ancestors 'self'` asserted by p907 + p906 + p1285 tests (19/19 green across the four CSP test files)*
- [x] Unit test asserts the two headers agree — *`src/tests/p907-xfo-frame-ancestors-agree.test.ts`: every `vercel.json` header block that sets both XFO and a CSP `frame-ancestors` must map `'none'`↔`DENY`, `'self'`↔`SAMEORIGIN`, anything else → no XFO. Red against the old `DENY` (2 failed: "X-Frame-Options DENY contradicts CSP frame-ancestors 'self' (expected SAMEORIGIN)"), green after the fix (3/3). Second control: a lowercase `x-frame-options` added to `/point/(.*)` (`frame-ancestors *`) fails with "cannot be expressed in X-Frame-Options"; mutation reverted.*
- [x] `/live` overlay iframe still allowed by the framing policy (same-origin framing intact) — *overlay src is relative (`/live/${sessionCode}` in `letter-live-overlay.tsx`), i.e. same-origin, which both `SAMEORIGIN` and `frame-ancestors 'self'` permit; the change only loosens XFO from DENY to SAMEORIGIN, so no previously-allowed framing becomes blocked. No local browser test can observe it (local Vite sends no security headers; Chromium ignores XFO when CSP `frame-ancestors` is present) — the prod render is a post-push check below.*

## Post-push checks

Prod-only observations, not completion criteria — tracked in the task inbox so they are not lost when this spec closes:

1. `curl -sI https://claritypledge.com/ | grep -i x-frame-options` → `SAMEORIGIN`.
2. Open a letter's live overlay on prod and confirm the `/live` iframe renders.
