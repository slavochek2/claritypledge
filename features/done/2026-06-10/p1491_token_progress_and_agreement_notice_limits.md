---
status: all-done
type: bug
rank: 1000112
severity: low
workstream: security
date_reported: 2026-10-14
created_date: 2026-10-14
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, letters, agreements, email, rate-limit]
disclosure: public
pipeline_ran: [inline, ship]
flow: fix
completed_at: 2026-10-14
---

# P1491: A letter's progress path and agreement notices accept callers and repeats they should not

## Summary

Three low-severity residuals from the 2026-10-14 security review. (1) The path a letter
recipient uses to record reading progress could also be used by the letter's sender, and could
attach a recipient account to a delivery after the invitation had expired — the dedicated claim
path refuses both. (2) A party to a partner agreement could have the invitation (or any other
agreement notice) emailed again and again with no limit. (3) A signed-out account-existence check
used by the login form — a product trade-off, recorded below as a founder decision, not changed.

## Root Cause

1. `update_delivery_status_by_token` was written for anonymous recipients and later gained a
   fallback that binds an unbound delivery to a signed-in caller. That fallback never received the
   checks `claim_letter_delivery` applies when it binds (invitation window, caller is not the
   sender), and the function never excluded the sender at all.
2. `send-agreement-emails` checks that the caller is a party and that the agreement is in the
   state the notice announces (P1178/P1451), but nothing bounds how often a party may ask.

Mechanics and the prod catalog evidence are in the private security log
(`.private/docs/security-log.md`, entry dated 2026-10-14, P1491).

## Invariants

- Invitation expiry gates **who a delivery is bound to**, never the recipient's own progress
  (P683: `create-and-open-letter` spends the invitation in the same write that binds it, so a
  bound recipient keeps progressing after expiry).
- The progress path is recipient-side only; the sender has no reason to call it, and a signed-in
  account other than the bound recipient is refused (as `claim_letter_delivery` refuses it).
- Signed-out policy (P642, kept deliberately): a signed-out holder of a one-to-one delivery's
  token may record forward-only progress — the recipient may open the emailed link signed out —
  but never binds an account. One-to-many still requires sign-in (P684).
- Authorization, binding and progress are decided on the locked row, so a concurrent claim or
  progress write is never overwritten with a stale value or moved backward.
- An agreement notice limit is spent only by a request that passed the party and state checks —
  a refused request never consumes another party's allowance.
- The mail limiter fails closed (P1225): if it cannot decide, no mail is sent.

## Fix Approach

1. Migration `20261014160000_p1491_delivery_status_token_binding.sql` redefines
   `update_delivery_status_by_token` from the prod definition, keeping the P684 sign-in rule and
   the P979 forward-only guard, and adds: a call made as the letter's sender changes nothing and
   returns false; a signed-in caller conflicting with the bound recipient changes nothing and
   returns false; an unbound delivery is bound to the signed-in caller only while its invitation
   is unexpired (the `claim_letter_delivery` window); the delivery row is read `FOR UPDATE` before
   any of these decisions. Grants unchanged (anon + authenticated). `claim_letter_delivery`
   itself reads without a lock and is left unchanged (a claim running second acts on its own
   earlier read — pre-existing, noted in the migration header).
