---
status: week
type: bug
rank: 1000071
workstream: infrastructure
created_date: '2026-09-03'
tags: [security, rls, gdpr, migrations]
delivery_stage: ship
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1243: Consent INSERT policies lost the post-erasure guard, and token rotation races account erasure

## Problem

Two HIGH-severity regressions found by an adversarial INTEGRATION review of the 15 branches
merged onto `main`. Neither is visible from any single branch's diff — each is created by the
*interaction* of two branches that were correct in isolation. Both are verified by command
against the live TEST database.

**(1) The consent tables' post-erasure guard was silently dropped.**
`20260902090000_p520_erasure_hardening.sql` added a profile-existence conjunct to the INSERT
policies on `terms_acceptances` and `session_consents`. It is load-bearing: `erase_my_account()`
deletes the profile and the `auth.users` row, but the browser's already-minted access token stays
valid for up to an hour, and `auth.uid()` keeps returning the erased UUID. The conjunct is what
stops that stale token writing new consent records for a person who no longer exists. These two
tables carry no FK to `profiles` (a deliberate retention choice — see `decisions.md` 2026-05-xx
"P520 needs … explicit cleanup for `terms_acceptances` and `session_consents` (no FK
constraints)"), so RLS is the *only* thing standing there.

`20260903140000_p1235_bind_consent_insert_to_acting_user.sql` runs later and replaces both
policies with `WITH CHECK (user_id = auth.uid())` — dropping the guard.

The P1235 author did not overlook it. They saw the extra conjunct on the test database, could not
find it in any repo file, concluded it was out-of-band drift by an unknown actor, and deliberately
removed it. It was not drift: it was P520's hardening, applied to test from a branch that had not
yet merged. **Both invariants are needed and neither implies the other** — P1235's binds the row's
`user_id` to the caller (stops forging a record naming someone else); P520's requires the caller to
still exist (stops a post-erasure ghost writing at all).

**(2) `rotate_invitation_token()` can reopen a terminated agreement.**
The RPC (`20260902001500_p1230_b_...sql:118-142`) `SELECT`s `status` into a variable with no
`FOR UPDATE`, validates it, then issues an **unconditional** `UPDATE … WHERE id = p_agreement_id`
setting `status = 'pending'` and a fresh token. Between the read and the write,
`erase_my_account()` (`20260903090000_p520_erasure_hardening_2.sql:197`) can terminate and
anonymise that agreement because the partner erased their account. The rotation then overwrites
the terminated row back to `pending` with a usable invitation token, undoing the erasure-time
termination. The P1230 trigger does not catch it: the RPC is `SECURITY DEFINER` and the trigger
exempts that role.

## Appetite

Blast radius: high — (1) is a GDPR Art. 17 erasure boundary on the Art. 7(1) consent evidence
tables; (2) resurrects a terminated agreement belonging to an erased person. Reversibility:
medium — both fixes are migrations, forward-only, but each is a small policy/function
replacement. Decision density: zero founder decisions; both fixes are determined by invariants
already ruled on.

## Invariants

- The consent INSERT policies MUST carry **both** conjuncts:
  `user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())`.
  Neither may be dropped in favour of the other. A future migration touching either policy must
  restate both.
- `rotate_invitation_token()` must decide creator-ownership and status-resendability against the
  row it actually writes — a check performed against a value read outside the write's own
  predicate (or outside a lock) is not a check.
- The RPC's error semantics are part of the contract: a caller who is not the creator learns
  nothing about whether the id exists (same `42501` message for "no such row" and "not yours"),
  and a non-resendable status still raises its status-specific error.
- Both consent tables stay append-only: no UPDATE or DELETE policy, RLS enabled, exactly one
  INSERT policy scoped `TO authenticated`.

## Solution

**(1)** A new migration recreating both INSERT policies with both conjuncts, scoped
`TO authenticated`, with a verification `DO` block asserting the final predicate by **normalised
`pg_get_expr` equality** against a rendered reference policy — never substring matching (a
substring assert for `auth.uid()` passes on the very predicate being replaced). Reuse P1235's
reference-probe technique, extended to the two-conjunct predicate, and keep its other assertions
(exactly one INSERT policy, `{authenticated}` roles, no UPDATE/DELETE policy, RLS on).

Then treat this as a defect *class*, not a defect: enumerate every INSERT policy in `public` and
record which invariants each carries, so the sweep is evidence rather than assertion.

