---
status: qa
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
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: src/tests/p1639-reproduce.test.ts
  root_cause: "isPlainGuess refuses any negator and needs exact word matches, so an owner's own negative with a typo cannot pass"
  confidence: high
  surfaces_in_scope: [isPlainGuess]
  reproduced_at: 2026-11-05
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

- [x] "the probme is peopel dont like jouice" reaches the canvas on a real run on TEST, with the note
- [x] The P1625 refusals still hold: its test file passes unchanged, apart from cases this decision changes, each listed to the founder
- [x] "They hate juice" from "they have juice" is refused
- [x] The existing canvas suites pass

## Verification

`e2e/p1639-real-run.spec.ts` on TEST with the real model: added and told on 5 of 5 empty canvases. `e2e/p1625-real-run.spec.ts` on the same code: 4 of 5, and the Dropbox request wrote nothing. No P1625 test needed changing.

## Known Limitations

- A typo match can join two real words one edit apart, such as "price" and "prize"; the note shows the owner's words.
- A negative with a hedge ("they should not pay") stays refused.
- Negation is compared per sentence, so a negative elsewhere in the sentence can refuse a true point, or let one through.

## Related

P1625