2. `send-agreement-emails` reserves a slot with the P1225 limiter (`reserve_mail_rate_slot`,
   bucket `target`) keyed by agreement, kind of notice and destination, after the party and state
   checks, keyed on the agreement id the database returned (not the request's spelling of it).
   Invitation and resend share one allowance (same notice, same address). Allowance:
   the P1225 founder-set per-address limit, 3 per hour. Refusal: the shared 429 body.

## Affected Files

- `supabase/migrations/20261014160000_p1491_delivery_status_token_binding.sql`
- `supabase/functions/send-agreement-emails/index.ts`
- `e2e/integration/20261014160000_p1491_delivery_status_token_binding.spec.ts`
- `e2e/integration/p1491-agreement-mail-cooldown.spec.ts`

## Acceptance Criteria

- [x] The sender's call on their own letter's unbound delivery changes nothing (no binding, no
      status change, returns false) — delivery suite test 1.
- [x] The sender's call on a delivery already bound to its recipient changes nothing — test 2.
- [x] An expired invitation does not bind an unbound delivery to a signed-in caller; the reading
      progress still records — test 3.
- [x] Control: a signed-in recipient on an unexpired, unbound invitation is bound — test 4.
- [x] Control: a bound recipient keeps progressing after the invitation is spent (P683) — test 5.
- [x] Control: a signed-out reader of a one-to-one letter still records progress, binding nobody
      — test 6.
- [x] Control: P979 forward-only and P684 one-to-many sign-in rules still hold — test 7.
- [x] A different signed-in account cannot advance a delivery bound to its recipient — test 8.
- [x] Policy: a signed-out token holder records forward progress on a bound delivery and never
      rebinds it — test 9.
- [x] A claim-and-progress write that commits while the call waits on the row survives: the
      claimed receiver is not replaced and the status is not regressed — test 10 (a concurrent
      writer holds the row lock through the Management API on TEST; the call starts only once
      that writer is observed active).
- [x] Repeated invitations for one agreement are refused (429, shared body, Retry-After) once the
      allowance is spent; a different agreement to the same address keeps its own allowance —
      mail suite test 1.
- [x] Equivalent spellings of one agreement id (upper case, no hyphens, braces) share one
      allowance — test 2.
- [x] Resend draws on the invitation's allowance — test 3.
- [x] Repeated termination notices are refused once the allowance is spent — test 4.
- [x] Control: non-party and wrong-state requests are refused without spending the party's
      allowance — test 5.
- [x] Every defect test failed before the fix on the test project and passed after it — see
      Evidence.

## Evidence

Test project, 2026-10-14.

- Delivery suite, before the migration: tests 1–3 failed (`Expected: false / Received: true`
  twice; `expired invitation must not bind an account — Received: <uuid>`), tests 4–7 passed.
  After `./scripts/migrate.sh` (ledger row `20261014160000 p1491_delivery_status_token_binding`
  on test): 7/7 passed (JSON reporter: expected 7, unexpected 0).
- Mail suite, against the previously deployed function: tests 1–3 failed (`Expected: 429 /
  Received: 200`), test 4 passed. After deploying `send-agreement-emails` to the test project:
  4/4 passed.
- Review round (Codex, 3 findings). Red before the revision: delivery tests 8 and 10 failed
  (`a conflicting identity is refused — Expected: false / Received: true`; `the claimed receiver
  survives — Expected: <recipient> / Received: <stranger>`), test 9 passed; mail test 2 failed
  (`spelling <UPPER-CASE id> must hit the same allowance — Expected: 429 / Received: 200`). The
  revised migration body was re-applied to TEST (Management API, same token as migrate.sh; ledger
  row unchanged) and the function redeployed to TEST at 09:32 UTC, last, immediately before the
  final run: both suites 15/15 (JSON reporter, 0 unexpected). Neighbouring
  `update_delivery_status_by_token` tests re-run: each of the 7 failures carries only the suites'
  own cleanup error (`clarity_docs_owner_id_fkey`), no assertion failure.
- Neighbouring suites after the first fix: `20260630130000_p977_p979…`, `p684-rpc-auth-guards`,
  `p651-letter-onboarding-migration` — every `update_delivery_status_by_token` test passed; the
  other failures there are the suites' own cleanup (`clarity_docs_owner_id_fkey` on user delete)
  and one `submit_point_response_by_token` assertion, a function this change does not touch.
  `edge-fn-authz-regression`, `p1178-reproduce`, `p1451-agreement-self-accept`: every
  `send-agreement-emails` test passed; the 3 failures are in other functions (a cron function's
  auth reply, an undeployed webhook function, `create-and-sign` terms version).
  Vitest `agreement-emails.test.ts` + `sd-guard-completeness.test.ts`: 6/6.

## Decisions Needed

- `[FOUNDER DECISION: the login form's signed-out "No account found with this email. Sign up
  instead." check (email_exists, P64/P877) reveals whether an address has an account. Options:
  (a) keep as is; (b) keep the message but move the check behind an edge function using the
  P1225 per-IP limiter — same UX, one more network hop, login check fails closed when the
  limiter is down, anon EXECUTE revoked only after that frontend is live; (c) drop the
  pre-check and always answer "if an account exists, we sent a link" — closes the oracle in the
  app, changes the UX, and the auth service's own response to a non-existent address must be
  checked. Recommendation: (b).]`

## Out of Scope / Follow-ups

- The parked P1181 branch redefines `update_delivery_status_by_token` from the P979 body; it
  must be rebased onto this migration before it ships. Applying this migration to the test
  project replaced P1181's version there (its audience check on this one function is gone on
  test until P1181 is re-applied).
- `get_session_by_code` returns `live_state` to any holder of a room code — assessed, not
  changed; see the private log.

## Post-deploy verification

- `[post-deploy]` Migration `20261014160000_p1491_delivery_status_token_binding.sql` applied to
      prod; read-only catalog shows the new body and anon + authenticated EXECUTE.
- `[post-deploy]` `send-agreement-emails` deployed to prod **after** P1225's
      `20261014130000_p1225_mail_rate_limits.sql` is on prod (the limiter fails closed without
      it: every agreement notice would return 500).
- `[post-deploy]` Authenticated prod smoke passes.
