---
status: today
type: bug
rank: 125098.125
severity: medium
workstream: C1
date_reported: '2026-06-02'
created_date: '2026-06-02'
tags:
  - security
  - privacy
  - rls
  - profiles
  - verification
  - integrity
delivery_stage: reproduce
pipeline_ran: [create-bug, reproduce]
reproduce_artifact:
  test_file: e2e/p880-reproduce.spec.ts
  root_cause: "Both write surfaces accept caller-supplied is_verified/has_pledged. Path 1: live profiles UPDATE policy (P571) WITH CHECK guards only is_test_account, leaving is_verified/has_pledged unconstrained. Path 2: upsert_my_profile ON CONFLICT DO UPDATE writes both columns from EXCLUDED (caller JSON)."
  confidence: high
  surfaces_in_scope: [direct-rls-update, upsert_my_profile-rpc]
  surfaces_deferred: []
  reproduced_at: 2026-06-05
locked_at: '2026-06-04T17:01:01.362Z'
---

# P880: Authenticated users can self-promote their own is_verified / has_pledged

## Summary

Any logged-in user can set their own `profiles.is_verified` and `profiles.has_pledged` to `true`, promoting themselves onto the public pledger wall and earning the verified badge without ever completing email verification or the pledge flow. Surfaced during P877 code review (finding C1, HIGH).

## Root Cause

Verification state is **client-writable**. Two paths allow it:

1. **RLS UPDATE policy** — `profiles` has `using (auth.uid() = id)` with no column scoping, so a logged-in user can run `supabase.from('profiles').update({ is_verified: true, has_pledged: true }).eq('id', <own id>)` directly. (This predates P877.)
2. **`upsert_my_profile` RPC** (added in P877, `supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql`) — its `ON CONFLICT (id) DO UPDATE` writes `is_verified = EXCLUDED.is_verified` and `has_pledged = EXCLUDED.has_pledged` from caller-supplied JSON. It correctly forces `id = auth.uid()` (so it cannot write *another* user's row), but it does not strip these privilege fields from the payload.

Locking only the RPC does **not** close the hole — path 1 (direct RLS UPDATE) remains open. Both must be addressed together.

**Reproduced 2026-06-05** (`e2e/p880-reproduce.spec.ts`, test DB) — both paths confirmed, 100%. An authenticated user-scoped client took its own profile from `is_verified=false / has_pledged=false` to `true/true` with **no error** via both the direct UPDATE and the `upsert_my_profile` RPC.

Precision note for the fix: the live UPDATE policy is **P571's** (`20260322120000_p571_is_test_account.sql:14-16`), not a bare `using (auth.uid() = id)`. It already carries a `WITH CHECK (auth.uid() = id AND is_test_account = (SELECT is_test_account ...))` — but that clause pins **only** `is_test_account`. The fix for path 1 is to extend this same self-immutability pattern to `is_verified` and `has_pledged` (pin each to its current stored value), exactly as P571 did for `is_test_account`. P571 is therefore both the precedent and the proof the attack class works.

## Invariants

- `is_verified` and `has_pledged` are trust/integrity fields, not user preferences. They must only transition to `true` as a result of a server-controlled event (email verification, completing the pledge flow), never from raw client input.
- The `/live`-guest → pledger upgrade currently relies on `has_pledged` flipping `false → true` via the AuthCallbackPage upsert. Any restriction on client-writing `has_pledged` MUST re-home that upgrade server-side first, or the upgrade path breaks.

## Reproduction Steps

1. Sign in as any user whose profile has `is_verified: false` (or `has_pledged: false`).
2. In the browser console (authenticated session), run:
   `await supabase.from('profiles').update({ is_verified: true, has_pledged: true }).eq('id', '<own profile id>')`
3. Reload `/pledgers`.
4. Observe: the user now appears on the public pledger wall with the verified badge.

**Reproduction rate:** 100% (RLS UPDATE path). The `upsert_my_profile` RPC path: `await supabase.rpc('upsert_my_profile', { p_data: { is_verified: true, has_pledged: true } })`.

## Expected Behavior

A user cannot make themselves `is_verified` / `has_pledged` `true` by writing the column directly. These transitions happen only through the verified server flow.

## Actual Behavior

Both the direct RLS UPDATE and the `upsert_my_profile` RPC accept caller-supplied `is_verified` / `has_pledged` and persist them, with no server check.

## Affected Files

- `supabase/migrations/` — the `profiles` UPDATE RLS policy (`auth.uid() = id`, no column scope) — root, path 1
- `supabase/migrations/20260602160000_p877_profiles_pii_column_grants.sql` — `upsert_my_profile` DO UPDATE clause — path 2
- `src/auth/AuthCallbackPage.tsx` — the legitimate setter of `is_verified: true` / `has_pledged` (must remain functional)
- `src/app/data/api.ts` — `updateProfile` (does not currently set these; verify it stays that way)

## Severity

**Medium** — privilege/integrity issue, not PII exposure. It lets a user falsely claim verified+pledged status (reputation/trust impact on the public wall), but does not leak other users' data or compromise auth.

## Fix Approach

Two coordinated changes (neither alone is sufficient):

1. **Move `is_verified` / `has_pledged` writes server-side.** Set them only via a controlled path — e.g. an edge function or DB trigger on email verification, and the pledge-completion flow — never from client-supplied upsert/update payloads. Re-home the `/live`-guest → pledger upgrade (`has_pledged false → true`) into that server path FIRST (see Invariants).
2. **Restrict the `profiles` RLS UPDATE policy** to exclude `is_verified` and `has_pledged` from client writes (column-scoped update, or a trigger that rejects client transitions of these columns), AND drop `is_verified` / `has_pledged` from `upsert_my_profile`'s `ON CONFLICT DO UPDATE` once the legitimate setters are server-side.

Verify the verified-badge, signature wall, and `get_featured_profiles` inclusion all still work for legitimately-verified users after the change.

## Acceptance Criteria

- [ ] An authenticated user cannot set their own `is_verified: true` via a direct `profiles` UPDATE (RLS rejects or trigger blocks the column transition)
- [ ] An authenticated user cannot set their own `is_verified` / `has_pledged` via `upsert_my_profile`
- [ ] Legitimate email verification still sets `is_verified: true` (signup/verify flow unbroken)
- [ ] The `/live`-guest → pledger upgrade (`has_pledged false → true`) still works through the server-side path
- [ ] Verified badge, signature wall, and `/pledgers` inclusion are correct for legitimately-verified users
- [ ] Regression coverage: a test asserts a self-promotion attempt (both paths) is rejected
