---
status: qa
type: bug
rank: 1000
tags:
  - security
  - letter
  - p878
  - p898
created_date: '2026-06-10'
flow: fix
delivery_stage: ship
pipeline_ran: [ship]
---

# P914: Letter RPCs resolve arbitrary profiles' email without a relationship-scope gate

## Problem

**Situation:** P878 added in-DB email resolution (AD-6) so letters can be addressed by `receiver_profile_id` instead of `receiver_email`. The companion RPC `create_agreement_with_profile` correctly gates this: a non-admin caller can only resolve a profile already in their relationship scope.

**Complication:** The two **letter** RPCs — `seal_and_send_letter` and `add_recipient_to_sealed_letter` — resolve `profiles.email` from a caller-supplied `receiver_profile_id` with **only a self-send check**, no relationship-scope gate. Because email is read inside a `SECURITY DEFINER` function (runs as owner), the P877 column-grant REVOKE does not constrain it — the in-function scope gate is the intended control, and it is absent. The resolved email lands in a `letter_deliveries` row the caller owns and can read back.

**Consequence:** An authenticated non-admin user can obtain the email of any profile they share no relationship with, by addressing an arbitrary `receiver_profile_id` on a self-created letter. `profiles.id` is anon-readable and maps from public profile slugs, so ids are enumerable. These two RPCs have **no rate limit** (unlike `search_profiles`). This is the exact directory-PII class P877/P878 exist to close.

**Confirmed live on prod** (read-only verification, 2026-06-10): both functions are deployed and reachable by `authenticated` callers; `deploy-manifest.json` prod section `migrations_deployed_at: 2026-06-10T04:37:44Z`; the P877 table-level email gate is live, so the `SECURITY DEFINER` RPC is the bypass path. Exposure established by code + deployment evidence; not demonstrated by live exfiltration (would require creating data).

## Root Cause

Scope-gate coverage was applied to `search_profiles` and `create_agreement_with_profile` during P878 but not carried into the two letter RPCs, which gained `receiver_profile_id` resolution in the same migration. `seal_and_send_letter` was subsequently re-created in place by P898 (`20260606120000_p898_seal_rpc_lead_count.sql`), carrying the same ungated block forward.

## Affected Code

- `seal_and_send_letter(UUID, JSONB, JSONB)` — ungated email resolve in the delivery loop. Current authoritative version: `supabase/migrations/20260606120000_p898_seal_rpc_lead_count.sql` (≈L164-173). Original: `20260605150000_p878_search_profiles_rpc.sql` (≈L466-475).
- `add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)` — ungated email resolve in the picker branch. `20260605150000_p878_search_profiles_rpc.sql` (≈L569-580); not re-created since, so this is current.

Correctly-gated reference: `create_agreement_with_profile` (`20260605150000_...`, ≈L295-302).

## Fix

New migration (`CREATE OR REPLACE` both functions — `seal_and_send_letter` based on the P898 body, `add_recipient_to_sealed_letter` based on the P878 body). In each RPC's `receiver_profile_id` branch, **after** the existing self-send check and **before** the `SELECT email INTO …`, add the same admin-or-scope guard `create_agreement_with_profile` uses:

```sql
-- v_is_admin BOOLEAN declared in the function's DECLARE block
SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM profiles p WHERE p.id = <sender_id>;
IF NOT v_is_admin
   AND NOT EXISTS (
     SELECT 1 FROM public.p878_relationship_scope(<sender_id>) s
     WHERE s = <receiver_profile_id>
   ) THEN
  RAISE EXCEPTION 'Recipient is not in your relationship scope';
END IF;
```

`NOT EXISTS`, never `NOT IN` — per `docs/decisions.md` (2026-06-06 P878 SQL gotchas: a NULL in the set makes `NOT IN` yield NULL and the guard silently passes). Vague error wording (no existence oracle), mirroring the agreement RPC. The email-path branches (resolve id from email) are unchanged — not a harvest vector.

## Acceptance Criteria

- [x] New migration replaces both letter RPCs with the admin-or-scope gate added, using `NOT EXISTS`.
- [x] A non-admin caller addressing a `receiver_profile_id` outside their relationship scope raises `'Recipient is not in your relationship scope'` (both RPCs) — **test-verified** (integration test exercises the gate-fires failure path; 5/5 pass).
- [x] A caller addressing a `receiver_profile_id` **within** scope still succeeds (no regression) — **test-verified** (resolved `receiver_email` asserted).
- [x] The admin row bypasses the gate (parity with `search_profiles` / `create_agreement_with_profile`) — **verified by construction** (mirrors the proven agreement-RPC gate; not separately tested — testing requires mutating the single `unique_admin` row on the shared test DB).
- [x] Email-path (resolve id from email) and the self-send checks are unchanged — self-send **test-verified**; email-path unchanged by construction.
- [x] `seal_and_send_letter` retains its P898 behavior (lead_count / pre-story split) — the gate is the only delta — **verified by construction** (verbatim reproduction + diff annotation; `/finish` migration review confirmed no other line changed).

## Invariants

- Any `SECURITY DEFINER` RPC that resolves a `profiles.email` (or other P877-protected PII) from a caller-supplied id MUST gate on admin-OR-`p878_relationship_scope` before the resolve. This is the load-bearing P877/P878 invariant; the letter RPCs were the gap.
- Scope/membership checks against the set-returning `p878_relationship_scope` use `EXISTS`/`NOT EXISTS`, never `IN`/`NOT IN`.

## Rollback Strategy

`CREATE OR REPLACE` is reversible by re-applying the prior P898/P878 function bodies. The gate only *adds* a rejection path; it cannot corrupt data. If a legitimate send is wrongly blocked (scope-derivation edge case), revert the single migration.

## Pre-deploy Checklist

### Deploy commands
- [ ] Apply migration to test DB (`./scripts/migrate.sh`), verify gate fires + in-scope send still works.
- [ ] Apply to prod (FOUNDER-approved deploy only — ALWAYS-ASK).

### Post-deploy verification
- [ ] Prod smoke: in-scope send succeeds; out-of-scope `receiver_profile_id` rejected.
- [ ] Check Sentry for new errors from `seal_and_send_letter` / `add_recipient_to_sealed_letter` in first 10 minutes.

## Related

- Builds on P878 (relationship-scoped people picker) + P877 (directory PII invariant). `seal_and_send_letter` body owned by P898 (lead_count split).
- Surfaced by automated security review 2026-06-10; analysis in this session.
