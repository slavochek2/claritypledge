---
status: in-progress
type: bug
rank: 1000935
severity: high
workstream: C1
date_reported: '2026-06-24'
created_date: '2026-06-24'
tags: [letters, receiver, rating, error-handling, silent-failure]
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: src/tests/p959-reproduce.test.tsx
  root_cause: "submitStoryRating (useLetterReadingState.ts token/deliveryId branches) awaits submit then reveal RPC; phase advance only on full success; setIsSubmitting(false) only in finally. RPC reject bubbles unhandled with no toast; RPC hang never reaches finally so isSubmitting stays true → rating card permanently disabled."
  confidence: high
  surfaces_in_scope: [submitStoryRating-token-branch, submitStoryRating-deliveryId-branch]
  surfaces_deferred: []
  reproduced_at: 2026-06-24
  notes: "HANG test asserts isSubmitting resets within 4000ms (waitFor); per-test timeout 20000ms. /fix must reset isSubmitting via timeout/abort within that window. local/previewMode branches are synchronous — not affected."
---

# P959: Receiver comprehension-rating card stuck disabled when submit hangs/errors

## Summary

In the receiver letter-reading flow, the comprehension-rating card ("How well do you believe you understand …'s intended meaning behind their story?") can become permanently disabled — the 0–10 number buttons are unclickable and "Continue" stays faded — with no error message and no recovery path.

## Root Cause

`submitStoryRating` in `src/app/hooks/useLetterReadingState.ts` (real-receiver branches — `token` ~lines 605-618 and `deliveryId` ~lines 619-632) does:

```
setIsSubmitting(true)
await submitRatingByToken(...)            // or submitRating(...)
const prediction = await revealPredictionByToken(...)   // or revealPrediction(...)
updateCurrentStory(... rating, prediction, phase: 'story-revealed')  // runs only if BOTH awaits resolve
finally { setIsSubmitting(false) }
```

The card's disabled gate is `disabled={isSubmitting || currentStory.rating !== null}` (`letter-flow-content.tsx:797`), which also propagates to the number buttons (`comprehension-rating-card.tsx:57,61`).

Failure mode: if either RPC **hangs** (promise never settles), the `finally` never runs → `isSubmitting` stays `true` forever → the entire card is locked while still on the `story-rate` phase (the locally-selected value remains highlighted, matching the observed "6 highlighted but disabled" symptom). If an RPC **rejects**, the rejection propagates through `handleSubmitRating` (`letter-flow-content.tsx:505-508`), which has no `catch` — there is no error toast, no retry, and the phase advance to `story-revealed` never happens. Either way the receiver is stranded with no way to continue.

Preview mode cannot reproduce this: the `previewMode` branch (~line 597) is a synchronous local state update with no await, so `isSubmitting` always resets. The bug is real-receiver (token / deliveryId) only.

## Reproduction Steps

1. As a real receiver (token-based delivery link, not preview), open a letter and reach the `story-rate` phase ("How well do you believe you understand …").
2. Select a value (e.g. 6) — at this point the click registers and Continue enables.
3. Click "Continue" while the rating-submit / reveal-prediction RPC hangs or errors (e.g. network stall, RPC failure).
4. Observe: the number buttons and Continue go disabled and never re-enable; the selected value stays highlighted; no error toast appears.

**Reproduction rate:** 100% when the submit/reveal RPC hangs or rejects; otherwise the flow advances normally.

## Expected Behavior

If the rating submit hangs or fails, the receiver should get clear feedback (error toast) and a way to recover — the card should re-enable (or offer a retry) so they can resubmit. A hung request must not lock the UI indefinitely; the submit should have a timeout / error path that resets `isSubmitting`.

## Actual Behavior

The card locks permanently: numbers unclickable, "Continue" faded, no toast, no retry. The receiver cannot complete the letter.

## Affected Files

- `src/app/hooks/useLetterReadingState.ts` — `submitStoryRating` (token branch ~605-618, deliveryId branch ~619-632): two sequential awaits with state advance only on full success; `setIsSubmitting(false)` only in `finally`, which a hung promise never reaches. No timeout, no error surface.
- `src/app/components/letters/letter-flow-content.tsx` — `handleSubmitRating` (505-508) has no `catch`; disabled gate at line 797 (`isSubmitting || currentStory.rating !== null`).
- `src/app/components/shared/comprehension-rating-card.tsx` — `disabled` prop gates both `RatingButtons` (line 57) and the submit `Button` (line 61).

## Severity

**High** — blocks a receiver from completing the letter with no recovery path or feedback; affects every receiver whose submit RPC stalls or errors. Not related to the P952 cosmetic work.

## Fix Approach

1. Add an error path to `submitStoryRating` (catch around the awaits): surface a toast and ensure `isSubmitting` resets so the user can retry. `finally` already resets on rejection — confirm a `catch` exists so rejections don't bubble unhandled through `handleSubmitRating`.
2. Add a timeout / abort to the submit + reveal RPCs so a hung promise cannot leave `isSubmitting` stuck `true` indefinitely.
3. `/reproduce` should pin which of the two failure modes (hang vs reject) is the live one before settling the fix — a canary that mocks `submitRatingByToken` / `revealPredictionByToken` to hang and to reject, asserting the card re-enables and shows feedback in both cases.

## Acceptance Criteria

- [ ] When the rating-submit RPC rejects, the receiver sees an error toast and the rating card re-enables (numbers clickable, Continue usable) so they can retry.
- [ ] When the rating-submit / reveal RPC hangs beyond a timeout, the card re-enables (or shows a retry affordance) rather than staying disabled forever.
- [ ] On a successful submit, behavior is unchanged: phase advances to `story-revealed`, rating recorded.
- [ ] No unhandled promise rejection from `handleSubmitRating` during the affected flow.
- [ ] Regression test passes: `e2e/p959-*.spec.ts` (or `src/tests/p959-*.test.tsx`) covering the hang and reject paths.
- [ ] No console errors during the normal (success) flow.
