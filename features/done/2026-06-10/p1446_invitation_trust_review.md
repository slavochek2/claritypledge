---
status: all-done
type: bug
rank: 28
severity: critical
workstream: infrastructure
date_reported: '2026-10-08'
created_date: '2026-10-08'
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, letters, agreements, auth]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix]
related: [p1321, p1215, p1207]
completed_at: 2026-10-12
---

# P1446: Letter and agreement invitation paths trust the wrong party

> **Embargoed.** Authored branch-born on `feature/p1446-invitation-trust-review`. Not published until
> `./scripts/git-ops.sh publish-spec p1446` confirms the fix is live on prod. Commit subjects on this
> branch use roles, not mechanics. Step-by-step chains are in `.private/docs/security-log.md`, entry
> "2026-10-08 (later) — Codex review of the P1321 fixes".

## Summary

Found by the adversarial review of P1321's fixes (Codex, high effort, 2026-10-08) and verified
against code and the **production** catalog, read-only and without running the exploit: a letter's
sender can obtain a sign-in credential for an existing-account recipient (**C1**); a delivery's
receiver can move their delivery onto another letter (**H2**, bypasses P1321 L1); an agreement
creator can insert an agreement that is already accepted or ended with anyone (**H3**, forges
relationship scope, P1321 L2's outcome through another table).

## Root Cause

**C1 — the invitation token is treated as the recipient's identity, and the sender can read it.**
The token-only letter-opening edge function (`supabase/functions/create-and-open-letter/index.ts`
~L155–172), for a delivery that already has a `receiver_profile_id`, returns a magic-link
`hashed_token` for that profile's email. The client exchanges it with `verifyOtp`
(`src/app/pages/letter-reading-page.tsx` ~L642). Sealing to an email binds an existing profile by
`lower(email)` with no relationship-scope check (`seal_and_send_letter`, latest definition in
`20260904120000_p1212_seal_rpc_story_author_name.sql` ~L203). The delivery's `invitation_token` is
SELECT-able by `authenticated` (prod: `has_column_privilege` true) and the SELECT policy admits the
sender. So the person who chose the recipient can present the recipient's token.

**H2 — delivery identity columns are client-writable.** `authenticated` holds UPDATE on
`letter_deliveries.letter_id` and `receiver_profile_id` (prod); the only UPDATE policy checks
`receiver_profile_id = auth.uid()` on both sides; the table has no trigger. Receiver status is
derived from the (letter_id, receiver_profile_id) pair.

**H3 — agreement state and partner are client-chosen at INSERT.** The INSERT policy checks only
`creator_profile_id = auth.uid()`; `authenticated` may INSERT `status` and `partner_profile_id`
(prod); the only INSERT trigger fills `display_id`. `p878_relationship_scope` admits `active` and
`terminated` agreements.

## Invariants

- **A credential for an account is only ever delivered to that account's mailbox or to a session
  already authenticated as it** — never returned to whoever presents a token someone else could read.
- **Who an object belongs to is decided once, by the server, and never rewritten by a client** —
  `letter_id`/`receiver_profile_id` on a delivery; `partner_profile_id`/`status` on an agreement
  outside the recipient-authorised accept path.
- **Every input to `p878_relationship_scope` must be a fact the other party took part in.** P1321
  closed the witness input; this closes the agreement input. Any future arm is held to the same rule.

## Reproduction Steps

Reproduced as **failing integration tests on the test project only** (`/reproduce`); no exploit
scripts. C1 is asserted at the edge-function boundary (a token presented for an already-linked
existing account yields no credential), not by completing a sign-in.

1. C1: user A seals a letter to user B's registered email → A reads the delivery's token → presents it
   to the letter-opening function → response carries a credential for B.
2. H2: user A receives a public letter (one delivery) → PATCH the delivery's `letter_id` to a private
   letter's id → A is now that letter's receiver.
3. H3: user A inserts an agreement with `partner_profile_id = B`, `status = 'terminated'` → B is in A's
   relationship scope → `create_agreement_with_profile(B)` returns B's email.

**Reproduction rate:** expected 100% (verified by code + catalog; tests not yet written).

## Expected Behavior

- C1: presenting a token for a delivery already linked to an existing account returns no credential;
  the recipient is asked to sign in normally (the link still opens the letter after sign-in).
  `[FOUNDER DECISION, taken 2026-10-08: this behaviour, chosen over hiding the token from senders]`
- H2: a client UPDATE cannot change `letter_id` or `receiver_profile_id`.
- H3: a client INSERT creates only a `pending` agreement with no `partner_profile_id`; the partner is
  set and the status advanced only by the recipient-authorised accept path.

## Actual Behavior

As in Root Cause, on production today.

## Affected Files

- `supabase/functions/create-and-open-letter/index.ts` — idempotent existing-receiver branch
- `supabase/migrations/20260403224331_p581_clarity_letters.sql:204` — delivery UPDATE policy (latest)
- `supabase/migrations/20260224150000_p422_clarity_agreements.sql:85` — agreement INSERT policy (latest)
- Further suspected paths were triaged separately; see Triage below.

## Severity

**Critical** — C1 is account takeover of any registered user whose email is known, by any signed-in
user able to send a letter; live on production.

## Fix Approach

1. **C1:** in `create-and-open-letter`, drop the credential for an already-linked existing account;
   return `redirectTo` only. Check whether `create-and-sign` has the same shape and fix alike.
   Verify the recipient's first-open flow (no linked account yet) is unaffected, or reduce it the
   same way if it has the same exposure. Edge-function deploy is a prod step: founder.
2. **H2:** extend the delivery UPDATE path so client roles cannot change identity columns — a
   BEFORE UPDATE trigger pinning `letter_id`/`receiver_profile_id` for `anon`/`authenticated`
   (same mechanism as P880's profile guard), or column-level UPDATE grants on progress fields only.
   Grep every client `.update(` on `letter_deliveries` first.
3. **H3:** BEFORE INSERT guard (or WITH CHECK) forcing `status = 'pending'` and
   `partner_profile_id IS NULL` for client roles; confirm the accept RPC is the only path that sets
   them. Grep client inserts first (`agreements-service-real.ts`).
4. Triage the four unverified claims: each gets a failing test or a written "not reachable because".

Prior art: P880 (trust-column guard trigger), P1230 (agreement status lock on UPDATE — the INSERT
side was missed), P1321 L1/L2.

## Triage of the Unverified Claims (2026-10-09)

Each claim was checked against code and the live catalog (read-only), or by a probe on the test
project that obtained no credential. Dispositions only; mechanics for anything still open are kept
in the private security log.

1. `create-and-sign` credential for an unregistered address: confirmed, not the C1 shape. Open
   product decision (founder), not fixed here.
2. `claim_letter_delivery` / `update_delivery_status_by_token` (H4): confirmed, not an escalation;
   low. A residual hygiene gap is filed for alignment with P1181.
3. `confirm-letter-response` eligibility (M6): not reachable as an escalation. P1181 adds its audience
   check when it ships.
4. Stale-claim window in P1321's profile trust guard (M5): low, narrow. Recorded on P1321.

## Acceptance Criteria

- [x] C1: the letter-opening function returns no credential for an account that already exists, and still opens the letter. **Evidence standard changed 2026-10-09 (founder):** no test may obtain or exercise a credential for another account, so the evidence is the diff, a Codex review at high effort, and the founder's manual check after deploy — not an integration test.
  - Diff: commit ed2cd484d. Three branches had the shape, not one; all three now return `redirectTo` only, and the credential remains only in the branch that has just created the account. The client already continues by the token path when no credential comes back. `deno check` passes.
  - Structural tripwire `src/tests/p1446-invitation-credential-shape.test.ts`: 4/4 green; flags all three branches on the pre-fix file. It reads source order only, so it catches this regression's shape and nothing subtler.
  - Codex (high, read-only, 1 of 1 reports): no remaining existing-account credential return in the repaired function. Its other findings are recorded privately and not yet verified.
  - Deployed to prod 2026-10-09 (founder go; function smoke 1/1). Manual check on prod, delegated by the founder and run from his browser session: a letter sealed to an existing account (the ops mailbox); its link opened in a fresh signed-out browser; the function answered `signInRequired` with no credential, no session was created, and the page asked to sign in.
- [x] H2: a failing-then-passing test shows a client cannot change a delivery's `letter_id` or `receiver_profile_id`, with a control that a legitimate progress update still works
  - `e2e/integration/p1446-ownership-columns.spec.ts`: red before migration 20261009090000, green after; refusal is a column-privilege error; control writes to the progress columns land (admin read-back).
- [x] H3: a failing-then-passing test shows a client cannot insert a non-pending agreement or name a partner, with a control that the normal create → accept flow still works
  - Same file: red before migration 20261009090100, end to end (a forged ended agreement put an outsider in scope); green after, refusal is the RLS error; control: an app-shaped insert lands pending, then `accept_agreement` makes it active with the partner. 9/9 green.
- [x] Each of the four unverified claims has a test or a written disposition — see Triage above.
- [x] Regression lanes touching letters and agreements show no failure caused by this fix on test (the lanes were not green before it; see below)
  - Integration (69 files): no failure carries either refusal signature; failures were classified as rate limits, teardown, missing functions and test-project drift (P1181), plus P1321's stale anonymous-access tests.
  - Browser (85 files, chromium): 412 passed, 177 failed, none carrying a refusal signature. In a browser a refusal shows as missing UI, so the 52 files with failures were run twice on test, with this fix reverted and then re-applied (re-apply verified by catalog read): 422 tests each, 176 vs 177 failures, 0 tests fixed, 1 test failing only with the fix: p904 "receiver can submit text fallback". That one is not caused by the fix: its write path is an INSERT on another table and never touches the narrowed UPDATE grant, and with the fix in force (re-checked in the catalog) it passed 3/3 alone and again in a whole-file run whose other outcomes were identical to both halves. Recorded as a load-dependent flake (it also failed in the first full lane), not as green.
- [x] Fixes applied to test first; prod apply and edge-function deploy run on the founder's go
  - Prod apply (founder go, 2026-10-09): H2 and H3 migrations applied with `migrate.sh --env prod --only`, smoke 8/8. Read-only re-probe on prod: a client can no longer update a delivery's letter or receiver, while progress columns stay writable (control); the agreement insert check now requires a pending agreement with no partner. Manifest stamped on this branch.
