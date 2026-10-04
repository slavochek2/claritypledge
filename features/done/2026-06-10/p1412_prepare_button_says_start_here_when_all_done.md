---
status: all-done
type: bug
rank: 24
severity: low
workstream: events
date_reported: '2026-10-04'
created_date: '2026-10-04'
drafted_by: opus
exec_model: sonnet
exec_effort: low
tags: [prepare, copy]
disclosure: public
pipeline_ran: [create-bug, fix]
date_resolved: '2026-10-04'
root_cause: The list button rendered COPY.start unconditionally
resolution: Label follows firstOpen — "Start here" while a step is open, "Start again" when all are done
completed_at: 2026-10-04
---

# P1412: /prepare's main button still says "Start here" when every step is done

## Summary

On `/prepare` (P1402), the step list's main button reads "Start here" even after all four steps are
done. The founder asked: *"after done the buton stays 'start here'? is ok?"*

## Root Cause

`src/app/prototypes/events/prep/PreparePage.tsx:416` renders `COPY.start` ("Start here",
line 69) unconditionally. The click target is already right (the first open step, else step 1).

## Reproduction Steps

1. Signed out, open `/prepare`.
2. Play the story clip and Continue; play the principle clip and Continue; finish the principle;
   answer every cmp7 and misunderstanding point; Continue to the end.
3. Back to the list ("Review the steps" is gone; reopen `/prepare`).
4. Observe: every step has a check, and the button reads "Start here".

**Reproduction rate:** 100%

## Expected Behavior

Founder-approved 2026-10-04: "Start here" when nothing or only part is done (round 1 rejected
"Continue"); "Start again" when every step is done, still opening step 1.

## Actual Behavior

"Start here" in every state.

## Affected Files

- `src/app/prototypes/events/prep/PreparePage.tsx` — line 69 (`COPY.start`), line 416 (the button)

## Severity

**Low** — copy only; the button still goes to the right place.

## Fix Approach

Label from `firstOpen`: defined → "Start here", undefined (all done) → "Start again".

## Accepted

- A returning all-done visitor may see "Start here" for a moment before "Start again" (the points
  load after the account read). Cosmetic; the click target is right either way. Holding the button
  until the points load would leave no button if that read fails (review, 2026-10-04).

## Acceptance Criteria

- [x] With every step done, the list's main button reads "Start again" and opens step 1 — e2e canary failed before the fix ("Start again" not found), passes after
- [x] With nothing or some steps done, it reads "Start here" and opens the first unfinished step — e2e smoke clicks "Start here" from a fresh list; same branch of the condition covers partial
- [x] Regression test passes: `e2e/p1402-standalone-prepare.spec.ts` — 3/3, retries off
