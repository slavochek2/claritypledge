---
status: all-done
type: bug
rank: 1000108
severity: high
workstream: security
date_reported: 2026-10-14
created_date: 2026-10-14
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [security, profiles, trust-columns, rls]
disclosure: public
pipeline_ran: [create-bug, fix, ship]
flow: fix
completed_at: 2026-10-14
---

# P1485: Signed-in users can alter server-maintained public profile values

## Summary

Two profile values that the database maintains on its own and shows publicly as a person's
track record could be written by the profile's owner, so anyone could set their own public
numbers.

## Root Cause

`profiles` gives client roles a table-level write grant and relies on BEFORE triggers to pin
every column a client must not choose (the P880 technique; P1453 extended it the same way for
a later column). The two practice counters (`ears_count`, `verification_session_count`) were
added before that technique existed and were never added to it, so an owner's own-row write
carried whatever values it sent. Reproduction, exact predicates and the prod catalog evidence
are in the private security log (`.private/docs/security-log.md`, entry dated 2026-10-14,
P1485).

## Invariants

- These counters move only through the database's own counter paths — the counter trigger on
  `story_verifications` and account erasure, both running in owner context — or the service
  role. Never through an anon/authenticated write to `profiles`.
- Pinning a column must not fail the rest of the write: an own-profile edit that also carries
  a pinned column still saves every other column (same behaviour as P880/P1453).
- `guard_profile_trust_columns` is not redefined for this — a separate guard function, so
  concurrent work on the shared guard cannot collide with it.

## Reproduction Steps

See the private security log entry. Summary at role level: a signed-in user writes their own
profile row; the two counters keep the values the write supplied.

**Reproduction rate:** 100% (test project, before the fix — see Evidence).

## Expected Behavior

A client write to the owner's profile leaves both counters as the server last set them (UPDATE)
or starts them at 0 (INSERT); the rest of the write saves.

## Actual Behavior

The counters take the client-supplied values and are then shown publicly.

## Affected Files

- `supabase/migrations/20261014071448_p1485_profile_counters_server_owned.sql` — new guard
  function + trigger (the fix).
- `e2e/integration/20261014071448_p1485_profile_counters_server_owned.spec.ts` — fail-first
  tests and legitimate-path controls.

## Severity

**High** — integrity of public reputation numbers for every account; no data exposure.

## Fix Approach

Add `guard_profile_counters()` (SECURITY INVOKER, `search_path = ''`), fired BEFORE INSERT OR
UPDATE on `profiles`: for anon/authenticated, INSERT sets both counters to 0, UPDATE keeps OLD.
Owner-context writers (the definer counter trigger, `erase_my_account`) and `service_role` pass
through. No EXECUTE granted to any client role (trigger functions need none to fire).

## Other profile columns reviewed (2026-10-14)

Every `profiles` column is client-writable at the grant level; what pins each is a trigger or
RLS. Reviewed against the prod catalog and the code that writes each column:

- **Pinned already:** `is_verified`, `has_pledged`, `is_admin`, `is_certifier`, `email`
  (trust guard), `banner_credit` (P1453 guard), `id` (RLS), `is_test_account` on UPDATE (RLS).
- **Fixed here:** `ears_count`, `verification_session_count`.
- **Client-written by design:** `name`, `slug` (reserved prefixes checked), `role`,
  `linkedin_url`, `reason`, `avatar_*`, `bio`, `links`, `banner_url`, `banner_mobile_url`,
  `banner_generation_attempted` (generation is rate-limited server-side), `pledge_version`
  (P930), `accepted_terms_version`.
- **Ambiguous — listed, not fixed:** `created_at` (server default, shown publicly as the
  pledge date, but a client recovery path in the sign-in callback re-inserts it);
  `is_test_account` on the INSERT path (RLS pins it on UPDATE only); `updated_at`. Each needs
  a product call before pinning — see the private log for detail.

## Acceptance Criteria

- [x] With both counters seeded to distinct non-zero values, a signed-in user's own-profile
      UPDATE carrying forged counters leaves them exactly as stored and still saves the other
      fields — `…p1485…spec.ts` test 1.
- [x] The same holds for an own-profile upsert — test 2.
- [x] Control: an ordinary own-profile edit saves and leaves seeded non-zero counters exactly as
      stored — test 3.
- [x] A re-created profile (delete own row, INSERT it back carrying forged counters) starts both
      counters at 0 — test 4.
- [x] Control: the product's letter-rating write, as the signed-in reader, still moves both
      participants' counters through the counter trigger — test 5.
- [x] Control: the service role can still set them — test 6.
- [x] Control: account erasure still recomputes a counterpart's counters — test 7.
- [x] The suite is not blind in either direction: it fails against no guard and against a guard
      that resets counters to 0 on every client write — see Evidence.
- [x] Neighbouring suites still pass on the test project (P880, P1321 email pin, P940, P1150,
      P1278 guest round, P930, P1104) — see Evidence.

## Evidence

Test project, 2026-10-14. Before the fix (first version of the suite, zero-valued counters),
each test run alone with `--retries=0`: the UPDATE, upsert and re-insert tests failed
(`ears: 4242, sessions: 4242` received); the controls passed. After `./scripts/migrate.sh`
(test): all passed.

After independent review the preservation tests were strengthened to seed distinct non-zero
values first (a reset-to-zero guard would have passed the first version). Mutation check on the
test project — the function body temporarily replaced, then restored from its own
`pg_get_functiondef` snapshot (source md5 and ACL re-checked identical, trigger enabled):

- no guard (`RETURN NEW`): UPDATE, upsert and re-insert tests fail (received 4242/4242);
  ordinary-edit control passes.
- reset-to-zero guard: UPDATE, upsert and ordinary-edit tests fail (expected 3/11 or 5/17,
  received 0/0); re-insert passes, as intended — INSERT semantics are the same.
- real guard restored: 7/7 pass.

Neighbouring suites after the fix: P880 trust-column guard, P1321 email pin, P940, P1104 and
the P1453 banner-credit guard (vitest, 4/4) passed in one run. P1150, P1278 guest round and P930
hit the shared test project's sign-in rate limit (`Request rate limit reached`, other sessions
running concurrently); every one of their 48 tests passed in at least one of two post-fix runs,
and every failure in either run was that sign-in error. Test-project catalog: the new function
has no anon/authenticated EXECUTE and its trigger is enabled — test 1 passing proves it still
fires for signed-in writes.

## Post-deploy verification

Run after the prod apply/deploy (not a completion gate — prod cannot be verified pre-merge):

- `[post-deploy]` Migration applied to prod; `has_column_privilege` unchanged but a
      read-only catalog check shows the `guard_profile_counters` trigger enabled on
      `public.profiles`.
- `[post-deploy]` Authenticated prod smoke passes after apply.
