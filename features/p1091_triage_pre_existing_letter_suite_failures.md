---
status: week
type: bug
rank: 5
created_date: '2026-08-17'
tags: [tests, letters, rpc, triage]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1091: three letter-suite tests have been failing silently — classify each, then split

## Problem

**Situation:** While running the regression sweep for P1067, five tests in the letter integration
suite failed. Two are accounted for: one is P1067's own open finding (N1) and one is P1090. **Three
are unexplained.**

**Complication:** None of the three was caused by the P1067 change — that was established by an A/B,
restoring the original function body on test and observing the identical failures, not by assuming
it. So they were already failing, and nothing surfaced them. A test that fails continuously teaches
the next agent to ignore the file, which is how P1090's disclosure stayed invisible for weeks in this
same suite.

**The three:**

1. `p684-rpc-auth-guards.spec.ts:209` — `submit_point_response_by_token: authenticated caller
   succeeds` returns **false**. The function is untouched by recent work. A false return means its own
   token lookup failed, in a fixture that seals the letter and creates the delivery immediately after.
2. `p684-rpc-auth-guards.spec.ts:255` — `reveal_prediction_by_token: authenticated caller succeeds`
   returns **null**, in the same fixture, whose delivery is claimed and whose prediction and rating
   rows are both seeded.
3. `p683-rating-after-consent.spec.ts:133` — never reaches the RPC under test. The edge function it
   calls first returns `400 INVALID_TERMS_VERSION`, which looks like a fixture constant that drifted
   away from the accepted terms version.

**Question:** For each — is the test stale, or is it reporting a real defect? (1) and (2) share a
fixture and may share one cause; they may also be two.

## Appetite

Diagnosis first, fixes after — and the fixes may not belong together. This spec's job is to classify,
then split into as many P-numbers as there are real causes. Reversible. Decision density: none until
the classification exists.

## Approach

1. Take (1) and (2) together first — same file, same fixture, both failing at what looks like the
   same early exit. Establish whether the token lookup resolves at all in that fixture. If it does
   not, one cause explains both.
2. Decide per finding: stale fixture, stale expectation, or live defect. A live defect gets its own
   P-number and, if it touches reachability or disclosure, a private-log entry.
3. (3) is likely a constant to update, but confirm the accepted terms version from the source of
   truth rather than editing the fixture until it passes.
4. Whatever remains stale: fix the fixture, never the assertion, unless the assertion encodes a
   decision that was deliberately reverted — in which case retire it and say where the reversal was
   decided.

## Risks / Non-Goals

### Risks

- **The tempting fix is to make the assertions pass.** Tests are specs here. MITIGATE: for each of
  the three, the deliverable is a stated cause, not a green run.
- **A shared fixture may be hiding more than three failures.** MITIGATE: after any fixture repair,
  re-run the whole file and re-count, rather than only the three named tests.

### Non-Goals

- Do **NOT** fix these inside another feature's branch. They predate it and would muddy that diff.
- Do **NOT** treat P1067's N1 failure in this suite as in scope — it closes when N1 closes.

## Done-When

- [ ] Each of the three has a stated cause: stale fixture, stale expectation, or live defect
- [ ] Every live defect found has its own P-number filed
- [ ] Every stale item fixed at the fixture, or its assertion retired with the reversal cited
- [ ] The full `p684-rpc-auth-guards.spec.ts` and `p683-rating-after-consent.spec.ts` files re-run and
      the remaining failure count stated explicitly, including zero
