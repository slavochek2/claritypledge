---
status: week
type: bug
rank: 106
severity: medium
workstream: infra
date_reported: 2026-09-17
created_date: 2026-09-17
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, grants, drift-check, day]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1327: Function grant drift check reports 4 NEW anon grants it can never resolve, so it is red every day

## Summary

`scripts/function-grant-drift-check.py --summary` exits 1 on every `/day` with "4 NEW" anon-executable
functions (`/day` finding INBOX-P23, 2026-09-17). None of the four is a new exposure. They are three
different shapes the allowlist either has no category for or was not updated for, and a gate that is
red for understood reasons is the gate most likely to be ignored when it goes red for a real one.

## Root Cause

Verified by grep against `supabase/migrations/` and `src/` on 2026-09-17:

1. **`release_joiner_seat(uuid,text,uuid)` — stale allowlist signature.** P1314 C
   (`20260915100000_p1314_c_release_requires_the_seat_secret.sql:139-202`) dropped the `(uuid,text)`
   overload and granted the three-argument one to anon. `scripts/anon-execute-allowlist.txt:93` still
   lists the dropped two-argument signature. The allowlist's own section header says a signature
   change "must be re-listed by the change that makes it"; P1314 did not. The anon call site is real
   and current: `src/app/data/api.ts:1468`.
2. **`can_read_clarity_session(uuid)` and `can_read_verification_message(uuid)` — no category exists.**
   Their anon grant is load-bearing: RLS policies call them in `USING`
   (`20260901180000_p1207_session_children_inherit_parent_scope.sql:70,75,80`,
   `20260903103000_p1207_fix_verification_scope_definer.sql:52`), and a policy predicate runs as the
   querying role. The allowlist's rule 1 wants a client call site (there is none) and rule 2 calls
   anything without one backlog (it is not). Recorded in `docs/decisions.md` 2026-09-10 [technical]
   as a founder decision; the founder delegated it on 2026-09-17.
3. **`event_grace_interval()` — a grant nothing needs.** Granted to anon in
   `20260907130000_p1256_event_grace_interval_12h.sql:50`. Every caller is SECURITY DEFINER:
   `join_event_room`, `set_room_readiness`, `set_room_opt_in`, `reset_room_answer` (P1256), and
   `assert_transcribe_event_access` (INVOKER, but revoked from anon/authenticated and reached only
   from the DEFINER functions `enter_transcribe_room`, `create_transcribe_room`,
   `join_transcribe_room`). No policy or view references it. e2e reads it via the service role.
   Harmless while it stands: it returns a constant and reads nothing.

## Invariants

- An allowlist entry is evidence, not reasoning. A new category must cite something a check can
  verify mechanically, never prose that only looks like a justification (allowlist header, rule 1).
- Anon EXECUTE on a function that an RLS policy predicate calls must never be revoked as "unused" —
  revoking it breaks anon reads of the protected tables.

## Reproduction Steps

1. From the main checkout with prod read access, run `python3 scripts/function-grant-drift-check.py --summary`.
2. Observe: `FUNCTION GRANT DRIFT: 4 NEW ...`, exit 1, naming the four signatures above.

**Reproduction rate:** 100% (every `/day` since P1314 C applied).

## Expected Behavior

The check is green unless a genuinely unclassified anon grant appears. Policy-required grants are
listed with a citation the checker verifies. A removable grant is removed.

## Actual Behavior

Exit 1 every day for four understood grants; `/day` files the same high-severity finding each run.

## Affected Files

- `scripts/anon-execute-allowlist.txt:93-97` — stale signature; the "NOT LISTED" note for the three
- `scripts/function-grant-drift-check.py` — `load_allowlist` (~line 315) has no notion of a category
- `scripts/test-function-grant-drift-check.py` — needs the new category's accept and reject cases
- `supabase/migrations/` — new REVOKE migration for `event_grace_interval()`

## Severity

**Medium.** No exposure, but a permanently red security gate trains its readers to skip it.

## Fix Approach

1. Re-list `release_joiner_seat(uuid,text,uuid)` with the current call site; remove the dropped signature.
2. Add a `policy:` category. An entry reads
   `can_read_clarity_session(uuid)  # policy: supabase/migrations/<file>.sql:<line> — <reason>`.
   `load_allowlist` rejects a `policy:` entry unless the cited file exists, the cited line names the
   function, and a `CREATE POLICY` statement is open at that line (the nearest preceding statement
   start is `CREATE POLICY`). A call-site entry is unchanged.
3. New migration: `REVOKE EXECUTE ON FUNCTION public.event_grace_interval() FROM anon, PUBLIC;` plus an
   integration assertion that anon cannot execute it and that the room RPCs still pass their existing
   e2e. The `authenticated` grant is out of scope (this check gates anon only).
4. Rejected: *allowlist the two policy functions as ordinary entries* (rule 1: no call site), *baseline
   them as known-open* (the baseline means backlog, which is false for them), *revoke and see what
   breaks* (destructive probe against prod RLS, epistemic gate 2b). All three are from decisions.md 2026-09-10.

## Acceptance Criteria

- [x] `function-grant-drift-check.py --summary` resolves three of the four: on 2026-09-17, live prod vs test, it reports only `event_grace_interval()` (anon-unlisted on prod, and grant-differs because test is already revoked) — `2 NEW`, down from 4. `[post-deploy]` re-run after the migration reaches prod; expect 0 NEW and exit 0
- [x] A `policy:` entry whose cited line does not name the function, or is not inside a `CREATE POLICY`, is rejected with a message naming the line. Proven by mutating the REAL allowlist, not a synthetic fixture (epistemic gate 7d). Hardened after hostile review (Codex Sol, Gemini 3.8, Opus): comments, string literals, another schema, wrong arity, a policy dropped later, a policy never applying to anon, and a citation outside `supabase/migrations/` are all refused. Mutants for stripping, drop check and arity each fail
- [x] The existing checker tests still pass (legitimate call-site entries still accepted, gate 7c) — 64/64. Two stubs broken by P1214 had stopped every later section from running; fixed
- [x] On test, anon is refused at the grant — `e2e/integration/p1327-event-grace-interval-grant.spec.ts`, red before the migration, green after. `[post-deploy]` re-verify on prod once the migration applies
- [x] The P1256 and P1307 room e2e specs still pass on test after the revoke — 13 passed
