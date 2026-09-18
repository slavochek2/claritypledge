---
status: week
type: bug
severity: low
workstream: events
date_reported: 2026-09-18
created_date: 2026-09-18
drafted_by: opus
exec_model: opus
exec_effort: medium
tags: [p1114-followup, test-db-drift, privacy]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
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

## Done when

1. Root cause named: which migration or manual change left the grant open on test (compare
   `supabase_migrations.schema_migrations` on both projects; check later migrations that
   re-GRANT on `event_room_members`, e.g. P1307/P1315).
2. The column grant on test matches prod (re-apply the revoke-then-column-grant idiom on test
   only; if a migration is at fault, fix it forward so a fresh apply is also correct).
3. `npx playwright test --project=integration e2e/integration/p1114-room-rpcs.spec.ts` → 23/23.
4. Control: the same column-privilege query returns identical rows on both projects.
