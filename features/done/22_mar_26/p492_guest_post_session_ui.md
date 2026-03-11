---
status: all-done
completed_at: "2026-03-11"
type: bug
rank: 250003.75
workstream: E1
created_date: 2026-03-11
flow: quick-feature
tags: [live, guest, ux]
uat_file: features/uat/p492.md
test_files:
  - src/tests/p492-guest-post-session-ui.test.tsx
---

# P492: Guest post-session UI: hide Start New Session + improve CTA copy

## Problem

When a guest user's live session ends on `/live`, they see two issues:
1. "X has left" + "Start New Session" button appears — should NOT show for guests (only registered users can start sessions)
2. "Save your calibration history" signup CTA copy is generic and doesn't reference what the guest just experienced

## Solution

Three targeted changes in `src/app/components/partners/live-mode-view.tsx` (`PartnerLeftScreen` component):

1. **Hide "Start New Session" button for guests:** Wrap lines 123-125 with `{!isGuest && (...)}`
2. **Improve guest CTA copy:**
   - Heading: "Save your calibration history" -> "Keep your session insights"
   - Body: "Create a free account to track your calibration scores over time, see your progress, and share your results." -> "You just practiced calibrated communication. Create a free account to save your positions, track your calibration over time, and join future sessions as a host."
3. **Tighten spacing:** Change `mt-8` to `mt-4` on guest CTA wrapper when `isGuest` (use ternary since no `cn` import available)

## Technical Notes

Single file change: `src/app/components/partners/live-mode-view.tsx`, lines 104-152 (`PartnerLeftScreen` component).

## Acceptance Criteria

- [x] Guest user does NOT see "Start New Session" button after session ends
- [x] Guest user sees improved CTA copy: "Keep your session insights" heading
- [x] Guest user sees improved body text referencing calibrated communication practice
- [x] Registered user still sees "Start New Session" button
- [x] Registered user does NOT see the guest CTA
- [x] Spacing between session end message and CTA is tighter (mt-4 instead of mt-8)

## Testing

Unit tests for `PartnerLeftScreen` component covering guest vs registered user rendering.
