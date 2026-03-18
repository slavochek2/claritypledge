---
status: week
type: change-request
rank: 125002.375
workstream: E1
created_date: 2026-03-17T00:00:00.000Z
predecessor: p152
flow: dev
tags:
  - profile
  - calibration
  - ux
---

# P539 — Calibration Zero-State Redesign

## Problem

The current calibration empty state on profile pages shows the same gray calibration bar (track + center marker) without the blue dot. At zero sessions, this looks like 50% progress — users cannot distinguish "no data" from "mid-calibration." The design is misleading and provides no sense of progression toward the calibration threshold.

## Current State

`InlineCalibration` in `calibration-display.tsx` renders the same bar UI for both `null` (no data) and calibrated states — the only difference is the absence of the blue dot. The `toUserCalibration()` function in `profile-page-v2.tsx` (line ~130) returns `null` when status is `insufficient`, discarding the `sessionsCompleted` count that the API already provides in `CalibrationResult`.

## Root Cause

The original P152 implementation treated "insufficient data" as a single state with no visual distinction from zero sessions. There was no progressive disclosure — the component jumps from "empty bar" to "calibrated bar" with nothing in between, giving users no feedback on their progress toward the 5-session threshold.

## Redesign

Replace the empty bar with segmented dots that fill as sessions accumulate (0–4). At ≥5 sessions, the dots disappear and the existing calibration bar with blue dot appears (unchanged).

```
STATE A: Zero sessions
  👂 Understanding Calibration
  ○ ○ ○ ○ ○  5 sessions to unlock

STATE B: Partial (e.g., 2/5)
  👂 Understanding Calibration
  ● ● ○ ○ ○  3 more to unlock

STATE C: Almost (4/5)
  👂 Understanding Calibration
  ● ● ● ● ○  1 more to unlock

STATE D: Calibrated (≥5) — existing bar, unchanged
```

### Dot specs

- Size: `w-2.5 h-2.5 rounded-full`
- Empty dot: `border border-muted-foreground/40`
- Filled dot: `bg-blue-500 border-blue-500`
- Text: `text-xs text-muted-foreground/60`

### Text logic

- 0 sessions: "5 sessions to unlock"
- 1–4 sessions: "{5 - N} more to unlock"
- Singular: "1 more to unlock" (no "sessions")

## Tree Preview Page

Create `/tree/calibration-preview` showing all states side-by-side for visual validation before integrating into the real profile:

- 0 sessions (State A)
- 1 session
- 2 sessions (State B)
- 3 sessions
- 4 sessions (State C)
- 5+ sessions (State D — existing calibrated bar)

Each state rendered as a card with a label indicating the session count. This allows visual QA of all transitions in one view.

## Files to Change

| File | Change |
|------|--------|
| `src/app/components/profile/calibration-display.tsx` | Redesign `InlineCalibration` null/insufficient path — add segmented dots for 0–4 sessions, keep existing bar for ≥5 |
| `src/app/pages/profile-page-v2.tsx` | Update `toUserCalibration()` to pass `sessionsCompleted` through instead of returning `null` for insufficient status |
| `src/app/components/profile/compact-profile-card.tsx` | Same prop update — pass `sessionsCompleted` to `InlineCalibration` |
| `src/app/pages/TreePage.tsx` | Add calibration-preview to dev pages list |
| `src/app/pages/calibration-preview.tsx` | **NEW** — tree preview page showing all 5+ states side-by-side |
| `src/App.tsx` | Add route for `/tree/calibration-preview` |

## Acceptance Criteria

- [ ] Zero sessions shows 5 empty dots + "5 sessions to unlock" — no bar, no center marker
- [ ] 1–4 sessions shows correct filled/empty dot ratio + correct "N more to unlock" text
- [ ] Singular form used for "1 more to unlock"
- [ ] ≥5 sessions renders the existing calibration bar with blue dot — no visual regression
- [ ] Dot sizing matches spec: `w-2.5 h-2.5 rounded-full`
- [ ] Empty dots use `border border-muted-foreground/40`, filled use `bg-blue-500 border-blue-500`
- [ ] Text uses `text-xs text-muted-foreground/60`
- [ ] Tree preview page at `/tree/calibration-preview` renders all states (0, 1, 2, 3, 4, ≥5)
- [ ] `toUserCalibration()` passes `sessionsCompleted` through for insufficient status
- [ ] Own profile and guest profile views both show the new zero-state correctly
- [ ] No visual regression on calibrated profiles (≥5 sessions)

## Testing

- **Unit tests**: Update existing `InlineCalibration` tests to cover 0, 1, 4, and 5 session states — verify correct dot count and text
- **Visual QA**: Use `/tree/calibration-preview` to validate all states before integration
- **Integration**: Verify `toUserCalibration()` correctly passes `sessionsCompleted` from API response through to component
- **Edge cases**: Verify behavior at boundary (exactly 5 sessions transitions from dots to bar)
