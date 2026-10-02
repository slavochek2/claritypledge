---
status: in-progress
type: bug
rank: 18
severity: medium
workstream: events
date_reported: '2026-10-02'
created_date: '2026-10-02'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
reproduce_artifact:
  test_file: e2e/p1387-mobile-prep-one-page.spec.ts
  observed_red: 'first card viewport ratio 0 after the dimmed tap, at 390 and 375'
  confidence: high
tags: [events, preparation, mobile]
disclosure: public
delivery_stage: fix
pipeline_ran: [create-bug, fix]
related: [p1387, p1336]
---

# P1391: Tapping the dimmed Continue on a points step says "answer all points" but shows none of them

## Summary

On the preparation's points steps (value perception, positions), tapping the dimmed Continue on a
phone shows "Set your position on all N points to continue." inside the pinned bar, but no
unanswered point is on screen, so the person is told to answer without seeing where.

## Root Cause

P1387 made Continue the main action, dimmed until every point is answered, with a tap showing the
hint (founder, 2026-10-02). The tap only sets the hint; it never moves the page. On a 375 or 320
phone the step is 4-5 screens long and the person is usually at the top or bottom, away from the
first unanswered point. Found by the Opus final-round review (screenshot of the dimmed tap at
320x568: the bar grows to 38% and no ✗ / ? / ✓ row is visible).

## Reproduction Steps

1. Signed-in registrant on a phone (Playwright iPhone 13, or 375x667), prep-enabled Clarity Night.
2. Open the preparation, reach the value-perception points step, answer none.
3. Scroll to the bottom and tap the dimmed Continue.
4. Observe: the hint appears; no unanswered point card is in the viewport.

**Reproduction rate:** 100% when the first unanswered point is off screen.

## Expected Behavior

The same tap also scrolls the first unanswered point into view, so the hint and the thing to do are
on screen together.

## Actual Behavior

Only the hint appears, in the pinned bar; the page does not move.

## Affected Files

- `src/app/prototypes/events/prep/EventPrepPage.tsx` — `statementsBar` (dimmed Continue, `answerHint`)
- The point cards rendered by the points steps (suspected: StakePage / statement card components) — need a way to find the first unanswered one

## Severity

**Medium** — every registrant passes these steps on 6 Oct; the dimmed tap is the moment they try to move on.

## Fix Approach

On the dimmed tap, find the first point card without an answer and `scrollIntoView({ block: 'center', behavior: 'smooth' })`, keeping the hint.

## Resolution

**date_resolved:** 2026-10-02. The dimmed tap now also scrolls the first unanswered card (in the order shown) to the centre of the screen; cards carry `data-point-id`. Red before (viewport ratio 0), green after at 390 and 375, on both points steps.

## Acceptance Criteria

- [x] On a 390 and a 375 phone, tapping the dimmed Continue on the value-perception step shows the hint AND brings an unanswered point into the viewport
- [x] Same on the positions step
- [x] Regression test passes: `e2e/p1387-mobile-prep-one-page.spec.ts`
