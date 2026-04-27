---
status: all-done
type: bug
rank: 1000821
severity: medium
workstream: profile
date_reported: '2026-04-27'
created_date: '2026-04-27'
completed_at: '2026-04-27'
tags: [calibration, profile, slider, ux]
pipeline_ran: [create-bug, fix, ship]
---

# P823: Calibration slider axis inverted — "Underconfident" dot appears right of center

## Summary

The inline calibration bar on profile pages places the dot to the **right** of center when the label reads "Somewhat underconfident", which is visually backward — users expect "underconfident" (lacking confidence) to sit left of center, and "overconfident" (excess confidence) to sit right.

## Root Cause

`gapToPosition` in `calibration-display.tsx` maps `gap = actual − self`. Positive gap means the user's self-estimate was lower than actual (underconfident). The formula `((clamped + 3) / 6) * 100` maps positive gap → right (100%) and negative gap → left (0%), so underconfident lands on the right and overconfident on the left. This is the opposite of the intuitive axis where "lacking confidence" = left, "excess confidence" = right.

Additionally, `gapToPosition` is defined twice in the same file (lines 145–148 in `InlineCalibration` and lines 336–339 in `CalibrationBar`) — a DRY violation that means the fix must be applied in two places.

**Fix:** Change the formula to `((3 - clamped) / 6) * 100` (negate the gap direction) and promote `gapToPosition` to module scope so the fix applies once.

## Reproduction Steps

1. Navigate to any profile with ≥5 sessions (e.g. `claritypledge.com/p/slava`)
2. Observe the "Listening calibration" inline bar in the profile metadata section
3. Click the bar to open the tooltip
4. Tooltip reads "Somewhat underconfident"
5. Observe the blue dot position on the slider

**Reproduction rate:** 100% whenever `avgGap` is in range (0.5, 1] (Somewhat underconfident)

## Expected Behavior

Blue dot sits **left** of the center tick mark when the label is any variant of "underconfident". Center = "Well calibrated". Right of center = any variant of "overconfident".

## Actual Behavior

Blue dot sits **right** of center when the label reads "Somewhat underconfident", visually implying the person has above-average confidence when the label says the opposite.

## Affected Files

- `src/app/components/profile/calibration-display.tsx`
  - `InlineCalibration.gapToPosition` — lines 145–148
  - `CalibrationBar.gapToPosition` — lines 336–339

## Severity

**Medium** — no data is lost or feature broken; the visual representation contradicts the text label, which confuses users reading their own calibration score.

## Fix Approach

1. Promote `gapToPosition` to module-level (above all components) with corrected formula:
   ```ts
   const gapToPosition = (g: number) => {
     const clamped = Math.max(-3, Math.min(3, g));
     return ((3 - clamped) / 6) * 100;
   };
   ```
2. Remove the two duplicate local definitions.
3. Both `InlineCalibration` and `CalibrationBar` pick up the module-level function automatically.

No migration needed. No other components import `gapToPosition`.

## Acceptance Criteria

- [x] Profile with "Somewhat underconfident" label: blue dot sits **left** of center tick
- [x] Profile with "Well calibrated" label: blue dot sits **at** center tick
- [x] Profile with "Somewhat overconfident" label: blue dot sits **right** of center tick
- [x] `gapToPosition` defined once at module scope; no local definitions remain
- [x] No TypeScript errors (`tsc --noEmit` clean)
- [ ] No console errors on the profile page [post-deploy]
