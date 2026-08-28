---
status: backlog
type: bug
rank: 218
severity: low
date_reported: '2026-08-18'
created_date: '2026-08-18'
tags: [tests, letters, rpc, stale-assertion]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1099: a P691 test asserts an expiry check that was deliberately removed four months ago

## Summary

`e2e/integration/p691-letter-reopen-after-token.spec.ts:132` asserts that
`get_letter_for_reading` returns `null` for an expired token, but the expiry predicate it depends
on was intentionally dropped by `20260412180000_fix_reading_rpc_drop_expiry_check.sql`. The test
has failed on every run since, and it contradicts a recorded decision.

## Root Cause

Not a product defect — a test asserting superseded behaviour.

`docs/decisions.md:12840` records the decision this test contradicts:

> **Context:** `create-and-open-letter` sets `invitation_expires_at = now()` on first open as replay
> defense [...] The `get_letter_for_reading` RPC checked `invitation_expires_at > now()`, causing
> every subsequent read to fail — the letter showed "Invalid or expired invitation" after the first
> open. **Decision:** Drop the `invitation_expires_at` predicate from `get_letter_for_reading`, same
> pattern as P683. The column gates session minting only.

The reading RPC therefore validates token existence + `cl.status = 'sealed'` and nothing else, so it
cannot return `null` for a sealed letter whose token has merely expired. A sibling test asserts the
*opposite* and passes: `20260412180000_fix_reading_rpc_drop_expiry_check.spec.ts` verifies the RPC
still returns data after `invitation_expires_at` is set to `now()`.

The repo has been carrying both assertions at once, one red and one green, against the same function.

**Discovered during P1071** (which redacted `receiver_email` from the same RPC) and confirmed
unrelated to it: the P1071 migration contains no expiry predicate, because the live body it was
derived from had none either.

## Reproduction Steps

1. From the repo root, run the P691 integration spec with Playwright, writing output to a log file
   (see `.claude/rules/tests.md` for the required non-piped invocation).
2. Observe the failure in `get_letter_for_reading RPC returns null for expired token`.

**Reproduction rate:** 100%

## Expected Behavior

The suite passes, and its assertions describe the RPC's actual, decided contract: an expired
`invitation_expires_at` does **not** block reading. If P691's own guarantee (a recipient can reopen
a letter after the token is consumed) still needs coverage, it should be asserted through a
condition that is genuinely part of the contract.

## Actual Behavior

```
Error: expect(received).toBeNull()
Received: {"delivery": {...}, "letter": {...}, "snapshots": []}
  > 132 |     expect(data).toBeNull();
```

## Affected Files

- `e2e/integration/p691-letter-reopen-after-token.spec.ts:121-133` — the stale test and its
  `expect(data).toBeNull()` assertion
- `supabase/migrations/20260412180000_fix_reading_rpc_drop_expiry_check.sql` — the migration that
  removed the predicate
- `e2e/integration/20260412180000_fix_reading_rpc_drop_expiry_check.spec.ts` — the sibling test
  asserting the opposite, currently green

## Severity

**Low** — no user-facing impact. The cost is a permanently red assertion in the letters integration
suite, which erodes the signal: a genuinely new failure in this file is easy to wave through as
"the usual one". That masking effect is the reason to fix it rather than leave it.

## Fix Approach

Correct the test, not the RPC — the RPC's behaviour is the decided one, and reinstating the
predicate would re-break reopening (the original P691 bug).

Read `p691-letter-reopen-after-token.spec.ts` in full first: P691's real guarantee is that a
recipient can reopen a letter *after the token has been consumed*, which the other tests in the file
may already cover. Decide per-test:

- If the expired-token case is fully covered by the sibling migration test, delete this one and cite
  that file so the coverage is traceable.
- If P691 has a distinct guarantee here, rewrite the assertion to the real contract — reading
  succeeds after expiry — so the test asserts the decision rather than contradicting it.

Either way, add a comment naming `docs/decisions.md` 2026-04-12 so the next reader does not
"restore" the predicate.

Then re-check the other stale `TODO` markers in
`e2e/integration/p651-letter-onboarding-migration.spec.ts` (lines 255, 358, 433, 510, 526, 613, 805,
824) — several are wrapped in `if (...)` guards that make them pass vacuously, and at least one
(`get_letter_by_token` receiver_email, line 358) is believed already implemented. Same class of
defect: an assertion that no longer matches the shipped contract.

## Acceptance Criteria

- [ ] The P691 integration spec passes in full
- [ ] No test in the repo asserts that `get_letter_for_reading` returns null for an expired token
- [ ] The surviving coverage for P691's reopen-after-consumption guarantee is named explicitly —
      either the test that keeps it, or the sibling file it was folded into
- [ ] A comment cites `docs/decisions.md` 2026-04-12 at the changed assertion, so the predicate is
      not reinstated later
- [ ] The stale-TODO audit in `p651-letter-onboarding-migration.spec.ts` is done, with each marker
      either resolved or explicitly confirmed still outstanding
