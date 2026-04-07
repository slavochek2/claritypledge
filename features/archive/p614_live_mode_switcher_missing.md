---
status: rejected
type: bug
rank: 4
tags:
  - live
  - regression
  - p562
created_date: 2026-03-30T00:00:00.000Z
superseded_by: p643
---

# P614: /live — Open/Guided Mode Switcher Never Renders

**Severity:** High — users cannot switch between Open and Guided mode at all
**Found during:** P609 manual UAT
**Affects:** All sessions (not private-session-specific)

---

## Problem Statement

The Open mode / Guided mode toggle tabs that should appear at the bottom of the /live idle screen are completely missing. Neither the creator nor the joiner sees the mode switcher. Users are stuck in whichever mode the session defaults to with no way to switch.

**Reproduction:**
1. Two users in /live session
2. Both see IdleScreen with "Speak" button
3. No mode switcher tabs visible below the Speak button
4. No way to switch between Open and Guided mode

**Expected:** "Open mode" / "Guided mode" toggle tabs visible below the action buttons on the IdleScreen, as designed in P562.

---

## Root Cause

`onSessionModeChange` callback prop is received by `LiveModeView` from `clarity-live-page.tsx` but is **never forwarded** to any of the 3 `IdleScreen` render sites in `live-mode-view.tsx`:

1. Line ~816 (ResponderWaitingWithDrawer) — missing prop
2. Line ~922 (Fallback/Main IdleScreen) — missing prop
3. Line ~1443 (ResponderWaitingWithDrawer internal) — missing prop

The mode switcher's visibility condition at line ~1343 requires `onSessionModeChange` to be truthy:
```tsx
{onSessionModeChange && !showRatingDrawer && ...}
```

Since `onSessionModeChange` is always `undefined` inside `IdleScreen`, the entire switcher block never renders.

---

## Acceptance Criteria

- [ ] Mode switcher (Open mode / Guided mode tabs) visible on IdleScreen for both creator and joiner
- [ ] Clicking mode tabs switches the session mode and syncs to partner in real-time
- [ ] No regression to other IdleScreen elements (Speak button, story selector)
