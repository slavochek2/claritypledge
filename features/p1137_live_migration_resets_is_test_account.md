---
status: backlog
type: bug
rank: 227
severity: medium
workstream: analytics
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [live, migration, is_test_account, trust-columns]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1137: `/live` account migration silently resets `is_test_account` to false, permanently

## Summary

When a profile flagged `is_test_account = true` migrates from an anonymous `/live` session to a
real authenticated account (magic-link/OAuth), the migration deletes the old profile row and
recreates it via `upsert_my_profile` — whose INSERT column list doesn't include `is_test_account`.
The new row silently reverts to the column default (`false`), permanently, with no error and no
signal.

## Root Cause

`AuthCallbackPage.tsx`'s `/live` migration branch (~line 190-271) does:
1. Look up the old anonymous profile by email via `get_my_profile_by_email` (which DOES return
   `is_test_account` — confirmed by reading the P877 migration).
2. `DELETE` that old profile row.
3. `upsert_my_profile` RPC INSERTs a fresh row under the new auth id.

`upsert_my_profile`'s INSERT column list (most recent redefinition:
`supabase/migrations/20260819160000_p1104_reserve_agent_name_at_the_table.sql`, and its P877
predecessor) never includes `is_test_account` — so the new row gets the column's own default,
`false` (`supabase/migrations/20260322120000_p571_is_test_account.sql`).

This isn't an oversight that a client-side fix can close: P571's own RLS policy explicitly pins
`is_test_account` against ordinary client writes —
`WITH CHECK (auth.uid() = id AND is_test_account = (SELECT is_test_account FROM profiles WHERE id
= auth.uid()))` — the same trust-column treatment as `is_verified`/`has_pledged`. Those two DO have
dedicated `SECURITY DEFINER` RPCs that legitimately carry a trust flag through a flow
(`markSelfVerified`, `setMyPledge`, both called later in this same function). No equivalent RPC
exists for `is_test_account`.

## Invariants

- Trust columns (`is_verified`, `has_pledged`, and by the same logic `is_test_account`) are
  intentionally locked against direct client writes via RLS `WITH CHECK`. Any flow that needs to
  carry one of these through account migration/creation needs a dedicated `SECURITY DEFINER` RPC —
  there is no generic-upsert path that will ever work for them, by design.

## Reproduction Steps

1. Create a profile with `is_test_account = true` via the anonymous `/live` flow (no auth account
   yet — just a `profiles` row with an email, unauthenticated).
2. That same email completes a magic-link or Google OAuth login.
3. `AuthCallbackPage.tsx` detects the email match under a different auth id, runs the migration
   branch (delete old row → `upsert_my_profile` new row).
4. Query `profiles.is_test_account` for the new row.

**Reproduction rate:** 100% — this is unconditional, not intermittent.

## Expected Behavior

The migrated profile's `is_test_account` value should match what it was before migration.

## Actual Behavior

The migrated profile's `is_test_account` is always `false` after migration, regardless of its
value before — the flag is silently and permanently lost.

## Affected Files

- `src/auth/AuthCallbackPage.tsx` — `/live` migration branch (~line 190-271); the delete+upsert
  sequence
- `supabase/migrations/20260819160000_p1104_reserve_agent_name_at_the_table.sql` (and its P877
  predecessor) — `upsert_my_profile`'s INSERT column list
- `supabase/migrations/20260322120000_p571_is_test_account.sql` — the RLS policy that locks the
  column, and the column default that silently wins

## Severity

**Medium** — no user-facing breakage (nothing errors, nothing crashes), and current real-world
exposure is low: known test accounts (e.g. `test-agent@claritypledge.com`) are provisioned
directly with the flag set, not created via organic anonymous `/live` participation then migrated.
But the bug is unconditional once triggered, silently corrupts a trust-adjacent flag with
downstream effects beyond analytics (P571: `is_test_account` also gates the public `/pledgers`
listing and `get_featured_profiles`), and will resurface for any future test/QA fixture that goes
through the `/live` → migration path. Surfaced during P1133 (Mixpanel `is_internal` tagging) code
review — P1133 worked around it for its own one-login analytics classification but did not (and,
per its own Non-Goals, should not have tried to) fix the DB-level bug.

## Fix Approach

Add a new `SECURITY DEFINER` RPC (following the `markSelfVerified`/`setMyPledge` pattern already
in this exact code path) that carries `is_test_account` from the old profile to the new one during
migration — e.g. `carry_test_account_flag(p_new_id uuid, p_value boolean)`, callable only by the
authenticated caller for their own row, called right after `upsert_my_profile` succeeds in the
migration branch. Needs its own migration + RLS review — do not bolt this onto `upsert_my_profile`
generically, since that would make `is_test_account` client-writable through the ordinary profile
upsert path for ALL callers, not just the migration case.

## Acceptance Criteria

- [ ] A profile with `is_test_account = true` that migrates via `/live` → authenticated login
      still has `is_test_account = true` in the database afterward — verified by querying the row,
      not just the in-memory/analytics value
- [ ] A profile with `is_test_account = false` migrating the same way stays `false` (no accidental
      flip in the other direction)
- [ ] The new RPC is NOT callable to set an arbitrary caller's `is_test_account` to `true` at will
      outside the migration flow (would defeat the point of the P571 lock)
- [ ] Regression test covers both migration directions (true→true, false→false) against the real
      RPC, not a mock
