---
status: all-done
type: bug
rank: 1000961.0
severity: critical
date_reported: '2026-08-10'
created_date: '2026-08-10'
date_resolved: '2026-08-10'
root_cause: "20260219_service_role_test_policies.sql created 5 CREATE POLICY statements without a TO service_role clause, defaulting them to PUBLIC; a correctly-scoped duplicate of each already existed, so the unscoped ones were pure duplicates that widened access"
resolution: "New migration drops the 5 unscoped duplicate policies; scoped duplicates untouched. Applied to prod via ./scripts/migrate.sh --env prod --yes, prod smoke test 8/8 passed, live pg_policies query confirms no remaining unscoped true-check policy on the 3 affected tables."
tags: [security, rls, prod, service-role]
pipeline_ran: [create-bug, fix]
completed_at: 2026-08-10
---

# P1035: Service-role test-data bypass policies are not scoped to the service role on prod

## Summary

Three RLS policies created for test-data setup (`points`, `point_positions`, `profiles`) are
named and documented as service-role-only but were never restricted to that role — on
**production**, they currently apply to every role, including anonymous and regular authenticated
sessions. This is unrelated to and unaffected by P1032; both are safe to ship independently.

## Root Cause

`supabase/migrations/20260219_service_role_test_policies.sql` creates several `CREATE POLICY`
statements intended to let the service role bypass RLS for test-data setup, but omits the `TO
service_role` clause required to actually restrict them. An unqualified `CREATE POLICY` defaults
to every role. A correctly-scoped duplicate of each policy already exists (created by earlier
migrations), so the unscoped ones are pure duplicates that widen access without providing any
functionality nothing else already covers.

**This repo is public and the gap is unpatched — exploit-level detail (exact policy definitions,
verification queries, blast-radius specifics) is intentionally not restated here.** See
`.private/docs/security-log.md` (2026-08-10 entry) for the full technical record.

## Reproduction Steps

Not included here — see the private security log. Verified directly against production's live
policy catalog and role grants (read-only queries, no write attempted) rather than by executing
an exploit.

## Expected Behavior

Only the service role (used by test helpers and internal tooling) can bypass the normal
verification/ownership checks on these tables. Anonymous and regular authenticated sessions go
through the standard policies only.

## Actual Behavior

On production, the standard policies are moot for three tables because a permissive
always-true policy exists alongside them and applies to every role — Postgres RLS ORs permissive
policies together, so any one unrestricted policy defeats the others for that operation.

## Affected Files

- `supabase/migrations/20260219_service_role_test_policies.sql` — the migration that introduced
  the unscoped policies (do not edit historical migrations; fix via a new corrective migration)

## Severity

**Critical** — live on production, requires no authentication to reach, affects core
user-generated-content tables. No read-side exposure (SELECT policies are unaffected); this is a
write-side integrity gap only. Test DB is not affected.

## Fix Approach

New migration that drops the three unscoped duplicate policies. The correctly-scoped
service-role-only versions already in place continue to serve the legitimate test-data use case
unchanged — nothing else needs to change. Run on prod only with explicit go-ahead per this repo's
prod-migration rule.

## Acceptance Criteria

- [x] The unscoped duplicate policies no longer exist on prod — confirmed via live `pg_policies`
      query, 2026-08-10
- [x] The scoped service-role-only policies still exist and are unchanged — confirmed in the same
      query (`"Test data: service_role bypass for {table}"` present for all 3 tables)
- [x] Existing e2e test-data setup/teardown continues to work — `e2e/integration/p1032-reproduce.spec.ts`
      (exercises `createTestUser`/`deleteTestUser` via the service-role path) passed 4/4 on test DB
      after applying the equivalent migration there
- [x] A verification query against prod `pg_policies` confirms no remaining `roles={public}` +
      always-true policy on `points`, `point_positions`, or `profiles` for INSERT/UPDATE/DELETE —
      confirmed, only the legitimate public SELECT policy on `profiles` remains in that shape
- [x] No regression in normal user story/point/position creation flows — prod smoke test
      (`scripts/prod-smoke-test.mjs`, runs automatically after `migrate.sh --env prod`) passed 8/8,
      including a full authenticated story INSERT/SELECT/DELETE roundtrip
