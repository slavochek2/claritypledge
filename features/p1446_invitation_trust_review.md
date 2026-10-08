---
status: in-progress
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
disclosure: embargo
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
related: [p1321, p1215, p1207]
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
- Suspected, to triage (unverified Codex claims): `create-and-sign` edge function (credential for an
  unregistered address); `claim_letter_delivery` and `update_delivery_status_by_token`
  (`20260813170000`, `20260630130000`) binding an uninvited token holder; `confirm-letter-response`
  not re-checking eligibility; stale JWT email in `guard_profile_trust_columns` (P1321 L3).

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

## Acceptance Criteria

- [ ] C1: a failing-then-passing integration test shows a token for an already-linked existing account yields no credential, with a control proving the function still opens the letter
- [ ] H2: a failing-then-passing test shows a client cannot change a delivery's `letter_id` or `receiver_profile_id`, with a control that a legitimate progress update still works
- [ ] H3: a failing-then-passing test shows a client cannot insert a non-pending agreement or name a partner, with a control that the normal create → accept flow still works
- [ ] Each of the four unverified claims has a test or a written disposition
- [ ] Regression lanes touching letters and agreements pass on test
- [ ] Fixes applied to test only; prod apply and edge-function deploy left to the founder
