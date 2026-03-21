---
status: all-done
type: bug
rank: 4
tags:
  - live
  - accessibility
  - wcag
  - mobile
  - touch
locked_at: '2026-03-18T08:11:00.217Z'
created_date: 2026-03-14
---

# P515: Speak Freely Button — Undersized Touch Target and Missing Clicker Feedback

## Problem

Users accidentally activate "Speak freely" when trying to tap other buttons during a live session. After clicking, there's no immediate confirmation for the clicker — the confirmation dialog appears to the OTHER person (the speaker), leaving the clicker confused about what happened. No cancel option exists for the clicker.

## Root Cause (5-Whys)

1. **Users accidentally activate speak-freely** → button is positioned directly below the primary action button with only 12px gap (`gap-3`)
2. **Touch target too small for mobile** → `variant="ghost" size="sm"` = `h-8` (32px height), below WCAG AA minimum of 44px. On 375px mobile viewport, finger easily lands on wrong button
3. **Feedback goes to wrong person** → after click, the SPEAKER gets a dialog ("Allow [Listener] to skip active listening?"). The CLICKER only sees a text change to "Waiting for [Speaker] to allow skipping..." — easy to miss
4. **No cancel option for clicker** → once activated, clicker is stuck waiting for speaker's decision. No "Cancel request" button exists
5. **Ghost variant provides minimal visual distinction** → text-only, no background, low contrast. Easy to confuse with surrounding text or accidentally tap

**Key files:**
- `live-mode-view.tsx:2474` — button rendering (`variant="ghost" size="sm"`)
- `live-mode-view.tsx:2706-2715` — gap-revealed phase placement
- `live-mode-view.tsx:1950` — ActionArea container (`gap-3` = 12px spacing)
- `live-mode-view.tsx:2390-2396` — clicker's waiting state (text only, no cancel)

**Related:** P510 acknowledges same WCAG target size issue for Pencil pill: "32px is below WCAG recommendation...Consider p-3 (48px) if touch miss-taps are reported."

## Expected Behavior

- Speak freely button has adequate spacing from primary action (minimum 44px touch target)
- After clicking, the CLICKER sees immediate visual confirmation and a cancel option
- Accidental activation is easily reversible

## Acceptance Criteria

- [ ] Touch target meets WCAG AA minimum (44px height)
- [ ] Increased spacing between primary action button and speak freely button
- [ ] Clicker sees immediate visual feedback after clicking (e.g., button changes to "Cancel request")
- [ ] Clicker can cancel the speak-freely request before speaker responds
- [ ] Works on mobile viewports (375px+)
