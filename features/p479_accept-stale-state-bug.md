---
status: today
type: bug
rank: 2
tags:
  - agreements
  - bug
  - p472
flow: fix
created_date: 2026-03-06
---

# P479: Stale state after closing celebration dialog on accept page

## Bug Description

After partner clicks "I Accept & Co-Sign" and the celebration dialog appears, closing the dialog shows the original unsigned state — "I Accept & Co-Sign" button still visible instead of the active/signed state.

## Root Cause

`handleAccept()` stores the updated agreement in `acceptedAgreement` (used only by the modal) but never updates the main `agreement` state variable. When `showCelebration` becomes `false`, the page re-renders with the original stale `agreement` object loaded at mount time.

The `onClose` handler only calls `setShowCelebration(false)` — no navigation, no refetch.

## Fix

**Note:** If P478 (celebration dialog redesign) ships first, this bug is automatically resolved — P478 replaces the modal with a direct navigate to the detail page, eliminating the stale state entirely. Implement this fix only if P478 is deferred.

- In `onClose` handler of `CelebrationDialog`, navigate to `/agreements/:id` instead of just hiding the modal (same behavior as the existing "View Agreement" button)
- OR: update the main `agreement` state after `handleAccept()` succeeds: `setAgreement(updated)` alongside `setAcceptedAgreement(updated)`

## Acceptance Criteria

- [ ] AC1: After closing celebration dialog, user sees the agreement in its active/signed state — not the unsigned "I Accept & Co-Sign" button
