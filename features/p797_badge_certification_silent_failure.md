---
status: all-done
type: bug
rank: 1000795.0
severity: high
workstream: live
date_reported: '2026-04-22'
created_date: '2026-04-22'
date_resolved: '2026-04-18'
root_cause: "handleFreeRoundComplete guard checked own slider in confirmedLiveStateRef which lags 300ms behind localSliderValue (debounce). Guard always returned early before badge block ran."
tags: [badge, certification, live, rls]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p797-badge-certification.spec.ts
  root_cause: "P763 fix (commit 019a479b, 2026-04-18): handleFreeRoundComplete guard checked BOTH freeSliderCreator AND freeSliderJoiner in confirmedLiveStateRef. Own slider lags 300ms behind localSliderValue due to debounce, so the guard always returned early and the badge block never executed. P763 changed the guard to check only the PARTNER's slider (which arrives via Realtime and is committed synchronously)."
  confidence: high
  surfaces_in_scope: [clarity-live-page]
  reproduced_at: '2026-04-22'
  note: "Canary test PASSES — bug was fixed by P763 before this spec was filed. Test now serves as regression coverage for the P763 fix."
---

# P797: Badge certification silently fails — badge_points never inserted on prod

## Summary

In /live sessions, completing a 10/10 round as a certifier never inserts a `badge_points` row — `badgePointEarned` is always `false` despite all four award conditions being satisfied. The `badge_points` table on prod was empty.

## Root Cause

**Fixed by P763 (commit `019a479b`, 2026-04-18).**

The `handleFreeRoundComplete` guard checked BOTH sliders in `confirmedLiveStateRef`:

```javascript
// Pre-P763 (broken):
const creatorVal = current.freeSliderCreator ?? 0;
const joinerVal = current.freeSliderJoiner ?? 0;
if (creatorVal !== 10 || joinerVal !== 10) return;
```

The own-user slider (`freeSliderCreator` for the creator) lags 300ms behind `localSliderValue` due to the debounce in `handleFreeSliderChange`. When the creator drags last to 10, `localSliderValue=10` triggers `bothAtTen` → `onRoundComplete`, but `confirmedLiveStateRef.current.freeSliderCreator` is still 9 (debounce pending). The guard returns early. The badge block never runs. `badgePointEarned=false`.

P763 fixed this by checking only the PARTNER's slider:
```javascript
// Post-P763 (correct):
const partnerKey = isCreator ? 'freeSliderJoiner' : 'freeSliderCreator';
if ((current[partnerKey] ?? 0) !== 10) return;
```

The partner's slider arrives via Realtime and is committed synchronously to `confirmedLiveStateRef` — safe to check. The own slider is guaranteed at 10 by `bothAtTen` in `FreeModeView`.

## What Was Observed on Prod (Session `91002121`)

All four badge conditions were satisfied:
- `is_certifier = true` for Slava ✓
- `selectedStoryData.points[0].systemTags = ['st3', 'understanding', 'v1']` ✓
- `livePositionsJoiner = { 'cb114d49...': 'agree' }` ✓
- Both sliders at 10 ✓

Despite all conditions met, `badgePointEarned = false` — because `handleFreeRoundComplete` returned at the slider guard before ever reaching the badge block.

## Affected Files

- `src/app/pages/clarity-live-page.tsx` — `handleFreeRoundComplete` slider guard (fixed by P763)

## Severity

**High** — badge certification never worked on prod. Fixed by P763.

## Regression Test

`e2e/p797-badge-certification.spec.ts` — two-party E2E test covering the full badge certification flow. Both assertions pass:
1. Amber "Badge point earned!" headline visible on certifier's success screen
2. `badge_points` row inserted in DB with correct `user_id`, `point_id`, `verified_by`, `position`

## Acceptance Criteria

- [x] After both sliders reach 10/10 with listener `position='agree'` on `#understanding` point, amber "Badge point earned!" headline appears on certifier's success screen
- [x] A row is inserted into `badge_points` with correct `user_id`, `point_id`, `verified_by`, `session_id`, `position`
- [x] `badgePointEarned: true` written to `live_state` in DB
- [x] Canary test passes: `e2e/p797-badge-certification.spec.ts`
