---
status: in-progress
type: change-request
rank: 125002.375
workstream: E1
created_date: 2026-03-17T00:00:00.000Z
predecessor: p152
delivery_stage: 4-tests-ready
flow: dev
uat_file: features/uat/p539.md
test_files:
  - src/tests/p539-calibration-zero-state.test.tsx
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
OWN PROFILE:

STATE A: Zero sessions
  👂 Understanding Calibration
  ○ ○ ○ ○ ○  5 sessions for calibration

STATE B: Partial (e.g., 2/5)
  👂 Understanding Calibration
  ● ● ○ ○ ○  3 more for calibration

STATE C: Almost (4/5)
  👂 Understanding Calibration
  ● ● ● ● ○  1 more for calibration

STATE D: Calibrated (status !== insufficient) — existing bar, unchanged

GUEST PROFILE (viewing someone else, 0–4 sessions):
  👂 Understanding Calibration
  Not yet calibrated
```

### Dot specs

- Size: `w-2.5 h-2.5 rounded-full`
- Empty dot: `border border-muted-foreground/40`
- Filled dot: `bg-blue-500 border-blue-500`
- Text: `text-xs text-muted-foreground/60`

### Text logic

**Own profile:**
- 0 sessions: "5 sessions for calibration"
- 1–4 sessions: "{5 - N} more for calibration"
- Singular: "1 more for calibration"

**Guest profile (viewing someone else):**
- 0–4 sessions: "Not yet calibrated" (no dots, no progress — visitor doesn't need the owner's progress)

### Transition gate

Dots→bar transition gates on `status !== 'insufficient'` (status-based), not on `sessionsCompleted >= 5` (count-based). If the API returns `status: insufficient` with `sessionsCompleted: 5` (e.g., invalidated sessions), dots persist until calibration actually computes.

## Files to Change

| File | Change |
|------|--------|
| `src/app/components/profile/calibration-display.tsx` | Add `sessionsCompleted?: number` and `isOwner?: boolean` props to `InlineCalibration`. When `calibration` is null: if `isOwner`, render dots; if guest, render "Not yet calibrated" text. Keep existing bar for calibrated state. |
| `src/app/pages/profile-page-v2.tsx` | Store `sessionsCompleted` from `CalibrationResult` in separate state (don't discard on insufficient). Pass `isOwner` and `sessionsCompleted` props to `<InlineCalibration>` at the JSX call site. |

## Acceptance Criteria

- [ ] Own profile: zero sessions shows 5 empty dots + "5 sessions for calibration" — no bar, no center marker
- [ ] Own profile: 1–4 sessions shows correct filled/empty dot ratio + correct "N more for calibration" text
- [ ] Own profile: singular form used for "1 more for calibration"
- [ ] Guest profile: 0–4 sessions shows "Not yet calibrated" — no dots, no progress indicator
- [ ] Both views: calibrated state (status !== insufficient) renders the existing bar with blue dot — no visual regression
- [ ] Transition gate is status-based (`status !== 'insufficient'`), not count-based
- [ ] Dot sizing matches spec: `w-2.5 h-2.5 rounded-full`
- [ ] Empty dots use `border border-muted-foreground/40`, filled use `bg-blue-500 border-blue-500`
- [ ] Text uses `text-xs text-muted-foreground/60`
- [ ] `toUserCalibration()` passes `sessionsCompleted` through for insufficient status

## Testing

- **Unit tests**: Update existing `InlineCalibration` tests to cover 0, 1, 4, and 5 session states — verify correct dot count and text
- **Visual QA**: Verify on actual profile pages (own + guest views)
- **Integration**: Verify `toUserCalibration()` correctly passes `sessionsCompleted` from API response through to component
- **Edge cases**: Verify behavior at boundary (exactly 5 sessions transitions from dots to bar)

## UX Requirements

### Lean Challenge

Every element passes. The dots provide progress feedback toward a threshold users must reach — no friction before value. The own/guest split avoids exposing session counts to visitors (privacy-by-default). No deferrable steps identified.

### 1. User Flows

**Flow 1: Own profile viewing (0-4 sessions)**

1. User navigates to their profile (via nav avatar or `/p/:slug`)
2. Profile page loads; calibration data fetches in parallel with stories/points
3. While loading: the calibration section renders nothing (same as current — no skeleton, no flash)
4. Data arrives with `status: 'insufficient'` and `sessionsCompleted: N`
5. Component renders the ear icon + "Understanding Calibration" header (unchanged)
6. Below header: 5 dots render — first N filled (blue), remaining empty (outlined)
7. Right of dots: text reads "5 sessions for calibration" (if N=0) or "{5-N} more for calibration" (if N=1-4)
8. Tooltip on tap/hover explains: "Complete 5 live sessions to unlock your calibration score"
9. After each new session, returning to profile shows one more dot filled and updated text

**Flow 2: Guest profile viewing (0-4 sessions)**

1. Visitor navigates to another user's profile
2. Same loading behavior as Flow 1
3. Data arrives with `status: 'insufficient'`
4. Component renders ear icon + "Understanding Calibration" header
5. Below header: text reads "Not yet calibrated" — no dots, no progress indicator
6. Tooltip on tap/hover explains: "Complete 5 live sessions to unlock your calibration score"

**Flow 3: Transition moment (dots to calibration bar)**

1. User completes their 5th session
2. User returns to their profile (page navigation or refresh)
3. API returns `status: 'sufficient'` with calibration data
4. Component renders the existing calibration bar with blue dot — dots disappear entirely
5. No animation or transition between dot state and bar state — clean swap on data change

**Flow 4: Entry points**

- **Profile page** (`profile-page-v2.tsx`): Primary display in the profile header section, below agreements metadata, above bio
- **Compact profile card** (`compact-profile-card.tsx`): Currently does NOT render InlineCalibration — no change needed there (confirmed: no `InlineCalibration` import or usage in compact-profile-card.tsx)

### 2. Screen Designs

**STATE A — Own profile, zero sessions (N=0)**
```
┌─────────────────────────────────────────┐
│  👂 Understanding Calibration           │
│  ○ ○ ○ ○ ○   5 sessions for calibration │
└─────────────────────────────────────────┘
```
- 5 empty outlined dots in a row, evenly spaced
- Text sits to the right of dots on the same line, separated by a small gap
- Visual weight is deliberately low — muted borders, muted text

**STATE B — Own profile, partial (e.g. N=2)**
```
┌─────────────────────────────────────────┐
│  👂 Understanding Calibration           │
│  ● ● ○ ○ ○   3 more for calibration    │
└─────────────────────────────────────────┘
```
- First 2 dots filled (solid blue), remaining 3 outlined
- Filled dots use `bg-blue-500` — same blue as the calibration bar dot, providing visual continuity

**STATE C — Own profile, almost (N=4)**
```
┌─────────────────────────────────────────┐
│  👂 Understanding Calibration           │
│  ● ● ● ● ○   1 more for calibration    │
└─────────────────────────────────────────┘
```
- 4 filled, 1 empty — singular "1 more" text

**STATE D — Own profile, calibrated**
```
┌─────────────────────────────────────────┐
│  👂 Understanding Calibration           │
│  ═══════════════●═══════════════════    │
└─────────────────────────────────────────┘
```
- Existing calibration bar with blue dot — completely unchanged from current implementation

**GUEST — Uncalibrated (0-4 sessions)**
```
┌─────────────────────────────────────────┐
│  👂 Understanding Calibration           │
│  Not yet calibrated                     │
└─────────────────────────────────────────┘
```
- Plain text, same `text-xs text-muted-foreground/60` styling as the dot-row text
- No dots, no bar — minimal visual footprint for visitors

**GUEST — Calibrated**
- Same as STATE D — existing bar with blue dot, no change

**Visual hierarchy within profile layout:**
The calibration section sits between the agreements metadata line and the bio text. Its visual weight should remain secondary to the user's name and pledge status above it. The dot row uses `text-xs` and muted colors to stay subordinate.

### 3. Edge Cases

- **Loading state**: No special loading skeleton for calibration. The section simply does not render until data arrives. This matches current behavior and avoids layout shift for a small component.
- **sessionsCompleted is undefined/null**: Treat as 0. The API contract (`CalibrationResult`) always includes `sessionsCompleted`, but defensive coding should default to 0 via `?? 0`.
- **Live update after 5th session**: The profile page fetches calibration data on mount. Completing a session and navigating back triggers a re-fetch. The transition from dots to bar happens on the next page load — no WebSocket or polling needed. This is consistent with how all other profile data updates.
- **5+ sessions but status still 'insufficient'**: Show 5 filled dots with no text. The text formula `5-N` yields 0, so suppress the text entirely when `remaining <= 0`. Cap filled dots at `min(sessionsCompleted, 5)`. This is a rare edge case that resolves itself on next calibration computation.

### 4. Accessibility

- **Screen reader announcement**: The dot row should have `aria-label="{N} of 5 sessions completed for calibration"` on the container. Individual dots are decorative and should use `aria-hidden="true"`.
- **Guest "Not yet calibrated" text**: Readable as-is by screen readers — no special annotation needed.
- **Keyboard navigation**: Dots are purely decorative (not interactive). No `tabIndex`, no focus ring. The tooltip trigger (the entire calibration section) already has `tabIndex={0}` and keyboard activation from the existing `CalibrationTooltip` wrapper — this is preserved.
- **Color contrast**: Empty dots use `border-muted-foreground/40` on a `bg-card` background. At 40% opacity of muted-foreground, contrast may be low. However, dots are supplemented by text that has higher contrast, so the dots alone do not carry meaning — they are a visual enhancement. This is acceptable under WCAG 1.4.1 (color is not the only means of conveying information).
- **Reduced motion**: No animations in the dot display — no `prefers-reduced-motion` concern.

### 5. Responsive Design

- **Mobile**: Dots + text fit on a single line at all viewport widths. 5 dots at `w-2.5` (10px each) + gaps (`gap-1` = 4px each) = ~66px. Text at `text-xs` adds ~180px max. Total ~246px fits within the ~320px minimum content width.
- **Wrapping behavior**: If the viewport is narrower than expected (extreme edge case), `flex-wrap` is not needed — the dots and text should remain on one line. The `flex items-center` container will compress gracefully since dots are fixed-size and text can truncate.
- **Compact profile card**: InlineCalibration is NOT used in compact-profile-card.tsx (confirmed by codebase search). No compact-space adaptation needed.
- **Profile page header section**: The calibration area sits inside a `flex-1 min-w-0` container with the profile name, role, and bio. The dot row's total width is well within this container at all breakpoints.

### 6. Component Analysis

| UI Element | Classification | Rationale |
|---|---|---|
| Dot row (filled/empty circles) | **Extend** existing pattern | `src/app/components/shared/RatingDots.tsx` already renders filled/empty dot arrays with configurable size. The calibration dots use different sizing (`w-2.5 h-2.5` vs `w-1.5 h-1.5`), different colors (blue vs foreground), and a different scale (5 vs 10). Extending the pattern (same array-mapping approach) inside `InlineCalibration` is cleaner than reusing `RatingDots` directly, since RatingDots is coupled to a 1-10 rating scale with number display. |
| "Understanding Calibration" header with ear icon | **Reuse** | Already exists in `InlineCalibration` (`calibration-display.tsx`, lines 148-151). No change needed. |
| Tooltip wrapper | **Reuse** | `CalibrationTooltip` in `calibration-display.tsx` (lines 34-93) already handles desktop hover + mobile tap with auto-dismiss. Reuse as-is for both dot state and bar state. |
| Progress text ("N more for calibration") | **New** — text-only, inline | New text element inside the dot row. No new component needed — a `<span>` with the text logic. Follows existing text patterns in `calibration-display.tsx` (same `text-xs text-muted-foreground` styling). |
| "Not yet calibrated" guest text | **New** — text-only, inline | Simple `<span>` replacing the dot row for guest view. Same styling as progress text. |
| Calibration bar (existing) | **Reuse** | `barContent` in `InlineCalibration` (lines 132-143). Completely unchanged for calibrated state. |
| `InlineCalibration` component | **Extend** | New props: `sessionsCompleted?: number`, `isOwner?: boolean`. Internal branching: if calibration is null/insufficient, render dots (owner) or text (guest) instead of the bar. |

## Test Coverage Strategy

**Files created:**
- `src/tests/p539-calibration-zero-state.test.tsx` (16 unit tests)
- `features/uat/p539.md` (8 UAT scenarios)

**What's tested:**
- Own profile: all dot states (0, 1, 2, 4 sessions) — dot count, text, singular form
- Guest profile: "Not yet calibrated" text, no dots rendered
- Calibrated state: bar renders unchanged for both own and guest views
- Transition gate: status-based (not count-based) — dots persist at sessionsCompleted=5 when calibration is null
- Edge cases: undefined sessionsCompleted defaults to 0, dots capped at 5
- Accessibility: aria-label on dot container, individual dots aria-hidden
- CSS: dot sizing classes verified

**What's NOT tested (rationale):**
- Integration tests — no API/DB changes; calibration service already has full unit tests
- E2E tests — pure component rendering; unit tests + visual QA (UAT) cover this adequately
- Smoke tests — no new pages or routes
- `toUserCalibration()` data flow — verified via UAT (profile page renders correct state from real API data)

**Test pyramid:**
```
     /\
    /  \   8 UAT scenarios (manual)
   /____\
  /      \
 /________\
/ 16 UNIT  \
```

Total: 16 automated tests + 8 UAT scenarios
