---
status: all-done
type: bug
rank: 27
severity: medium
date_reported: 2026-10-05
created_date: 2026-10-05
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [meet, mobile, header, layout]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix, ship]
completed_at: 2026-10-05
---

# P1422: /meet — header Tools button overlaps the level track on phones

## Summary

On /meet below the `lg` breakpoint, the header's labeled Tools button (P1351) covers the third stop of the Clarity Meeting Principle level track, which P1016 portals into the nav row's centre slot.

> "tools overlaps the selection of a mobile selection of type of clarity meeting principle and I don't know if maybe we switch it a bit down" (the founder)

## Root Cause

`meeting-terms-page.tsx` portals `LevelTrack` into `#nav-center-slot` (`simple-navigation.tsx`) at every width. The slot is absolutely positioned and reserves `px-14` per side, which was tuned for a bare hamburger on the right. P1351 later made the right-hand control a labeled `Tools` button (85px wide), which is wider than the reserved gutter. /meet is the only consumer of the slot (verified by grep for `NAV_CENTER_SLOT_ID`), so the defect is confined to this page.

Measured (chrome-devtools emulate, `innerWidth` confirmed): at 375px stop 3 spans x 226–303 and Tools spans 274–359, which is 29px of overlap. At 320px stop 3 spans 211–275 and Tools spans 219–304, which is 56px of overlap.

## Reproduction Steps

1. Signed out, open `/meet` at 375px or 320px width.
2. Observe that "Explain back" (stop 3) renders under the Tools button.

**Reproduction rate:** 100%

## Expected Behavior

No stop intersects Tools at any width. Below `lg`, the track sits on its own row beneath the header, as the founder suggested. Desktop is unchanged.

## Actual Behavior

Stop 3's dot and label are partially covered by the Tools button.

## Affected Files

- `src/app/pages/meeting-terms-page.tsx`: the nav-slot portal effect.
- `src/app/components/layout/simple-navigation.tsx`: the centre slot (unchanged).

## Fix Approach

Portal into the nav slot only while `(min-width: 1024px)` matches. Below that width, use the page's in-page sticky row, with its offset matching the fixed nav's: `env(safe-area-inset-top)` always, plus 1.75rem while the P1369 offline strip shows (the same offsets as `room-capture-bar.tsx`). The shared slot's padding stays untouched, consistent with the P1114 note in `simple-navigation.tsx`.

## Acceptance Criteria

- [x] At 375px and 320px no level stop intersects the Tools button, and the page has no horizontal scroll. Covered by `e2e/p1422-meet-tools-overlap.spec.ts`, which failed before the fix (2 of 3) and passes after.
- [x] At 1280px the track remains in the nav row and clears Tools.
- [x] On phones the track stays pinned below the nav's bottom edge after scrolling ~600px, including with a 47px iOS status-bar inset (CDP `Emulation.setSafeAreaInsetsOverride`) and with the offline strip showing. Covered by the three scroll tests in `e2e/p1422-meet-tools-overlap.spec.ts`; the inset and offline cases failed before the offset fix.