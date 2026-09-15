---
status: in-progress
type: bug
rank: 100
severity: high
workstream: transcribe
date_reported: 2026-09-15
created_date: 2026-09-15
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, rls, transcribe, drift]
disclosure: embargo
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: src/tests/p1315-reproduce.test.ts
  root_cause: "P1236's contract migration dropping the P1149 self-insert policy was never committed; replaying the repo's migrations leaves the policy, which is prod's state"
  confidence: high
  surfaces_in_scope: [transcribe_room_members-insert-policy]
  surfaces_deferred: []
  reproduced_at: 2026-09-15
---

# P1315: Prod still carries the legacy direct room-membership INSERT policy

## Summary

`transcribe_room_members` on **prod** still has P1149's `"authenticated users can join as themselves"`
INSERT policy. P1236 designed its removal as the contract half of an expand/contract pair
(`20260908170100_p1236_b_drop_direct_member_insert.sql`), but that file was never committed — it lived
untracked in a since-removed worktree — and was never applied to prod. Surfaced 2026-09-15 by
`scripts/rls-drift-check.py` as a PROD-ONLY finding.

## Root Cause

Process gap, verified by command, not inferred:

- `git log --all -S 'drop_direct_member_insert'` → only the two commits that *mention* the file
  (27aa2b4a0, 030c6529f); no commit adds it. No copy on disk.
- Test `supabase_migrations.schema_migrations` has version `20260908170100` with `statements = NULL`
  (applied by hand to test). Prod has no such version.
- The P1236 spec (`features/done/2026-06-10/p1236_…md`, "The contract migration is held back
  deliberately") held it until main's client stopped direct-inserting. That condition is now met:
  main joins only through `enter_transcribe_room` / `join_transcribe_room`
  (`src/app/data/transcribe-service.ts:245`, `:361`); grep finds no `.insert` on
  `transcribe_room_members` in `src/`.

Exploit-level detail and the prod measurements live in `.private/docs/security-log.md`, 2026-09-15.

**Reproduced 2026-09-15 on TEST, inside a DO block that always raises (full rollback):** with the
policy recreated, a signed-in user's direct INSERT was ACCEPTED and the row carried no consent;
without it, the same INSERT was REFUSED ("new row violates row-level security policy"). Afterwards
test still showed 0 INSERT policies and 0 probe rows. Canary: `src/tests/p1315-reproduce.test.ts`
replays the migration history and fails while any INSERT policy on the table survives it.

## Invariants

- A `transcribe_room_members` row is created only by a SECURITY DEFINER RPC that records consent in
  the same statement (P1236 Decision 5). No client-writable INSERT path may exist.
- The drop must be verified against the live catalog (`pg_policies`), never against the file text.
- The legitimate join path (a signed-in user entering a room through the RPC) must keep working.

## Reproduction Steps

1. Prod catalog, read-only: `select policyname from pg_policies where tablename='transcribe_room_members' and cmd='INSERT'`.
2. Observe: `authenticated users can join as themselves` is returned.
3. Test catalog, same query: no rows.

**Reproduction rate:** 100% (catalog state).

## Expected Behavior

Prod and test agree: no client INSERT policy on `transcribe_room_members`; membership is created only
through the consent-recording RPCs.

## Actual Behavior

Prod accepts a direct INSERT from any signed-in caller whose row names their own profile id, with no
consent and no room cap.

## Affected Files

- `supabase/migrations/20260823190000_p1149_transcribe_room_tables.sql:107` — creates the policy.
- `supabase/migrations/20260908170000_p1236_transcribe_consent_and_limits.sql:204` — records that the
  contract migration removes it.
- New: `supabase/migrations/20260908170100_p1236_b_drop_direct_member_insert.sql` — recreated.
- `scripts/anon-execute-allowlist.txt` — same drift triage: the guest seat pair classified.

## Severity

**High** — authorization gap on an authenticated surface; bounded because it needs a room UUID and
prod shows no use (11 members, all pre-P1236, 0 since the P1236 deploy).

## Fix Approach

Recreate the contract migration under its original version number (so test's existing
`schema_migrations` record matches a real file and migration history stays linear):
`DROP POLICY IF EXISTS "authenticated users can join as themselves" ON public.transcribe_room_members;`
plus a catalog verification block. Verify on test inside a rolled-back transaction first
(test already lacks the policy, so the real apply is a no-op there), then apply to prod with the
founder's OK.

Rejected alternative: a NEW timestamp. It would leave test's orphaned `20260908170100` record without a
file, which `migrate.sh`'s history comparison would keep flagging.

## Acceptance Criteria

- [x] The migration file exists, is committed, and its verification block asserts the policy is absent via `pg_policies` — dry-run on test inside BEGIN/ROLLBACK (rollback control-probed: a table created in the same wrapper was absent afterwards) completed without raising; `migrate.sh` (test) matched the ledger row by name: `20260908170100_p1236_b_drop_direct_member_insert.sql (already applied, skipping)`
- [x] On test, a signed-in user's direct INSERT into `transcribe_room_members` is refused, while entering a room through the RPC still succeeds — `e2e/integration/20260908170100_p1236_b_drop_direct_member_insert.spec.ts` 3 passed (refusal + admin-seed control + consented-join control); `src/tests/p1315-reproduce.test.ts` 2 passed after the fix, 1 failed / 1 passed before
- [ ] [post-deploy] On prod, `pg_policies` no longer lists the policy and `rls-drift-check.py` reports no PROD-ONLY finding for `transcribe_room_members`
- [x] Anon allowlist carries the two guest seat entries with real call sites; `function-grant-drift-check.py` no longer gates on them — re-run 2026-09-15: gating set is only the three unlisted helpers; `claim_joiner_seat(text,text)` and `release_joiner_seat(uuid,text)` absent from it

## Resolution

**Root cause:** P1236's contract migration was never committed and never reached prod.
**Fix:** recreated under its original version and name (matching test's ledger row), with a catalog
verification block that fails the apply if any INSERT/ALL policy remains, if the roster SELECT policy
is gone, or if RLS is off. Prod apply is a founder-approved step (DROP on prod).
