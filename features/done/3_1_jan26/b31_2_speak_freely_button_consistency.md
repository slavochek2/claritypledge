# B31_2: "Speak Freely" Button Consistency - DONE

**Completed:** 2026-01-05
**Worktree:** claritypledge-1 (worktree-1)

## Summary

Fixed multiple issues with the "Speak Freely" button negotiation flow in the explain-back phase.

## Bugs Fixed

### 1. Dialog Not Showing in `hasTappedDone` Branch
**Problem:** When listener clicked "Speak freely" after clicking "Done Explaining", the speaker's "Suggest explaining back first" button didn't trigger the listener dialog.

**Root Cause:** The `showAskedToExplainDialog` Dialog component was missing from the `hasTappedDone` branch return statement in `live-mode-view.tsx`.

**Fix:** Added the negotiation dialog to lines 1680-1698 of `live-mode-view.tsx`.

### 2. Button Not Changing to "Skip without waiting"
**Problem:** After listener clicks "Speak freely", the button should change to "Skip without waiting" to indicate negotiation is pending. This wasn't happening in the `hasTappedDone` branch.

**Root Cause:** The `hasTappedDone` branch always rendered the default `WaitingIndicator` without checking `listenerWaitingForNegotiation` state.

**Fix:** Added conditional rendering at lines 1663-1676 to show "Skip without waiting" when `listenerWaitingForNegotiation` is true.

## Files Modified

- `src/app/components/partners/live-mode-view.tsx`
  - Added `showAskedToExplainDialog` dialog to `hasTappedDone` branch
  - Added `listenerWaitingForNegotiation` conditional for button state

## Tests Added

- `e2e/speak-freely-button.spec.ts`
  - "EXPLAIN-BACK PHASE: 'Suggest explaining back' triggers listener dialog IMMEDIATELY"
  - "Listener button changes to 'Skip without waiting' after clicking 'Speak freely'"
  - Multiple other negotiation flow tests

## Test Results

- 5 tests passing
- 1 flaky test (passes on retry - Supabase realtime sync timing)
- 1 skipped test

## Known Issue (Becomes B32_2)

During testing, discovered a related but separate bug:
- When listener clicks "Continue as listener", the **speaker's rating drawer disappears**
- This is a state management issue, not a UI rendering issue
- Tracked in `features/b32_2_negotiation_state_preservation.md`

## Lessons Learned

1. **Test full user journeys** - We initially only tested "dialog appears" but not "what happens after interaction"
2. **Early returns hide bugs** - The `hasTappedDone` branch returned early without all necessary dialogs
3. **State dependencies are complex** - Multiple views depend on shared state like `explainBackDone`
