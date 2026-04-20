---
status: all-done
completed_at: '2026-04-20'
type: bug
rank: 250014.25
severity: high
workstream: live
date_reported: '2026-04-20'
created_date: '2026-04-20'
tags:
  - live
  - realtime
  - receiver
  - race-condition
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: e2e/p766-reproduce.spec.ts
  root_cause: >-
    isListenerDuringLocalRating gate at live-mode-view.tsx:1236 stays true for
    the entire rating phase — design intent (P617) was 'hide until speaker
    submits', but the gate uses ratingInitiatedByIsCreator which only clears at
    end of round.
  confidence: high
  surfaces_in_scope:
    - live-mode-view.tsx
  surfaces_deferred: []
  reproduced_at: 2026-04-20T00:00:00.000Z
locked_at: '2026-04-20T09:17:51.116Z'
---

# P766: Receiver sees confidence slider without story card on first /live round

## Summary

On the very first request/round after a /live session starts, the receiver's screen renders the confidence slider but not the story card — even after the speaker has already submitted their rating. Subsequent rounds in the same session render the story card correctly.

## Root Cause

**Confirmed.** The story-card visibility gate in `live-mode-view.tsx:1236` is wider than the design intent:

```tsx
// P617: Listener should not see story card until round starts (speaker submits).
// P646: Use role-based check (isCreator) instead of name comparison.
const isListenerDuringLocalRating = liveState.ratingInitiatedByIsCreator !== undefined
  && liveState.ratingInitiatedByIsCreator !== isCreator;
```

The comment documents the P617 design intent (“hide until speaker submits”), but the implementation hides the card for the entire window in which `ratingInitiatedByIsCreator` is set on the listener’s side. That flag is written atomically with `selectedStoryData` at story selection (per P643) and is only cleared when the full round ends. So the listener’s card stays hidden from "speaker selected story" all the way through "listener submits rating" — including the post-submit phase when the screenshot was taken (slider is visible on listener because speaker has submitted, drawer has opened, but story card is still hidden).

**Why it reads as "first round only":** On round 2+, `selectedStoryData` is re-emitted by the next `handleSelectStory` atomic write, but now the listener already understands the prior round’s context and the perceived gap vanishes. The bug is present on every round; the user experience is most jarring on round 1 when there is no prior context at all.

## Invariants

- **Atomic write rule (from P643):** `selectedStoryData`, `selectedStoryId`, `ratingInitiatedBy`, `ratingInitiatedByIsCreator` MUST be written AND cleared in a single `updateLiveState` call. Future listener-visibility gates must continue to respect this.
- **Story-card visibility during rating:** When `selectedStoryData` is set, the listener MUST see the story card once the round has started (speaker has submitted). Hiding is allowed only in the narrow window before the speaker submits — i.e., while the speaker is still deciding their rating in their own drawer.

## Reproduction Steps

1. Open two browsers (A = speaker/creator, B = receiver/joiner) both signed in as distinct users who are connected partners.
2. A navigates to `/live` and creates a session; share code with B.
3. B joins the session via the same code.
4. A selects a story with at least one point (atomic write sets story + ratingInitiatedBy).
5. A submits their confidence rating in their own drawer.
6. Observe B’s screen: confidence slider visible ("How confident are you that you understand X?"), story card NOT visible.
7. Continue: B submits, round ends. A initiates a second round.
8. Observe B’s screen on round 2+: same bug is technically present (card hidden during rating window) but less noticeable because prior context exists.

**Reproduction rate:** 100%

## Expected Behavior

On the receiver's first round, once the speaker has submitted their rating and the receiver's confidence slider is visible, the story card (author + body + "N points" footer) must also be visible — so the receiver can actually read the story they are being asked to rate their comprehension of.

## Actual Behavior

On the receiver's first round, the confidence slider is visible but no story card appears. The receiver is asked to rate comprehension of content they cannot see.

## Affected Files

- `src/app/components/partners/live-mode-view.tsx:1236` — `isListenerDuringLocalRating` gate (too wide)
- `src/app/components/partners/live-mode-view.tsx:1375` — first render site for `LiveStoryCardExpanded`
- `src/app/components/partners/live-mode-view.tsx:1418` — sticky `ActionArea` render site (same gate)
- `src/app/components/partners/live-mode-view.tsx:1390` — "Speak" button mirror-gate that must be kept consistent with the card gate

## Severity

**High** — the receiver is asked to rate comprehension of content they cannot see. Confidence ratings on the first round are therefore unreliable, which undermines the core calibration metric of the product.

## Fix Approach

Narrow the gate so it matches the documented intent: hide the story card only while the **speaker is still in their own drawer** (i.e., checker hasn't submitted yet), not for the entire rating window.

Candidate condition (to be validated by `/fix`):

```tsx
const isListenerBeforeSpeakerSubmits =
  liveState.ratingInitiatedByIsCreator !== undefined
  && liveState.ratingInitiatedByIsCreator !== isCreator
  && !liveState.checkerSubmitted;
```

Apply to both render sites (line 1375 and line 1418) and the mirror condition on the Speak button (line 1390). `/fix` must also decide whether the Speak-button mirror should still be disabled in the post-submit window (probably yes — listener should be rating, not starting a new check).

## Acceptance Criteria

- [x] Canary Playwright test `e2e/p766-reproduce.spec.ts` PASSES after fix (FAILS before)
- [x] On the receiver's first round, the story card (title + body) is visible within 1000ms of the confidence slider appearing
- [x] Story card remains visible on rounds 2+ (no regression)
- [x] Speaker-side rendering is unchanged on any round
- [x] Story card is still hidden for the listener in the narrow window where the speaker is in their own drawer before submitting (preserves P617 intent)
- [x] No console errors on either participant's screen during the first round
