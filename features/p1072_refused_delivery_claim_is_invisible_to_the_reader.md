---
status: backlog
type: bug
rank: 212
severity: medium
date_reported: '2026-08-13'
created_date: '2026-08-13'
tags: [letters, error-handling, ux, rls]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1072: a reader whose delivery claim was refused gets no signal, then every write fails silently

## Summary

When `claim_letter_delivery` refuses because the delivery already belongs to a different account,
the reader is shown the letter as normal and receives no indication — but every write they then
attempt (point responses, ratings) fails via RLS with nothing connecting the failure to its cause.

## Root Cause

Claiming a delivery is what sets `receiver_profile_id`, and every write RLS policy on the reading
path checks `receiver_profile_id = auth.uid()`. If the claim is refused the row keeps its previous
owner, so the reader's session can read the letter but satisfies no write policy.

Nothing surfaces the refusal. `claimLetterDelivery` returns `false`
(`src/app/data/letters-service.ts:673-717`) and neither call site branches on it
(`src/app/pages/letter-reading-page.tsx:344`, `:445`). P1066 made the anomalous refusals visible to
*operators* by reporting them to Sentry, and deliberately stopped there: telling the reader
requires user-facing copy, which is a founder decision and was not invented mid-fix.

So this is the remaining half of a gap P1066 diagnosed but only half-closed. Its own code comment
states the operator side and not the user side.

**Which refusals matter.** The RPC has three outcomes, and only one is anomalous:

| reason | meaning | user signal warranted? |
|---|---|---|
| `cannot_claim_own_letter` | the sender opened their own letter | no — expected |
| `no_delivery_for_token` | the invitation is spent; the sign-up path expires it in the same write that claims the delivery | no — this is the ordinary first-open path |
| `delivery_claimed_by_other` | the delivery belongs to a different account | **yes** |

Only the third should ever reach the reader. Treating all three alike is what makes this
easy to get wrong — the first revision of P1066's Sentry reporting did exactly that and would have
fired on nearly every letter open.

## Reproduction Steps

1. Seal a one-to-one letter to recipient A and let A open it, so the delivery is claimed by A.
2. Sign in as an unrelated account B.
3. Open the same letter URL with the same invitation token as B.
4. Observe: the letter renders normally, with no toast, banner, or error.
5. As B, respond to a point or rate a story.
6. Observe: the write fails, with no explanation linking it to step 3.

**Reproduction rate:** 100% once the delivery is claimed by another account.

## Expected Behavior

At step 4 the reader is told, in the product's own voice, that this letter is already open under a
different account and what to do about it (for example: sign in as the invited recipient). The
reading surface should not present writable controls the reader cannot use.

**[FOUNDER DECISION: exact copy, and whether the reader is blocked at step 4 or merely warned.]**
The mechanism is settled; the wording and the strictness are not.

## Actual Behavior

No signal at any point. The reader reads normally and their contributions silently fail minutes
later, appearing to them as the product losing their work.

## Affected Files

- `src/app/data/letters-service.ts:673-717` — `claimLetterDelivery`; returns `false` for all three
  refusal reasons without distinguishing them to the caller
- `src/app/pages/letter-reading-page.tsx:344`, `:445` — both call sites discard the boolean
- `src/tests/p1066-claim-refusal-sentry-classification.test.ts` — already encodes the
  expected/anomalous split this fix should reuse rather than re-derive

## Severity

**Medium** — it needs a genuine ownership conflict, so it is not on the common path. It is not
lower because the failure is silent and lands on work the user has already done: the reader writes
a response and loses it, with no error to act on and nothing pointing at the cause.

## Fix Approach

Return the refusal reason from `claimLetterDelivery` instead of a bare boolean, then branch on it
at the two call sites. Do not surface `cannot_claim_own_letter` or `no_delivery_for_token` — the
table above is the classification, and it already exists in code as `EXPECTED_CLAIM_REFUSALS`.

A generic toast pattern already in this file (`letter-reading-page.tsx:417`) is the cheapest
adequate signal if the founder decision lands on "warn". If it lands on "block", the reading
surface needs a state for it, which is the larger of the two options.

Widening the return type touches every caller — grep before changing it; the service is imported
in several places.

## Acceptance Criteria

- [ ] A reader opening a letter whose delivery belongs to another account sees a clear signal
      before they can write anything
- [ ] A sender opening their own letter sees no such signal
- [ ] A recipient opening their own letter for the first time via an emailed link sees no such
      signal (the spent-token path must stay silent)
- [ ] The reader can act on the signal — the path back to a working state is stated, not implied
- [ ] `src/tests/p1066-claim-refusal-sentry-classification.test.ts` still passes
- [ ] No console errors during any of the three flows
