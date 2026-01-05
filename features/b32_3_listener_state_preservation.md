# B32_3: Listener State Preservation - Should Return to "Waiting" After "Continue as listener"

## Problem Statement

When listener clicks "Continue as listener" after speaker suggested explaining back first, the **listener goes back to explain-back mode** (microphone UI). But they had already finished explaining and were in the "Waiting for X to evaluate" state. They should return to that waiting state, not restart explain-back.

## Current Behavior (Bug)

1. Listener finishes explaining → sees "Waiting for Speaker to evaluate"
2. Listener clicks "Speak freely" → sees "Waiting for Speaker to allow skipping..."
3. Speaker clicks "Suggest explaining back first"
4. Listener sees dialog with "Continue as listener" / "I really need to speak"
5. Listener clicks "Continue as listener"
6. **BUG: Listener sees "Explain back what you heard" with microphone UI**
7. Speaker's drawer stays open (B32_2 fix works)

## Expected Behavior

1. After clicking "Continue as listener", listener should return to their **previous state**
2. Previous state was: "Waiting for Speaker to finish clarifying..." (or "Waiting for Speaker to evaluate")
3. Listener should NOT have to re-explain - they already did that

## Screenshots

See user-provided screenshots showing:
- Screenshot 1: Speaker sees negotiation dialog, listener in "Waiting for Slava to allow skipping"
- Screenshot 2: Speaker clicked "Suggest explaining back first", listener sees "Continue as listener" dialog
- Screenshot 3: After "Continue as listener" - listener incorrectly shows explain-back mode
- Screenshot 4: Speaker's drawer stayed open (B32_2 fix), but listener is in wrong state

## Root Cause

In `handleContinueAsListener` (clarity-live-page.tsx line ~805):
```typescript
const handleContinueAsListener = useCallback(() => {
  updateLiveState({
    roleSwitchNegotiation: null,
    explainBackDone: false,  // ← THIS IS THE BUG
  });
}, [updateLiveState]);
```

Setting `explainBackDone: false` resets the listener to explain-back mode, but they had already finished explaining before clicking "Speak freely".

## Proposed Solution

**Don't reset `explainBackDone` in `handleContinueAsListener`**

The listener already finished explaining - that's why they were waiting. They clicked "Speak freely" to skip to speaking, but now they're agreeing to continue as listener. They should continue from where they were (waiting for speaker's rating), not restart.

```typescript
const handleContinueAsListener = useCallback(() => {
  updateLiveState({
    roleSwitchNegotiation: null,
    // DON'T reset explainBackDone - listener already finished explaining
  });
}, [updateLiveState]);
```

## Acceptance Criteria

1. [ ] After listener clicks "Continue as listener", they return to "Waiting for X to evaluate" state
2. [ ] Listener does NOT see explain-back mode (microphone UI) again
3. [ ] Speaker's rating drawer remains visible (B32_2 - already fixed)
4. [ ] Speaker can still rate the previous explanation
5. [ ] E2E test updated to verify listener stays in waiting state

## E2E Test Update

The B32_2 test assertion should be updated:
```typescript
// Listener should return to WAITING state, not explain-back mode
await expect(listenerPage.getByText(new RegExp(`Waiting for ${speakerName}`, 'i'))).toBeVisible({ timeout: 5000 });
```

## Relationship to B32_2

- **B32_2 (FIXED):** Speaker's drawer stays open after "Continue as listener" ✅
- **B32_3 (THIS BUG):** Listener returns to waiting state, not explain-back mode

Both bugs stem from `handleContinueAsListener` incorrectly resetting `explainBackDone`.

## Worktree Info

- **Worktree:** claritypledge-1 (worktree-1 branch)
- **Port:** 5100
