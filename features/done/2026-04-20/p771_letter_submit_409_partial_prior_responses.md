---
status: all-done
type: bug
rank: 1000763.0
severity: high
workstream: letters
date_reported: '2026-04-20'
created_date: '2026-04-20'
completed_at: '2026-04-20'
tags: [letters, rehydration, 409, point-responses]
pipeline_ran: [create-bug, fix, ship]
root_cause: advanceFromStoryReveal and advanceFromRemainingPointReveal emitted remaining-point-engage unconditionally without checking prev.positions for pre-answered points
date_resolved: '2026-04-20'
---

# P771: Letter submit 409 when multi-point letter has partial prior responses and user flows through unanswered point first

## Summary

When a recipient opens a multi-point letter where only later points have prior DB responses, advancing past the first (unanswered) point triggers a 409 duplicate-key error on `letter_point_responses` because the runtime phase transition unconditionally lands on the already-answered point in `remaining-point-engage` phase.

## Root Cause

`advanceFromStoryReveal` in `src/app/hooks/useLetterReadingState.ts` (lines 620–636) unconditionally sets `currentPointIndex: 1` with no check against `prev.positions`. If point at index 1 is already in `positions` (answered in DB), the UI shows the positioning form again. On submit, the INSERT hits the UNIQUE constraint on `(delivery_id, point_id)` (migration `20260403224331_p581_clarity_letters.sql:92`) and returns 409.

Sibling issue: `advanceFromRemainingPointReveal` (lines 639–650) uses `prev.currentPointIndex + 1` with no guard, so 3+ point letters with any non-contiguous pre-answered points have the same failure mode.

The mount-time helper `seedStoryWithPriorPositions` (lines 179–217) already enforces the correct invariant — it skips answered points when determining the landing phase — but this invariant is not applied at runtime transition time.

## Reproduction Steps

1. As letter author, create a 2-point letter and send to a recipient.
2. Via Supabase test DB: insert a `letter_point_responses` row for point at index 1 only (point at index 0 has no response).
3. Sign in as the recipient and open the letter.
4. Engage point 0 (position form appears correctly). Submit position.
5. Rate the story and click the advance button on the story-revealed phase.
6. Observe: the positioning form for point 1 appears (bug — it was already answered).
7. Submit the form for point 1.
8. Observe: 409 error from `POST /rest/v1/letter_point_responses`.

**Reproduction rate:** 100%

## Expected Behavior

After advancing from story-revealed phase, if the next point (index 1) already has a response in `positions`, the UI should display it in `remaining-point-revealed` phase (showing the previously saved position). No positioning form is shown. No INSERT is attempted.

## Actual Behavior

`advanceFromStoryReveal` sets `phase: 'remaining-point-engage'` and `currentPointIndex: 1` unconditionally. UI shows the positioning form for an already-answered point. On submit: `INSERT INTO letter_point_responses` → 409 on UNIQUE constraint.

## Affected Files

- `src/app/hooks/useLetterReadingState.ts` — lines 620–636 (`advanceFromStoryReveal`, primary fix target); lines 639–650 (`advanceFromRemainingPointReveal`, sibling fix target); line 152 (`getVisiblePointCount`, refactor to use new helper)
- No DB migration needed. No server change.

## Severity

**High** — any recipient of a multi-point letter where only later points have prior responses hits a 409 error during normal reading flow, blocking completion.

## Fix Approach

Introduce `getVisiblePoints` and `isPointAnswered` helpers in `useLetterReadingState.ts`, then guard both transition functions:

- `advanceFromStoryReveal`: check `isPointAnswered(snapshot, 1, prev.positions)` — if true, emit `phase: 'remaining-point-revealed'` instead of `'remaining-point-engage'`.
- `advanceFromRemainingPointReveal`: same guard for `nextIdx = prev.currentPointIndex + 1`.

Mirrors the invariant already enforced at mount time by `seedStoryWithPriorPositions` (lines 206–209). No server-side UPSERT — that would violate the forward-only audit-trail invariant from P581.

## Acceptance Criteria

- [x] Recipient with only point-1 pre-answered: after engaging point-0 and advancing through story-revealed, UI shows point-1 in revealed state (no positioning form)
- [x] No `POST /rest/v1/letter_point_responses` is fired for pre-answered points during the flow
- [x] 3+ point letter with non-contiguous pre-answers: each transition skips to revealed for answered points
- [x] 2-point letter with no pre-answers: behavior unchanged — `remaining-point-engage` phase for point-1
- [x] Regression test passes: `e2e/p771-reproduce.spec.ts`
- [x] Unit test passes: `src/tests/p771-partial-rehydration.test.tsx` (4 scenarios)
- [x] Existing tests unchanged: p665, p707, p708, p712, p768
