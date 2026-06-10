---
status: qa
type: bug
rank: 1000757.5
severity: medium
workstream: live
date_reported: '2026-04-24'
created_date: '2026-04-24'
tags: [live, celebration, journey-table, ui-honesty, p806-followup]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
date_resolved: '2026-06-10'
root_cause: FreeModeSuccess hard-coded value={10} in the final journey row, ignoring liveState.freeSliderCreator/Joiner
resolution: Added finalListenerConfidence/finalSpeakerBelief props; call site computes from liveState; 4-case canary with data-testid assertions
---

# P810: Celebration journey table renders "10/10 final" when stored state is asymmetric

## Summary

Discovered during P806 prod evidence gathering. Session `9f7f7fc7-79eb-4f5b-b559-53de080744c3`: `live_state.freeSliderCreator=6` (listener actually at 6, not 10), but the success-screen journey table renders a synthesized "10/10 final" row. The UI lies about what's stored.

This masked the badge-not-firing bug from the user (P806): they see "perfect 10/10!" headline so they assume the badge fired, when actually no `badge_points` row was inserted.

## Root Cause

The free-mode success-screen journey-table component synthesizes a "final 10/10" row independently of the stored slider values. The data displayed should reflect actual confirmed state, not be invented to make the celebration UI consistent.

(Investigation needed to identify the exact synthesis code — likely in `src/app/components/partners/free-mode-success.tsx` or its journey-table sub-component.)

## Reproduction Steps

1. Start a /live session in free mode with two users
2. Both users slide to 10 (mutual 10/10) → celebration screen renders
3. One user slides back to 6 (listener-side intermittent variant of P806 Path F)
4. Check `live_state.freeSliderCreator` in DB → 6
5. Observe celebration screen still shows "10/10" in the journey table

**Reproduction rate:** Requires Path F race condition — currently rare in dev but observed in prod (session `9f7f7fc7`)

## Expected Behavior

The journey table renders the actual stored slider values. If state is asymmetric (e.g., 10/6), the table reflects that. The user sees the truth — either the round is celebrated based on real values, OR the celebration is gated correctly on actual mutual 10.

## Actual Behavior

Journey table synthesizes a "final 10/10" row regardless of actual state, presenting falsely calibrated data on the celebration screen.

## Affected Files

Suspected:
- `src/app/components/partners/free-mode-success.tsx` — celebration screen
- Sub-component(s) responsible for the journey-table synthesis

## Severity

**Medium** — UI honesty bug. Doesn't break functionality, but masks other bugs (like P806's badge-not-firing) by making asymmetric state look symmetric. Founder cannot tell from the UI alone whether badge logic worked.

## Fix Approach

Audit the journey-table render logic. Replace synthesized values with stored `freeSliderCreator`/`freeSliderJoiner`. If state is asymmetric at celebration time, either fix the upstream gate (don't show celebration unless mutual 10) OR render asymmetric values honestly.

## Acceptance Criteria

- [x] Journey table on free-mode celebration screen renders actual stored slider values
- [x] Asymmetric state (e.g., 10/6) does not render as "10/10 final"
- [x] No regression on the symmetric (true 10/10) celebration path
- [x] Canary test asserts the lie cannot recur for asymmetric state
