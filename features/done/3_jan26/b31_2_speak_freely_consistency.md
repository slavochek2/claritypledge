# B31_2: Speak Freely Button Consistency

**Status:** Ready for Development
**Created:** 2026-01-04
**Type:** Enhancement
**Depends on:** B31 (completed)

## Problem

After B31 fixed the dialog not appearing when speaker has drawer open, there are still inconsistencies in the "Speak Freely" UX:

1. **Listener sees "Skip" in some waiting states** - Should be "Speak freely" instead
2. **Not all "Speak freely" buttons trigger the negotiation dialog** - Some just skip directly

## Current State

| Listener State | Button Label | Triggers Dialog? |
|----------------|--------------|------------------|
| Waiting for speaker to evaluate (after "Done Explaining") | "Skip" | No - direct skip |
| Waiting for speaker to decide whether to clarify | "Speak freely" | **Should but unclear** |
| Explain-back mode (before "Done") | "Speak freely" | Yes |
| Gap-revealed phase | "Speak freely" | Yes |

## Desired State

**All listener "Skip"/"Speak freely" buttons in explain-back flow should:**
1. Say "Speak freely" (not "Skip")
2. Trigger the confirmation dialog for speaker: "Allow {listener} to skip active listening?"
3. Speaker can Accept or "Suggest explaining back first"

## Implementation

### Files to modify
- `src/app/components/partners/live-mode-view.tsx`

### Changes needed

1. **Replace "Skip" with "Speak freely"** in listener waiting states:
   - Line ~1665: After listener clicks "Done Explaining", waiting for speaker evaluation
   - Any other listener waiting states with "Skip" button

2. **Wire up `onSharePerspective` instead of `onSkip`** for all listener "Speak freely" buttons

3. **Ensure all "Speak freely" buttons trigger negotiation** by calling `onSharePerspective`:
   - This sets `roleSwitchNegotiation.state = 'pending'`
   - Speaker sees dialog
   - Listener's button changes to "Skip without waiting"

## Definition of Done

- [ ] All listener "Skip" buttons in explain-back flow show "Speak freely" instead
- [ ] All listener "Speak freely" buttons trigger speaker confirmation dialog
- [ ] Speaker sees "Allow {name} to skip active listening?" with Accept/Suggest options
- [ ] E2E test passes for all scenarios
- [ ] No regressions in other flows

## Testing Scenarios

1. **Listener waiting after "Done Explaining"** (screenshot 1 from B31)
   - Listener clicks "Speak freely" → Speaker sees dialog

2. **Listener waiting while "Speaker is deciding whether to clarify"** (screenshot 2 from B31)
   - Listener clicks "Speak freely" → Speaker sees dialog

3. **Speaker clicks "Suggest explaining back first"** (screenshot 3 from B31)
   - Listener sees counter-dialog: "{Speaker} would like to feel understood"

## Notes

This is a consistency/polish enhancement. The core negotiation flow works; we're just making sure all entry points use it consistently.
