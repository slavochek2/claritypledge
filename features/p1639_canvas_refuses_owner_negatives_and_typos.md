---
status: week
type: bug
rank: 108
severity: medium
workstream: canvas
date_reported: '2026-11-05'
created_date: '2026-11-05'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [canvas, mirror-agent]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1639: Canvas refuses the owner's own negative statements and typos

## Summary

A clear statement with a "don't" or a typo is dropped by the best-guess check from P1625, though the model wrote the right point.

> "the probme is peopel dont like jouice"

## Root Cause

`isPlainGuess` treats any negator as a denial, in the statement and in the owner's sentence, so a negative the owner stated is refused. Its known-words check needs an exact match, so "juice" does not count against the owner's "jouice". Replay through the real prompt and model on an empty canvas: "Today people do not like juice." in 3 of 3 runs, refused every time. Prod's run log shows the same failure on that message; prod stores no model output.

## Invariants

- A point that reverses the owner stays refused: "They are not angry" from "they're angry", "They are angry" from "they're not angry".
- A request with no facts writes nothing.
- The model's instructions do not change. On an empty canvas it already writes a clear statement, and declining "one more card here they are angry" with no box named is acceptable (founder).

## Reproduction Steps

1. Signed in, open a new empty canvas with the mirror agent.
2. Send: "the probme is peopel dont like jouice".
3. Observe: "I could not draft a canvas from that: I could not tie what I found to your own words".

**Reproduction rate:** 3 of 3 replays, seen once on prod by the founder.

## Expected Behavior

The point is added with the note showing the owner's words.

## Actual Behavior

Nothing is written and the owner is asked who they sell to.

## Affected Files

- `supabase/functions/_shared/canvas-support.ts` — `isPlainGuess`

## Severity

**Medium** — true points are lost on first use, and the owner can reword.

## Fix Approach

A negative passes when the statement and the owner's sentence agree; other doubt words still refuse. A word of five letters or more, one edit from a word the owner typed, with the same first letter, counts as theirs. Shorter words stay exact, so "hate" never matches "have".

## Acceptance Criteria

- [ ] "the probme is peopel dont like jouice" reaches the canvas on a real run on TEST, with the note
- [ ] The P1625 refusals still hold: its test file passes unchanged, apart from cases this decision changes, each listed to the founder
- [ ] "They hate juice" from "they have juice" is refused
- [ ] The existing canvas suites pass

## Related

P1625