**(2)** Recreate `rotate_invitation_token()` from its **current** `pg_get_functiondef` on the live
database (not from the migration text, in case anything drifted), moving the creator and status
conditions into the `UPDATE … WHERE` clause and requiring `ROW_COUNT = 1`. The pre-checks stay for
error *messaging* only; the `WHERE` clause is what makes the decision. A zero-row result after the
pre-checks passed means the row moved underneath us — raise, do not silently return false.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Restoring the profile-existence conjunct breaks a legitimate writer whose profile does not yet exist | MITIGATE | Legitimate-path tests: a live user records their own terms acceptance and session consent. Service-role writers carry `rolbypassrls` and never see RLS. |
| Moving conditions into `WHERE` changes which error a caller sees | MITIGATE | Pre-checks retained solely to preserve the existing 42501 / status-specific messages; tested explicitly. |
| Other INSERT policies lack a post-erasure guard | ACCEPT (documented) | The enumeration below records the state of every one. Tables with an FK to `profiles` reject a post-erasure insert by FK regardless of policy; extending the guard beyond P520's chosen set is out of scope here. |
| The race is timing-dependent and could be under-tested | MITIGATE | Staged interleaving with an explicit lock hold, showing the write succeeds before the fix and is refused after. |

**Non-Goals**
- Do NOT touch prod. Migrations apply to the TEST project only.
- Do NOT widen the profile-existence guard to INSERT policies P520 did not choose to harden.
- Do NOT change the client. No frontend writer changes behaviour under either fix.
- Do NOT alter `erase_my_account()` itself.

## Done-When

- [x] `e2e/integration/p520-account-deletion.spec.ts` "stale JWT" test passes after the fix —
      **15/15 on the full file** (run unfiltered; the suite is `mode: 'serial'` and the erasure
      happens inside a test, so a `-g` filter skips it and the later assertions fail by design —
      that artifact cost this branch a false alarm, see Notes). The "before" state is recorded as
      the predicate itself rather than a red run: the live catalogue read `(user_id = auth.uid())`
      on both tables, i.e. the profile-existence conjunct was absent, which is exactly what the
      stale-JWT assertion tests for.
- [x] Both consent INSERT policies read the two-conjunct predicate on the live test database —
      read back from `pg_policy`: `((user_id = auth.uid()) AND (EXISTS (SELECT 1 FROM profiles p
      WHERE (p.id = auth.uid())))))` on **both** `terms_acceptances` and `session_consents`.
- [x] Every INSERT policy in `public` enumerated across the six tables P520 hardened, with which
      invariants each carries: `terms_acceptances` and `session_consents` — actor-binding +
      profile-existence (restored here); `clarity_demo_rounds`, `clarity_ideas` and
      `clarity_live_turns` — profile-existence + cancelled-session refusal;
      `clarity_verifications` — profile-existence only, **no cancelled-session clause**, because
      it has no `session_id` column. That last one is a real residual: now stated in
      `20260902090000`'s header (it was silent) and filed as **P1245**.
- [x] Legitimate path: a live user records their own terms acceptance and session consent —
      covered by the p520 suite's own non-erasure tests, 15/15.
- [x] The erasure/rotation interleaving is refused after the fix — `20260903151000_..._guard.spec.ts`
      **2/2**: a TERMINATED agreement cannot be rotated back to pending, and a non-creator learns
      nothing about whether the id exists. The guarded predicate was additionally confirmed live
      via `pg_get_functiondef` (both the creator and status conditions are inside the UPDATE's
      WHERE clause). **Not claimed:** a staged concurrent interleaving showing the OLD body losing
      the race. The fix is structural — the conditions now live in the write's own predicate, so
      there is no window to interleave into — and the before-state is evidenced by the old body,
      quoted in the migration header. A true concurrency harness was not built.
- [x] Legitimate path: resend of a pending invitation succeeds; resend of an expired invitation
      succeeds; a non-creator still gets 42501 with the id-non-disclosing message — p1230 hijack
      suite **21/21**, which contains the full false-positive group.
- [x] tsc 0 · eslint 0 · vitest **330 files / 3647 tests, 0 failed** · p520 integration **15/15** ·
      p1230 integration **21/21** · `pre-commit-checks.sh` green on every commit.

## Related

- `features/done/2026-06-10/p1235_consent_record_forgeable.md` — added the binding that dropped the guard
- `features/done/2026-06-10/p520_pledge_withdrawal_account_deletion.md` — added the guard
- `features/done/2026-06-10/p1230_pending_agreement_hijack_via_update_policy.md` — added the RPC
- Exploit mechanics: `.private/docs/security-log.md`
