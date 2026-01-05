# B32_2: Negotiation State Preservation - Speaker Drawer Should Remain After "Continue as listener"

## Problem Statement

When listener clicks "Continue as listener" after speaker suggested explaining back first, the **speaker's rating drawer disappears**. The drawer should remain open so the speaker can still rate how well the listener explained back.

## Current Behavior (Bug)

1. Listener clicks "Speak freely" → Speaker sees "Allow X to skip active listening?" dialog
2. Speaker clicks "Suggest explaining back first" → Listener sees "Continue as listener" / "I really need to speak" dialog
3. Listener clicks "Continue as listener" → **BUG: Speaker's rating drawer disappears**
4. Speaker ends up in "Waiting for X to finish clarifying" state instead of rating drawer

## Expected Behavior

1. Listener clicks "Continue as listener"
2. Listener returns to explain-back mode (microphone UI)
3. **Speaker's rating drawer remains visible** so they can rate the explanation
4. Both users can continue the normal flow

## Screenshots

See user-provided screenshots showing:
- Screenshot 1: Before - Listener in explain-back, speaker waiting for clarifying
- Screenshot 2: Dialog appears correctly, listener button changed to "Skip without waiting"
- Screenshot 3: "Continue as listener" dialog visible, speaker still has drawer
- Screenshot 4: After clicking "Continue as listener" - listener back to explain-back, but **speaker's drawer gone**

## Root Cause Hypothesis

The `handleContinueAsListener` function in `clarity-live-page.tsx` likely:
1. Clears `roleSwitchNegotiation` state (correct)
2. Also resets `explainBackDone` to `false` (correct - listener should explain again)
3. But this state change triggers a re-render that exits Branch 2 (rating drawer) for the speaker

The issue is that the speaker's view is tied to `listenerDone` (`liveState.explainBackDone === true`). When listener clicks "Continue as listener", this resets `explainBackDone` to `false`, which causes the speaker to exit Branch 2.

## Key Files to Investigate

1. **`src/app/pages/clarity-live-page.tsx`**
   - Line ~796: `handleContinueAsListener` function
   - Check what state it modifies

2. **`src/app/components/partners/live-mode-view.tsx`**
   - Lines ~1500-1640: Branch 2 rendering logic (speaker rating drawer)
   - Check condition: `const listenerDone = liveState.explainBackDone === true`
   - The drawer only shows when `listenerDone` is true

## Proposed Solution

Option A: **Don't reset `explainBackDone` when listener continues**
- Listener continues from where they left off (keeps `explainBackDone: true`)
- Problem: This might not match UX intent (listener should re-explain)

Option B: **Add separate state for "drawer should remain open"**
- New state: `speakerRatingInProgress: true`
- Keep drawer open based on this flag, not just `explainBackDone`

Option C: **Reset `explainBackDone` only for listener's view**
- Speaker sees `listenerDone` from their perspective
- Use local state to track if listener was done at least once

## Acceptance Criteria

1. [ ] After listener clicks "Continue as listener", speaker's rating drawer remains visible
2. [ ] Listener returns to explain-back mode with microphone UI
3. [ ] Speaker can still submit their rating of the previous explanation
4. [ ] When listener finishes explaining again, speaker gets new notification
5. [ ] E2E test covers the full "Continue as listener" flow

## E2E Test to Add

```typescript
test('Speaker drawer remains after listener clicks "Continue as listener"', async ({ browser }) => {
  // Setup: Get to the point where listener sees "Continue as listener" dialog
  // ...existing setup from EXPLAIN-BACK PHASE test...

  // Listener clicks "Continue as listener"
  await listenerPage.getByRole('button', { name: 'Continue as listener' }).click();

  // CRITICAL: Speaker's drawer should STILL be visible
  await expect(speakerPage.getByText(/How well did.*capture the intention/i)).toBeVisible({ timeout: 5000 });

  // Listener should be back in explain-back mode
  await expect(listenerPage.getByText(/Explain back what you heard/i)).toBeVisible({ timeout: 5000 });
});
```

## Context from B31_2 (Previous Work)

### What was fixed in B31_2:
1. **Dialog not showing in `hasTappedDone` branch** - Added `showAskedToExplainDialog` to the return statement
2. **Button not changing to "Skip without waiting"** - Added `listenerWaitingForNegotiation` conditional rendering

### Files modified in B31_2:
- `src/app/components/partners/live-mode-view.tsx` (lines 1662-1688)

### Tests added in B31_2:
- `e2e/speak-freely-button.spec.ts` - Multiple negotiation flow tests

## Worktree Info

- **Worktree:** claritypledge-1 (worktree-1 branch)
- **Port:** 5100
- **Server:** Running

## Lessons Learned

1. **Test full user journeys, not just UI states** - We tested "dialog appears" but not "what happens after dialog interaction"
2. **State dependencies are complex** - Multiple views depend on `explainBackDone` flag
3. **Need acceptance criteria that cover all outcomes** - "Dialog shows" is not enough; need "flow continues correctly after dialog"
