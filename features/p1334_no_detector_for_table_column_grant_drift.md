---
status: backlog
type: bug
rank: 13
severity: low
workstream: infra
date_reported: 2026-09-21T00:00:00.000Z
created_date: 2026-09-21T00:00:00.000Z
drafted_by: opus
exec_model: opus
exec_effort: medium
tags:
  - test-db-drift
  - privacy
  - drift-check
disclosure: public
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P1334: Nothing compares table or column SELECT grants between test and prod

## Summary

P1333's `readiness_value` grant sat open on test for four weeks (2026-08-24 → 2026-09-21), and
`comprehension_rating` sat closed there for three (until a manual grant on 2026-09-14). No
drift check noticed either one. The only thing that caught them was one assertion inside
`e2e/integration/p1114-room-rpcs.spec.ts`, which exists for that one column on that one table.

## Root Cause

Every existing detector covers something else:

| Check | Covers | Misses |
|---|---|---|
| `scripts/rls-drift-check.py` (P1048) | policies: prod-only, absent-from-migrations, unconditional writes | table/column GRANTs (stated at line ~578); test-only policies are reported but do not gate |
| `scripts/function-grant-drift-check.py` | EXECUTE on functions | table and column grants (stated at line ~871) |
| `scripts/check-p1207-privilege-floor.py` | four banned privileges (TRUNCATE/REFERENCES/TRIGGER/MAINTAIN) | SELECT/INSERT/UPDATE differences between environments |

**How the drift got in:** a migration that has already run gets applied again under a new
version number. P1042 renumbered `20260819160000_p1114_event_room_tables` to `…161000`, and
`migrate.sh` then treated it as pending on test and re-ran it after the `20260821*` follow-ups
had superseded it. Its REVOKE-then-GRANT replayed a stale column list. The same re-run brought
back the 2-arg `set_room_opt_in` (later dropped by P1256) and the
`"opted-in room members are visible"` policy (dropped by P1333). The idempotency check P1042
did before the rename asked whether re-running would *fail*. It never asked whether it would
*revert* anything.

## Expected Behavior

An anon/authenticated table or column privilege that differs between test and prod is
reported by the scheduled drift workflow. It asks `has_table_privilege()` /
`has_any_column_privilege()`, which is what `check-p1207-privilege-floor.py` already does and
what its own header requires: **neither `information_schema` (TRAP 1: role-filtered) nor raw
`aclexplode()` (TRAP 2: misses owner-default NULL ACLs and role-membership-derived grants) —
"both will pass their tests, pass review, and silently stop detecting things"**
(`scripts/check-p1207-privilege-floor.py:51-78`). Grants that differ on purpose (a branch still
on test) go on an allowlist with a reason.

## Actual Behavior

The difference goes unreported until one specific integration assertion happens to fail.

## Affected Files

- `.github/workflows/check-deploy-drift.yml` (the home for scheduled detection, per decisions.md "Monitoring is a scheduled workflow")
- `scripts/rls-drift-check.py` or a sibling `scripts/table-grant-drift-check.py`

## Fix Approach

Add a leg that diffs, per project, `has_table_privilege(role, table, priv)` and
`has_any_column_privilege(...)` — plus a per-column `has_column_privilege(...)` pass, since the
column-only grant is exactly the case P1333 was — for `anon`, `authenticated` and `public`
across SELECT/INSERT/UPDATE/DELETE. Reuse the query shapes in
`check-p1207-privilege-floor.py` (TABLE_PRIVS_SQL / COLUMN_PRIVS_SQL) rather than writing new
ACL parsing. Include a known-bad control: a synthetic pre-P1333 test row
(`readiness_value` selectable by anon on test only) must be reported, and a known-good control
(`client_secret`, closed on both) must not be.

## Acceptance Criteria

- [ ] Detector reports a table/column privilege held by anon/authenticated on one project and not the other
- [ ] Controls, both scored by the same probe: a synthetic pre-P1333 state (readiness_value selectable by anon on test only) is reported, and `client_secret` (closed on both) is not; current live state is clean or allowlisted
- [ ] Runs on the scheduled drift workflow, not only in a skill
- [ ] Optional, decide during fix: `migrate.sh` warns when a pending file's SQL body matches a migration already in the ledger under another version (the renumber-replay class)
