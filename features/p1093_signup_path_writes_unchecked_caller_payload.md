---
status: week
type: bug
rank: 4
created_date: '2026-08-17'
tags: [security, letters, integrity, calibration]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1093: the sign-up-after-reading path records whatever the caller sends it

## Problem

**Situation:** When a reader signs up after reading a letter, the ratings they made in the browser are
written server-side in one call. Found by enumerating the database for every writer of verification
rows during P1067 — it was in no part of the original security review, which had looked only at the
paths the browser calls directly.

**Complication:** That call takes the story, the version, **who is credited as the speaker**, and the
ordering **verbatim from the caller's payload**, and checks none of them against the letter. It is
executable by any signed-in user. So a signed-in caller can record a verification for a story that is
not in the letter, and name **any profile** as the person whose story was understood.

This is the *same defect class* P1067 just closed on the sibling path — a caller-supplied identifier
written without a membership check. P1067 fixed it where the review had pointed and did not widen
scope; this is the other half.

**Downstream effects worth naming:** the counter trigger credits the row's listener, so a caller can
inflate **their own** verification and understanding counters at will. Those are the counters that
feed calibration claims. And since P1067 brought this path under a per-delivery uniqueness rule, a
forged row now also occupies the slot for a real rating of the same story — a caller can silently
block their own genuine rating from ever being recorded.

**Question:** which of these fields should the server derive rather than accept?

## Appetite

Small and self-contained, but it is two distinct decisions, not one: (1) reject stories that are not
in the letter — a direct mirror of the check P1067 added on the sibling path; (2) stop trusting the
caller's claim about who the speaker was — that one is derived from the letter, so it should not be a
parameter at all. Reversible. Worth checking whether the sort order needs validating too.

## Approach

1. Reject any payload entry whose story is not in the named letter's snapshot. Mirror the wording and
   shape of the check P1067 added, so the two paths read the same.
2. Derive the speaker from the letter rather than the payload. Confirm first that no legitimate caller
   depends on sending it — the browser builds this payload, so check what it puts there today.
3. Decide on the ordering field: validate, derive, or accept with a stated reason.
4. Assess whether any inflated counters exist in production from this path before deciding whether a
   repair is needed. P1067's equivalent check found zero realized damage; do not assume the same here,
   measure it.

## Risks / Non-Goals

### Risks

- **The browser may already send a speaker that is correct but not derivable the way I expect.**
  MITIGATE: step 2 reads the client payload builder before changing the signature's meaning.
- **This path runs at sign-up, so a wrong refusal loses a reader's whole set of ratings** — worse than
  a rejected single rating. MITIGATE: decide explicitly whether an invalid entry drops that entry or
  fails the whole call, and state which.

### Non-Goals

- Do **NOT** change who may call it. The caller must be signed in already, and that is correct.
- Do **NOT** fold this into P1067's migration. That one is verified and shipping; adding a concern
  after verification means verifying it again.

## Done-When

- [ ] A payload entry whose story is not in the letter is refused, with the drop-vs-fail decision stated
- [ ] The speaker is derived server-side, or a recorded reason why it cannot be
- [ ] A decision recorded on the ordering field
- [ ] Production checked for counters already inflated through this path, with the number stated
      even if it is zero
- [ ] A test that fails before the fix, exercising a forged payload from a signed-in caller
- [ ] Verified against the live catalog after deploy, not the migration ledger
- [ ] `.private/docs/security-log.md` updated
