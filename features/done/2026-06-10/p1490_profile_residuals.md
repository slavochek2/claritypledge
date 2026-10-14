---
status: all-done
type: bug
rank: 1000111
severity: medium
workstream: security
date_reported: 2026-10-14
created_date: 2026-10-14
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, profiles, trust-columns, privacy]
disclosure: public
pipeline_ran: [create-bug, fix, ship]
flow: fix
completed_at: 2026-10-14
---

# P1490: Profile residuals — a client-chosen public date and an over-broad own-profile lookup

## Summary

Two residuals left after P1485/P1137 in the `profiles` hardening:

1. **Public profile date.** `profiles.created_at` is shown publicly as the pledge date, yet a
   signed-in user's own-row write could set it to any value.
2. **Own-profile lookup by address.** The lookup the sign-in callback uses for the legacy
   `/live` migration matched on stored address only, so it could return another regular
   account's row, including columns that are otherwise owner-only.

## Root Cause

1. `profiles` gives client roles a table-level write grant and relies on BEFORE triggers to pin
   every column a client must not choose (P880 technique, extended by P1453, P1485, P1137).
   `created_at` was never added to it, and no RLS check covers it.
2. The lookup's only check was that the requested address equals the caller's auth address; the
   row filter then matched any profile whose stored address equals it case-insensitively,
   regardless of who owns that row.

Reproduction, exact predicates and prod catalog evidence: private security log
(`.private/docs/security-log.md`, entry dated 2026-10-14, P1490).

## Invariants

- `created_at` is server-owned: anon/authenticated INSERT takes the server time, UPDATE keeps
  the stored value. Owner-context writers (`upsert_my_profile`, `migrate_live_profile`, account
  erasure) and service_role pass through (founder decision 2026-10-14: pin on client UPDATE; the
  INSERT pin follows from the same decision once an INSERT path was found — see Fix Approach).
- Pinning never fails the rest of a write: an own-profile edit carrying `created_at` still
  saves every other column.
- `get_my_profile_by_email` returns only the caller's own row, or a legacy `/live` profile
  (owned by an anonymous auth user) matching the caller's confirmed address — the same
  provenance rule `migrate_live_profile` applies before migrating such a row. Never another
  regular account's row. Signature and output keys unchanged.
- Shared guard functions (`guard_profile_trust_columns`, `guard_profile_counters`,
  `guard_profile_test_account`, `guard_profile_banner_credit`) are not redefined — a separate
  guard function, as P1453/P1485/P1137 did.

## Reproduction Steps

See the private security log entry. Role level: (1) a signed-in user writes their own profile
row and the public date keeps the value the write supplied; (2) a signed-in user calls the
own-profile lookup with their own address and receives a row owned by a different account.

**Reproduction rate:** 100% on the test project before the fix (see Evidence).

## Expected Behavior

1. The public date reflects when the row was created by the server and cannot be changed by a
   client.
2. The lookup returns the caller's own row or a legacy `/live` row for their confirmed address,
   else nothing.

## Actual Behavior

1. A client could set the date (backdate or future-date) on UPDATE, and on a first-time direct
   INSERT.
2. The lookup could return another regular account's row (0 such rows on prod today).

## Affected Files

- `supabase/migrations/20261014163511_p1490_profile_created_at_server_owned.sql` — new guard
  function + trigger.
- `supabase/migrations/20261014163512_p1490_profile_by_email_scoped.sql` — lookup row filter.
- `supabase/migrations/20261014163513_p1490_live_migration_keeps_profile_date.sql` —
  `migrate_live_profile` carries the legacy row's `created_at` (every P1137 property unchanged).
- `e2e/integration/20261014163511_p1490_profile_created_at_server_owned.spec.ts`
- `e2e/integration/20261014163512_p1490_profile_by_email_scoped.spec.ts`
- `e2e/integration/20261014071448_p1485_profile_counters_server_owned.spec.ts` — re-insert case
  updated for P1137's client-DELETE revoke (test-only).

No `src/` change: no deployed client writes `created_at` (the sign-in callback's old recovery
re-insert was removed by P1137), and the lookup's one caller keeps every row it legitimately
uses.

## Severity

**Medium** — (1) integrity of a publicly shown date for any account; (2) owner-only columns of
another account, reachable only when stored addresses collide (none on prod today).

## Fix Approach

