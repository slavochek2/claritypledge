---
status: all-done
type: bug
rank: 23
severity: low
workstream: events
date_reported: '2026-10-07'
created_date: '2026-10-07'
drafted_by: opus
exec_model: opus
exec_effort: medium
tags: [events, header, mobile, e2e]
disclosure: public
pipeline_ran: [create-bug, dev, ship]
completed_at: 2026-10-07
---

# P1434: "Today's event" header button crowds the logo at 375px; header E2E leaks other events

## Summary

P1433 follow-up. Signed in on an event day at 375px, the header's labelled "Today's event" button
sits under 4px from the ClarityPledge logo. Separately, `e2e/p1351-header-contexts` was not isolated
from the shared test DB, so any prep-enabled event in its window broke the signed-out assertions.

## Root Cause

1. `TonightsEventCta` (`src/app/components/layout/simple-navigation.tsx`) shows the label from
   `min-[375px]`. P1433 measured 360 (collides) and 375 signed out, but never 375 signed in, where
   logo + button + Tools + avatar leave under 4px. The E2E that would have caught it never ran
   (Playwright's bundled Chromium crashes on this macOS).
2. P1433 D2 shows ANY prep-enabled in-window event to a non-registered viewer. On the shared test DB a
   leftover "P1433 Demo Clarity Night" event made the signed-out "no button" checks fail.

## Reproduction Steps

1. Signed in, RSVP'd to an event today, viewport 375×667.
2. Open `/feed`.
3. Observe: "Today's event" button touches the logo. E2E reports
   `loggedin-event-feed @ 375: "ClarityPledge" collides with "Today's event" (under 4px apart)`.

**Reproduction rate:** 100%

## Expected Behavior

At least a 4px gap between all header controls at every width; the label shows only where it fits.

## Actual Behavior

Under 4px gap at 375 signed in.

## Affected Files

- `src/app/components/layout/simple-navigation.tsx` — `TonightsEventCta` label breakpoint
- `e2e/p1351-header-contexts.spec.ts` — widths, test-DB isolation

## Severity

**Low** — cosmetic crowding on 375px phones, only on an event day.

## Fix Approach

Label breakpoint 375 → 390 (icon-only below; accessible name unchanged). In the E2E: route-filter
the public window query to the run's own event, and add widths 390 and 412.

## Acceptance Criteria

- [x] Signed in on an event day, no header controls closer than 4px at 320, 360, 375, 390, 412 and desktop (`e2e/p1351-header-contexts` passes)
- [x] At 390px and up the button shows the "Today's event" label; below that, icon only
- [x] The header E2E passes regardless of other prep-enabled events in the test DB
- [x] (review) The header never shows a previous account's event — not after sign-out, not while a
      newly signed-in account's lookup is pending (`src/tests/p1434-tonights-event-account-switch.test.tsx`)
- [x] (review) The header E2E passes at any hour of the day (event created in a zone where it is ~noon)

## Verification (dev, 2026-10-07)

- E2E `e2e/p1351-header-contexts.spec.ts`: 4/4 pass at 320, 360, 375, 390, 412, desktop. Before the
  fix: `loggedin-event-feed @ 375` collision. Run with system Chrome (`channel: 'chrome'`, video off):
  Playwright's bundled Chromium and headless shell crash or are missing on this macOS.
- Unit: p1434 (account switch — failed before the fix), p1433, p1421, p1351, p1087: 111/111.
- Browser (local, test DB, signed out, in the window of a demo event): button replaces the marketing
  CTA; clicking opens `/events/<slug>/room`; the button hides there.
- Reviews (3 of 3 reported): Opus 0 HIGH/MEDIUM. Codex: stale account (fixed), E2E after 22:00 UTC
  (fixed), mounted header never refetches past midnight (pre-existing since P1351 — filed). Gemini:
  sign-out flash (fixed, same root cause), button on `/ready`/`/meet` (as decided in P1433 D1),
  earliest event wins (P1433 ACCEPT), `StaticNavLinks` declared in render (pre-existing — filed).
