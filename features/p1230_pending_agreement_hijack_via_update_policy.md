---
status: week
type: bug
rank: 1000066
severity: high
workstream: infrastructure
date_reported: '2026-09-01'
created_date: '2026-09-01'
drafted_by: fable
exec_model: fable
exec_effort: high
tags: [security, rls, agreements, privilege-escalation]
delivery_stage: create-bug
pipeline_ran: [create-bug]
driver: anomaly
---

# P1230: a pending agreement can be taken over through the table UPDATE policy

## Summary

The agreements table's UPDATE policy admits callers who are not a party to the row while it is
pending, and only checks that the row names the caller *after* the write. A signed-in stranger
who knows a pending agreement's id can therefore write themselves in as the partner — the
invitation token is never consulted. Separately, a legitimate party can reassign either party
id, which the acceptance flow never intended. Found while writing P1222's policy migration;
confirmed by the founder against the migration text.

## Root Cause

The P422 UPDATE policy (`supabase/migrations/20260225150000_p422_fix_update_rls_with_check.sql`,
re-issued by `20260225180000`) was written so that the invite-acceptance page could update the
row before the partner had a profile id. Acceptance later moved to the `accept_agreement`
SECURITY DEFINER RPC (P443/P453), which checks the token server-side — but the policy kept its
acceptance-era branch. Row-level security cannot compare NEW to OLD, so nothing stopped a party
from rewriting `creator_profile_id` / `partner_profile_id` either. Exact predicate, prod/test
divergence and the reproduction transcript: `.private/docs/security-log.md` § 2026-09-01 (P1230),
per the disclosure rule in CLAUDE.md.

**Drift, recorded:** the test project already carries a parties-only USING/CHECK for this policy —
out-of-band, in no migration. Prod has the P422 predicate. The migration here asserts the final
state so it is correct from either starting point.

## Reproduction Steps

1. On TEST, create a pending agreement as service_role (fixture helper), and two users: the
   creator and a stranger.
2. Sign in as the stranger; `PATCH /rest/v1/clarity_agreements?id=eq.<id>` with
   `{ partner_profile_id: <stranger> }`.
3. Against the prod-shaped policy the row changes; against test's out-of-band policy it does
   not (0 rows) — that half is not reproducible on test without writing the prod policy there.
4. What **does** reproduce on test today: sign in as the creator and `PATCH`
   `partner_profile_id` to any profile → 1 row written; sign in as the partner and `PATCH`
   `creator_profile_id` → 1 row written; anon `PATCH` → 0 rows, no error (anon holds the UPDATE
   grant; only the policy stops it).

**Reproduction rate:** 100% for step 4 on test (integration test, 2026-09-01: 3 failed / 6 passed
before the fix); step 2 is prod-only by policy text.

## Expected Behavior

Only the creator or partner can update an agreement row, the result must still name them, and
neither can change who the parties are. Becoming the partner happens only through
`accept_agreement()` with the token. Anonymous callers hold no UPDATE grant.

## Actual Behavior

See Reproduction. On prod any authenticated caller can claim any pending agreement by id; on
both environments a party can reassign either party id; anon writes fail only by policy.

## Affected Files

- `supabase/migrations/20260902001000_p1230_agreements_update_parties_only.sql` (new)
- `e2e/integration/p1230-pending-agreement-hijack.spec.ts` (new)
- No client change: every client UPDATE path (`agreements-service-real.ts` — lazy expiry,
  resend, cancel, terminate) is issued by a party; acceptance already uses the RPC;
  `send-agreement-emails` rotates the token as service_role.

## Severity

**High** — authenticated takeover of another user's pending agreement on prod without the
invitation token. Narrowed (not closed) by P1222, which stops pending agreement ids from being
publicly listable.

## Invariants

- Party ids on an agreement are written only by the acceptance RPC (SECURITY DEFINER, token
  checked) or by service_role — never by an RLS-subject role.
- The UPDATE policy on agreements carries no status- or token-based branch; token semantics
  live in `accept_agreement` / `decline_agreement` only.
- `anon` holds no UPDATE grant on the agreements table.

## Fix Approach

One migration, three layers (policies cannot see OLD):

1. Policy: `USING` and `WITH CHECK` both = creator or partner by `auth.uid()`, `TO authenticated`.
2. Trigger `agreements_lock_party_ids` (BEFORE UPDATE): when `current_user` is `anon` or
   `authenticated`, refuse any change to `creator_profile_id` / `partner_profile_id` with
   `42501`. SECURITY DEFINER RPCs run as their owner and service_role is not an RLS role, so
   `accept_agreement` and the edge functions are unaffected.
3. `REVOKE UPDATE ON clarity_agreements FROM anon` — client-safe: the policy already yielded
   zero rows for anon (`auth.uid()` is NULL).
4. A `DO` block asserts the final predicate, role list, trigger and grant, so the file is a fix
   on prod and an idempotent no-op-plus-guard on test.

**Enumerated legitimate UPDATE paths** (all still pass — controls in the test): creator cancels
(`status=terminated`), creator resends (rotates token/expiry), partner terminates, party lazily
expires an overdue pending row, invitee accepts via `accept_agreement()`.

**Rejected:** moving acceptance back to a client PATCH with a token branch in the policy — that is
the bug. Also rejected: a column-level `REVOKE UPDATE (creator_profile_id, partner_profile_id)
FROM authenticated` instead of the trigger — PostgREST returns 42501 for the whole PATCH only when
those columns are named, which is the same effect, but it would also block a future definer-less
path and gives no error message naming the rule; the trigger is explicit. Either would do.

## Acceptance Criteria

- [ ] `e2e/integration/p1230-pending-agreement-hijack.spec.ts`: 3 failed / 6 passed on TEST before
      the migration, 9 passed after (the stranger-hijack test is green before on test only because
      of the out-of-band policy — it is red against the prod predicate)
- [ ] Controls pass: creator cancels, creator resends, partner terminates, invitee accepts via RPC,
      party lazily expires
- [ ] `anon` UPDATE on the table returns 42501 (grant), not a silent 0-row update
- [ ] Migration's `DO` block passes on TEST; `pre-commit-checks.sh` green
- [ ] `.private/docs/security-log.md` carries the exact predicate
- [ ] **Founder step:** migration applied to prod; then a stranger PATCH of `partner_profile_id`
      on a pending fixture returns 0 rows / 42501 on prod
