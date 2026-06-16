---
status: week
type: bug
rank: 1000938.0
severity: medium
workstream: landing
date_reported: '2026-06-17'
created_date: '2026-06-17'
tags: [nav, webinar, cta, landing]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P945: Nav CTA flips to "Try a Clarity Letter" after clicking "Join free webinar" on the main landing

## Summary

When a logged-out visitor clicks "Join free webinar" in the nav on `/`, they land on `/events/list?series=lost-cofounders` — but the nav CTA immediately switches to "Try a Clarity Letter", creating a confusing experience for a user who just came from the main landing.

## Root Cause

`LoggedOutPrimaryCta` in `src/app/components/layout/simple-navigation.tsx` (line 48) shows "Join free webinar" only when `pathname === "/"`. When the user navigates to `/events/list?series=lost-cofounders`, `pathname` becomes `/events/list`, which fails the check — so the CTA falls through to "Try a Clarity Letter".

Fix: extend the condition to `pathname === "/" || pathname === "/events/list"` so the webinar funnel pages keep the consistent CTA.

## Reproduction Steps

1. Open the app in a logged-out state
2. Navigate to `/`
3. Observe: nav CTA reads "Join free webinar"
4. Click "Join free webinar"
5. Observe: navigate lands on `/events/list?series=lost-cofounders`

**Reproduction rate:** 100%

## Expected Behavior

Nav CTA stays "Join free webinar" on `/events/list` (the webinar destination), consistent with where the user came from.

## Actual Behavior

Nav CTA switches to "Try a Clarity Letter" immediately upon landing on `/events/list`, even though the user just clicked the webinar CTA from the main landing.

## Affected Files

- `src/app/components/layout/simple-navigation.tsx` — `LoggedOutPrimaryCta`, line 48 — `pathname === "/"` condition too narrow

## Severity

**Medium** — visible UX confusion for all logged-out visitors who click the webinar CTA; no data loss or functional breakage.

## Fix Approach

One-line change in `LoggedOutPrimaryCta`:

```diff
- if (pathname === "/") {
+ if (pathname === "/" || pathname === "/events/list") {
```

## Acceptance Criteria

- [ ] On `/`, logged-out nav CTA shows "Join free webinar"
- [ ] After clicking "Join free webinar" and landing on `/events/list`, nav CTA still shows "Join free webinar"
- [ ] On `/coach` and all other routes, nav CTA shows "Try a Clarity Letter" (no regression)
- [ ] Mobile menu CTA follows the same logic
