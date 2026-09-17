---
status: qa
type: bug
rank: 1
workstream: ux
created_date: '2026-09-17'
tags: [mobile, navigation, css, bottom-nav]
disclosure: public
delivery_stage: fix
pipeline_ran: [fix]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: founder-report
---

# P1329: signed in on a phone, the open menu's last entries sit under the bottom nav

## Problem

Founder report, 2026-09-17, on /feed: signed in on a phone, the open hamburger menu ran under
the fixed bottom tab bar, and Settings / Log Out could not be reached.

## Root Cause

P1310 capped `.mobile-nav-panel` (`src/index.css`) at the viewport minus the top header only.
`BottomNav` (`bottom-nav.tsx`, `data-nav="bottom"`) renders only when signed in, is also
`position: fixed; z-50`, and comes later in the DOM, so it painted over the panel's last ~65px.
Measured before the fix at 375x667: panel bottom 667, bottom nav top 602.

## Solution

A `body:has([data-nav="bottom"]) .mobile-nav-panel` rule (plus its `dvh` twin) subtracts the
bottom nav's row (4rem), its 1px border and `safe-area-inset-bottom`. Keyed on the element's
presence, so focus routes and signed-out visitors keep the P1310 full-height cap.

## Acceptance Criteria

- [x] Signed in at 375x667 and 320x568, the panel ends at the bottom nav's top edge and its last entry is reachable above it — `e2e/p1329-mobile-menu-bottom-nav.spec.ts` failed before the fix (667 vs 602; 568 vs 503), passes after
- [x] No dead gap between panel and bottom nav (≤2px, same spec)
- [x] Signed out, no bottom nav, panel keeps full viewport height (control test in the same spec)
- [x] P1310 unit suite still passes (9/9)

## Risks / Non-Goals

- Not verified on a real iOS device; Playwright chromium only.
- Browsers without `:has()` (iOS Safari < 15.4) keep the pre-fix behaviour, no regression.

## Review

Adversarial review, gemini-3.8-flash (served model verified): SHIP, 0 defects.
Opus review skipped: single CSS rule with browser-measured evidence at both widths.