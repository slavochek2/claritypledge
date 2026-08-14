---
status: backlog
type: bug
rank: 68
severity: low
date_reported: '2026-06-06'
created_date: '2026-06-06'
tags: [csp, security-headers, vercel]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

- [ ] `/(.*)`  route sends `X-Frame-Options: SAMEORIGIN`
- [ ] CSP `frame-ancestors 'self'` unchanged
- [ ] Unit test asserts the two headers agree
- [ ] `/live` overlay iframe still renders (same-origin framing intact)
