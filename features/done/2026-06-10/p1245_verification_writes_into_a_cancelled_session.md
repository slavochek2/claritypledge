---
status: all-done
type: bug
disclosure: public
rank: 55
severity: low
date_reported: '2026-09-04'
created_date: '2026-09-04'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [privacy, rls, erasure, live-session]
pipeline_ran: [create-spec, inline, ship]
completed_at: 2026-10-14
---

# P1245: a paraphrase can still be written into a session the erased user closed

## Problem

`erase_my_account()` (P520) sets every session the leaver shared to `status = 'cancelled'`, and
the INSERT policies on `clarity_live_turns`, `clarity_demo_rounds` and `clarity_ideas` refuse
writes into a cancelled session. **`clarity_verifications` does not carry that clause**, so a
surviving counterparty can still insert a paraphrase against a message in a session the erased
user closed by leaving.

It was omitted for a structural reason, not an oversight in the predicate: the other three tables
have a `session_id` column and the guard is one line. `clarity_verifications` has no session
reference — its session is reachable only through `message_id -> clarity_chat_messages.session_id`
— so the same clause cannot be expressed without a join.

**Correction (2026-10-14, verified against both catalogs):** prod does carry a nullable
`session_id` on this table (added by `20251221_rls_security_improvements.sql` for realtime
filtering); the test project does not, and test carries a legacy `on_verification_created`
trigger that prod lacks. Neither changes the fix below. The investigation also found the INSERT
policy was broader than this section describes — it was not bound to the caller's session at
all — with detail kept in the private security log rather than here.

**Blast radius is narrow, and stating it honestly matters more than the fix.** What gets written
is the *counterparty's own* paraphrase text, not the erased user's data, so this does not recreate
erased personal data and is not a GDPR erasure failure. It is a write into a conversation the
erased user ended. The live page carries no cancelled-status check of its own (verified 2026-09-04
— `clarity-live-page.tsx` has no session-status guard), so these policies are the only control;
whether the counterparty's client can still *reach* a cancelled session to trigger the write is
NOT established and is the first thing to determine.

## Appetite

Small — but it is a write-path change on the core live flow, which is why it was not folded into
P1243 as a footnote.

## Findings (2026-10-14)

**There is no live writer or reader.** Every client path to this table is dead code:

- The page that wrote it (`clarity-chat-page.tsx`) was deleted in P803; `/clarity-chat` now
  redirects (`src/App.tsx`).
- `createVerification`, `rateVerification`, `setVerificationPosition`, `getVerificationsForSession`
  and `subscribeToVerifications` in `src/app/data/api.ts` have zero call sites;
  `getVerificationsForMessage` is called only by a mocked unit test.
- No edge function, script or e2e helper writes it (grep of `src/`, `supabase/functions/`,
  `scripts/`, `e2e/`, `api/`, `cloud-functions/`, `services/`, `tools/`).
- Prod catalog (read-only): the only function referencing it is `erase_my_account()` (SECURITY
  DEFINER, deletes the leaver's rows); no view in `public` at all; no trigger on prod; newest of
  its 8 prod rows is from 2025-12-27.
- Clients hold no privilege on `clarity_chat_messages`, the parent table, on either environment.

**Reachability:** the UI cannot reach a write — there is no UI writer. Only a direct API call
could, which is why this is closed at the grant layer rather than left as defence-in-depth.

## Solution

**Revoke client write access instead of adding the join guard.** The originally proposed
`NOT EXISTS (... s.status = 'cancelled')` predicate would add a two-table join to a write path
that no product flow exercises, and would leave a client write path open on a table nobody uses.
Removing the path closes the cancelled-session gap and the broader unbound-INSERT gap together.

Migration `20261014090000_p1245_verifications_client_write_revoke.sql`:

1. Drop the client INSERT policy.
2. Revoke every non-read privilege (`INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`) from
   `PUBLIC`, `anon`, `authenticated` at table level, which also clears same-type column grants.
3. `COMMENT ON TABLE` recording that the table is read-only to clients and that a revived writer
   needs a new session-bound policy that also refuses cancelled sessions.
4. A deploy-time `DO` block asserting no client write privilege (table- or column-level, via
   `has_any_column_privilege`) and no non-SELECT policy remain, and that SELECT, `service_role`
   writes and the erasure path's effective authority (exact zero-arg `erase_my_account()`,
   SECURITY DEFINER, owner holds DELETE) survive. Both new failure paths were exercised on test in
   rolled-back probes and raise.

**SELECT is deliberately unchanged** — its policy and the anon branch belong to P1207/P1302, and
removing the read path is a design change to P1302, not part of this fix.

## Risks / Non-Goals

- **A revived client writer would fail loudly** (42501). That is the intended signal: it must
  arrive with its own session-bound, cancelled-aware policy, not by restoring the dropped one.
- The original hot-path false-positive risk no longer applies — no predicate is added to any
  live write path.
- Non-goal: deleting the dead `api.ts` functions or the legacy table itself (separate cleanup).
- Non-goal: reconciling the test/prod schema drift noted above.

## Done-When

Superseded by the revoke shape: the join-guard predicate, its `pg_get_expr` assertion and the
per-round false-positive matrix (the original Done-When) — there is no predicate to assert and no
legitimate client write to protect.

- [x] Reachability established and recorded: no UI or code path writes this table (Findings above).
- [x] Client write privileges revoked and the client INSERT policy dropped, asserted at deploy time
      by the migration's `DO` block (applied to test 2026-10-14; catalog: `anon=r`, `authenticated=r`,
      only the SELECT policy remains).
- [x] Fail-first test: `e2e/integration/20261014090000_p1245_verifications_client_write_revoke.spec.ts`
      — a participant's INSERT (active AND cancelled session), UPDATE and DELETE are refused by this
      table's grant layer (42501); 4 failed before the migration, all pass after.
- [x] Legitimate paths unaffected: participant SELECT, `service_role` write, and
      `erase_my_account()` deleting the leaver's verifications all pass before and after; sibling
      suites `p1138-reproduce`, `p1207-session-child-scope`, `p520-account-deletion` green.
- [x] The residual note in `20260902090000_p520_erasure_hardening.sql` is superseded by the new
      migration's header (applied migrations are never edited) and by `docs/technical/database.md`.

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- [post-deploy] Prod catalog shows `anon`/`authenticated` with SELECT only on
      `clarity_verifications` and no INSERT policy.
