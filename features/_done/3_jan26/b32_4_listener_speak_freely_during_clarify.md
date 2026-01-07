# B32_4: Listener "Speak freely" Button During Clarify Phase Doesn't Work

## Problem Statement

When the speaker is in "Clarify what's missing" mode, the listener sees "Waiting for X to finish clarifying..." with a "Speak freely" button. Clicking this button does nothing.

## Current Behavior (Bug)

1. Speaker is clarifying (after listener explained back)
2. Listener sees "Waiting for Gosha to finish clarifying..." with "Speak freely" button
3. Listener clicks "Speak freely"
4. **BUG: Nothing happens** - button click is not handled

## Expected Behavior

Clicking "Speak freely" should trigger the role switch negotiation flow:
1. Listener clicks "Speak freely"
2. Listener sees "Waiting for Speaker to allow skipping..."
3. Speaker sees negotiation dialog: "Allow X to skip active listening?"
4. Normal negotiation flow continues

## Root Cause

The "Speak freely" button during the clarify waiting phase likely doesn't have an onClick handler connected, or the handler doesn't trigger the negotiation flow for this specific state.

## Acceptance Criteria

1. [ ] "Speak freely" button during clarify-waiting phase triggers negotiation
2. [ ] Listener sees "Waiting for Speaker to allow skipping..." after clicking
3. [ ] Speaker sees negotiation dialog
4. [ ] Full negotiation flow works (suggest explain back / let them speak)

## Worktree Info

- **Worktree:** claritypledge-1 (worktree-1 branch)
- **Port:** 5100