1. `guard_profile_created_at()` (SECURITY INVOKER, `search_path = ''`), BEFORE INSERT OR
   UPDATE on `profiles`: for anon/authenticated, INSERT sets the column default's own
   expression, UPDATE keeps OLD. INSERT is pinned too because a first-time direct client
   INSERT (no row yet, so no conflict and no UPDATE path) was a working backdating path; no
   deployed client inserts profiles directly, so the pin changes nothing legitimate. Client
   DELETE is revoked (P1137), so an existing row cannot be dropped and re-inserted.
2. `get_my_profile_by_email` keeps its address check and adds a row filter: own row, or an
   anonymous-owned row when the caller's address is confirmed; own row preferred.

## Acceptance Criteria

- [x] A signed-in user's own-profile UPDATE carrying a different `created_at` leaves the stored
      value unchanged and still saves the other fields — `…163511…spec.ts` test 1.
- [x] Same for an own-profile upsert — test 2.
- [x] A first-time direct client INSERT carrying a backdated `created_at` stores the server's
      time — test 3.
- [x] Control: an ordinary own-profile edit (updateProfile shape) saves — test 4.
- [x] Control: the terms re-acceptance write saves — test 5.
- [x] Control: sign-in through `upsert_my_profile` — a new row gets the server time, a returning
      user's date is kept — test 6.
- [x] The `/live` migration through `migrate_live_profile` keeps the legacy row's original date
      (carried server-side; a date in `p_data` is ignored), and the owner-context write is not
      overridden by the client-role guard — test 7 (failed before `…163513`, passes after).
- [x] Control: `migrate_live_profile` with no legacy row creates the caller's row at server
      time — test 8.
- [x] Control: the service role can still set the column — test 9.
- [x] Every P1137 property of `migrate_live_profile` still holds — the P1137 suites (12 + 3)
      pass after `…163513`.
- [x] The lookup does not return a regular account holding the caller's address in another
      letter case, nor one holding the exact address — `…163512…spec.ts` tests 1–2.
- [x] With the caller's own row and another account's case variant both present, only the own
      row comes back (5 repeated calls) — test 3.
- [x] Control: the sign-in callback's `/live` branch end to end — the lookup returns the legacy
      row and `migrate_live_profile` migrates it — test 4.
- [x] Controls: own row returned; another address refused; anon denied with 42501 — tests 5–7.
- [x] Every defect test failed before the fix and every control passed before and after — see
      Evidence.
- [x] Neighbouring profile suites still pass on the test project (P877, P886, P880, P1137 ×2,
      P1321 email pin, P571, P877 reproduce, P1104, P930) — see Evidence for the two
      pre-existing failures outside this change.

## Evidence

Test project, 2026-10-14. Each test run alone (`--retries=0`; the files are serial, so a
combined run stops at the first failure).

Before the migrations: the 6 defect tests FAILED (UPDATE: stored `2025-03-01` became the
supplied `2001-01-01`; lookup returned the other account's id); the 9 controls PASSED.

After `./scripts/migrate.sh --env test` (both versions present in the test ledger; trigger
enabled; `guard_profile_created_at` has no anon/authenticated EXECUTE and the lookup keeps
authenticated-only EXECUTE, read back from the catalog with `get_profile_by_id` as an
anon-executable control): all 15 PASSED.

Neighbouring suites, one combined run after the fix: all passed except two failures that do not
touch either change — P1485's re-insert test (its client DELETE is now refused by P1137, before
any `created_at` write happens) and P414's 160-character bio test (the limit was raised to 2000
by P1259). P930's passive-login test failed once in the combined run (shared admin client
signed in by another file in the same worker) and passed alone.

Review follow-up (`…163513`): the migration control was strengthened to seed a distinct
historical date on the legacy row and assert it survives. Before `…163513` it FAILED (received the
migration time instead of 2024-02-29); after applying it to TEST, the P1490 files (9 + 7) and the
P1137 files (12 + 3) — 31 tests — all PASSED in one run, with `migrate_live_profile` keeping
authenticated-only EXECUTE (catalog read-back, `get_profile_by_id` as the anon control).

P1485's re-insert case is updated on this branch the way P1137 updated P880/P1453: it now asserts
the client DELETE is refused (42501), clears the row with the service role, and keeps asserting
that the client INSERT carrying non-zero counters stores 0/0. That suite: 7/7 pass on TEST.

## Post-deploy verification

Run after the prod apply (not a completion gate — prod cannot be verified pre-merge):

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- [post-deploy] Both migrations applied to prod; read-only catalog check shows the
      `guard_profile_created_at` trigger on `public.profiles` and the lookup's new row filter.
- [post-deploy] Authenticated prod smoke passes after apply.
