---
status: qa
type: bug
rank: 82
severity: low
workstream: events
date_reported: 2026-09-18
created_date: 2026-09-18
drafted_by: opus
exec_model: opus
exec_effort: medium
tags: [p1114-followup, test-db-drift, privacy]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
date_resolved: 2026-09-21
root_cause: "P1042's renumber (2026-08-24) made migrate.sh re-run 20260819161000_p1114_event_room_tables on test after 20260821170000 had revoked readiness_value; its REVOKE-then-GRANT replayed the pre-170000 column list. A 2026-09-14 manual grant of comprehension_rating on test (P1307 session) patched the other half of the symptom without noticing readiness."
resolution: "Re-applied 170000's revoke-then-column-grant idiom on TEST only via the Management API, and dropped the orphaned 'opted-in room members are visible' policy the same re-run had recreated. No migration: a fresh apply in version order is already correct."
---

# P1333: The TEST database lets anyone read room readiness values; prod does not

## Summary

`event_room_members.readiness_value` is meant to be unreadable by clients: the room roster
is public by name, so exposing readiness next to it would link a person to how "up for
thinking" they said they were (migration `20260821170000_p1114_room_readiness_distribution.sql`
exists to prevent exactly that join). On **prod** the column grant is correct. On the
**test** project it has drifted open.

## Evidence (measured 2026-09-18, column privileges read directly)

| Project | anon can SELECT `readiness_value` | authenticated can SELECT | anon can SELECT `display_name` |
|---|---|---|---|
| prod (`besjtu…`) | **false** | **false** | true |
| test (`gfjcty…`) | **true** | **true** | true |

Symptom: `e2e/integration/p1114-room-rpcs.spec.ts` → "room readiness has no expiry …" fails on
test with *"readiness_value is still selectable alongside display_name"*. The same assertion
would pass on prod. Not caused by P1114's 2026-09-18 migrations (they grant only EXECUTE on
functions, nothing on the table).

## Why it matters (not urgent)

No user impact — prod is correct. But a test database that is already open cannot catch a
future change that re-opens readiness on prod: that regression would pass on test. Second
known test-only drift in this area (see the 2026-09-07 note in
`20260907150000_p1256_drop_legacy_set_room_opt_in.sql`).

## Done-When

- [x] Root cause named: which migration or manual change left the grant open on test (compare
   `supabase_migrations.schema_migrations` on both projects; check later migrations that
   re-GRANT on `event_room_members`, e.g. P1307/P1315).
- [x] The column grant on test matches prod (re-apply the revoke-then-column-grant idiom on test
   only; if a migration is at fault, fix it forward so a fresh apply is also correct).
- [x] `npx playwright test --project=integration e2e/integration/p1114-room-rpcs.spec.ts` → 23/23.
- [x] Control: the same column-privilege query returns identical rows on both projects.

## Resolution (2026-09-21)

### 1. Root cause: a migration re-run on test, not a migration bug

Timeline on **test** (`gfjcty…`):

| When | What ran | `readiness_value` | `comprehension_rating` |
|---|---|---|---|
| 2026-08-21 | `20260821120000` then `20260821170000` | closed | open, correct |
| 2026-08-24 | P1042 (`3c7808179`) renumbered `…160000` → `20260819161000_p1114_event_room_tables` and `migrate.sh --env test` **re-ran it** (`✓ 20260819161000_p1114_event_room_tables.sql applied`). Lines 107–109: table-level REVOKE (which, per the Postgres REVOKE docs, also revokes every column grant) then `GRANT SELECT (…, readiness_value, joined_at)` | **open** | closed |
| 2026-09-14 | P1307 session saw `permission denied` on `comprehension_rating` and ran a manual `GRANT SELECT (comprehension_rating)` on test | open | open |

Result: test ended up in exactly the `20260821120000` state. Prod never re-ran anything. There,
161000 ran for the first time *before* the `20260821*` follow-ups, so the order was correct.

The same 08-24 re-run also:
- recreated the 2-arg `set_room_opt_in(uuid, boolean)` from `20260819171000`. That is the
  "test-only drift" `20260907150000_p1256_drop_legacy_set_room_opt_in.sql` found and put down
  to "the 2026-08-21 drop did not take on test". The drop did take; the re-run brought it back.
- recreated policy `"opted-in room members are visible"` (`161000:128-132`), which `120000:65`
  had dropped. It was harmless (OR'd with `"all room members are visible"` USING `true`), but it
  was still drift.

No migration is at fault: applied fresh in version order, 161000 → 120000 → 170000 ends
correct. The cause was re-applying an already-superseded file under a new version number.
The same class is now P1334.

### 2. Fix, applied to test only (Management API, one transaction)

```sql
REVOKE SELECT ON public.event_room_members FROM PUBLIC;
REVOKE SELECT ON public.event_room_members FROM anon, authenticated;
GRANT SELECT (id, event_id, profile_id, display_name, opted_in, comprehension_rating, joined_at)
  ON public.event_room_members TO anon, authenticated;
DROP POLICY IF EXISTS "opted-in room members are visible" ON public.event_room_members;
```

### 3. Evidence

- Before: `p1114-room-rpcs.spec.ts` → **22 passed, 1 failed** ("room readiness has no expiry …").
- After: `npx playwright test --project=integration e2e/integration/p1114-room-rpcs.spec.ts` → **23 passed**.
- Blast radius: `p1114-db-schema.spec.ts` + `p1114-realtime-payload.spec.ts` → **14 passed**.
- Control (AC4): `has_column_privilege(anon|authenticated, event_room_members, <col>, 'SELECT')`
  for every column returns **identical rows on prod and test**. The probe discriminates: before the
  fix the same query differed on `readiness_value`. `client_secret` (closed on both) and
  `display_name` (open on both) act as fixed controls.
- `pg_policies` on `event_room_members`: one policy on each project, `"all room members are visible"`.

### Out of scope, observed

A wider prod/test diff (every public column ACL, policy and function hash) shows other
differences: letter/audience functions, `point_references`, `worktree_status`, `_p1212_v`. These
look like unshipped branches deployed to test, not this re-run, and none touch the event room.
They were not investigated further.

Filed during this fix: **P1334**, no detector compares table/column grants between test and prod.
