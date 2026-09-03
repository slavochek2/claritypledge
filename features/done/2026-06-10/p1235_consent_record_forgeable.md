---
status: all-done
type: bug
rank: 1000067
severity: high
workstream: infrastructure
created_date: '2026-09-03'
tags: [security, rls, consent, audit-trail]
pipeline_ran: [create-spec, inline, ship]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
feature_type: backend
completed_at: 2026-09-03
---

# P1235: consent audit rows can be written naming a user who never consented

## Problem

**Situation:** `terms_acceptances` and `session_consents` are the audit trail this product relies on
to demonstrate that a given person accepted a given version of the terms. Both tables carry a
`user_id` column naming whose consent the row records. Both carry a single INSERT policy that
verifies the *caller* is authenticated and never checks that `user_id` names that caller.

**Complication:** Caller-verification is not owner-binding. Any authenticated user can write a row
naming any other user's UUID, and the victim has no way to remove it — neither table carries an
UPDATE or DELETE policy at all, so a forged row is permanent from the client's perspective. This
becomes live-relevant now: a terms bump to v1.4 will force every existing user to re-accept, and
these rows are the evidence that the re-acceptance happened. Evidence that anyone can author is not
evidence.

**This class was supposed to be closed already.** The 2026-08-10 ruling below requires every INSERT
policy on a table with an owner column to bind that column. P1038 audited the whole schema against
that ruling and listed both of these tables under *"Confirmed not-applicable (no owner column, or
no client-reachable INSERT at all)."* That classification is wrong on both halves: `user_id` is the
owner column, and four client code paths INSERT into these tables under the user's own JWT. The
classifier appears to have keyed on the presence of a foreign key — these two tables deliberately
have none, documented in `20260107_p37_consent_mechanism.sql` as a retention choice — so a
column that *is* an owner column did not look like one.

**Question:** bind the INSERT to the acting user, and record why the audit's own classifier declared
these tables out of scope, so the next sweep does not repeat it.

**Pre-existing since the initial schema.** Present in `20250101_initial_schema.sql` and re-declared
identically in `20260107_p37_consent_mechanism.sql`. Not introduced by any later change.

**The stated reason for the missing binding is false.** `20260107_p37_consent_mechanism.sql:98`
justifies it as: *"Profile creation happens BEFORE the profile row exists, so we can't check
`auth.uid() = user_id`."* `auth.uid() = user_id` compares two UUIDs; it does not read `profiles` and
does not require a profile row to exist. The constraint the comment describes would only bind a
predicate that joins `profiles` — which is not what was being avoided.

Live-vs-source drift, the executed attack proof, and the exact live predicates are in
`.private/docs/security-log.md` § 2026-09-03 (P1235), per the disclosure rule in CLAUDE.md.

## Appetite

**Blast radius: high** — the legal audit trail for every user, and the two tables are the sole
evidence for a GDPR Art. 7(1) "demonstrate consent" burden of proof (P683). **Reversibility:
medium** — one migration, revertible by re-issuing the prior policy, but rows already forged are not
identifiable after the fact. **Decision density: low** — the 2026-08-10 ruling already decides the
shape of the fix; one judgement call is recorded in Alternatives Considered rather than deferred.

## Invariants

- Any policy permitting a client to write a consent or acceptance row MUST bind the row's `user_id`
  to `auth.uid()`. Caller-verification alone (`auth.uid() IS NOT NULL`, profile-existence,
  `is_verified`) answers *is this a real user*, never *does this row belong to them*.
- These tables have no UPDATE or DELETE policy, and must not acquire one as a side effect of this
  work. An audit trail that the subject can rewrite is not an audit trail; correction of a bad row
  is a service-role operation, not a client one.
- Service-role writers (the three letter edge functions) must keep working unchanged. They bypass
  RLS by design and are the only legitimate writer-on-behalf-of-another-user path.

## Solution

One migration replacing the INSERT policy on both tables with a predicate binding `user_id =
auth.uid()`, scoped `TO authenticated`, per the 2026-08-10 ruling. Both tables get the identical
treatment in one file — the defect is a class, and splitting it across two migrations is how the
second half gets forgotten.

The migration carries a verification `DO` block asserting the resulting predicate by normalised
`pg_get_expr` equality against the intended expression, not by substring match. A substring assert
passes on a policy that merely *mentions* `auth.uid()`, which is precisely the state being fixed.

Correcting P1038's per-table classification is in scope as a documentation change; re-running the
full audit is not (see Non-Goals).

## Alternatives Considered

**Preserve the profile-existence conjunct present on the live test database.** The live predicate
carries an `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())` term that appears in no migration
in this repo and is absent from the March 2026 prod backup. Rejected: once `user_id = auth.uid()`
binds the row, that conjunct is no longer a security control — its only remaining effect is to
reject a *truthful* self-record from an authenticated user who has no profile row yet, which is a
row we want. Keeping it would also newly impose on production a restriction production does not
enforce today, which is a regression risk taken for no security gain. Recorded rather than silently
dropped because an existing live predicate is evidence of intent; its origin is unattributable and
its author cannot be asked.

**Route all consent writes through a SECURITY DEFINER RPC** (the P1100 shape). Rejected for this
spec: it changes four client call sites and the edge-function contract to close a hole that a
`WITH CHECK` predicate closes completely. The RPC question is real for tables where the row must
satisfy constraints RLS cannot express; `user_id = auth.uid()` is fully expressible in RLS.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A client path inserts on behalf of another user and breaks | MITIGATE | All four client writers enumerated by grep; every one passes the session user's own id. Proven by a legitimate-path test, not by reading. |
| Service-role edge functions break | MITIGATE | `service_role` has `rolbypassrls = true`, confirmed by catalogue query; all three functions construct a service-role client. Covered by a test asserting the service-role path still writes. |
| Production's live predicate differs from test's, so the migration lands on a different starting state | MITIGATE | Policy is replaced by `DROP POLICY IF EXISTS` + `CREATE`, so the end state is identical regardless of start. The `DO` block asserts the end state, not the delta. |
| Rows already forged in production cannot be identified retroactively | ACCEPT | No provenance column exists to distinguish them. Adding one is a new capability, not a fix to this defect. |
| The same classifier error hides other tables | DEFER | Unblocked by re-running the P1038 sweep with an owner-column definition that does not require a foreign key. Out of scope here; this spec corrects only the two tables it proves. |

**Non-Goals**
- Do NOT add UPDATE or DELETE policies to either table (see Invariants).
- Do NOT change the edge functions, the client writers, or `CURRENT_TERMS_VERSION`.
- Do NOT re-run the P1038 schema-wide audit or fix other tables found along the way — file them.
- Do NOT touch production. Test project only.

## Done-When

- [x] Live catalogue query on test shows the INSERT policy on both `terms_acceptances` and
      `session_consents` binding `user_id` to `auth.uid()`, read from `pg_policy`, not from the
      migration text. — both return `(user_id = auth.uid())`, roles `{authenticated}`.
      `[post-deploy]` re-verify on prod once the migration applies.
- [x] An authenticated user inserting a row naming a *different* user is rejected — executed against
      test, and executed against the pre-fix policy in the same session to show it previously
      succeeded. Fixture rows counted to zero afterwards. — before: `INSERT SUCCEEDED` on both
      tables; after: `BLOCKED: 42501 new row violates row-level security policy`. Row counts
      returned to the 575 / 5269 baseline with zero probe rows remaining.
- [x] An authenticated user recording their *own* acceptance still succeeds — executed, both tables.
      — `INSERT SUCCEEDED` before and after, both tables.
- [x] The terms-acceptance gate path (`recordTermsAcceptance` → profile update + audit insert) still
      succeeds for a user with a profile, and the existing unit suite for it passes. — 27/27 across
      `consent-api.test.ts`, `p832-global-tos-gate.test.tsx`, `p707-authenticated-letter-delivery.test.ts`.
      The integration test also reads the row back through the SELECT policy the gate depends on.
- [x] A service-role insert naming another user still succeeds (the edge-function path), executed.
      — `INSERT SUCCEEDED` after the fix; `service_role.rolbypassrls = true` confirmed by catalogue query.
- [x] The migration's verification `DO` block fails when the predicate is wrong — demonstrated by
      running it against the pre-fix policy and showing a non-zero exit, not asserted. — three
      distinct failure paths exercised, each raising and returning HTTP 400: wrong predicate
      (`expected (user_id = auth.uid())`), unscoped role (`roles are {} — expected {authenticated}`),
      and a second permissive INSERT policy (`has 2 INSERT policies`). The block passes on the
      correct state (the real apply returned 201).
- [x] `./scripts/pre-commit-checks.sh` passes.
- [x] P1038's per-table classification is corrected in its spec so the "not-applicable" line no
      longer certifies these two tables as safe.
- [x] Mechanics recorded in `.private/docs/security-log.md`; nothing exploit-specific in this file.

## Evidence

**Regression test:** `e2e/integration/20260903140000_p1235_consent_insert_bound_to_actor.spec.ts`,
7 tests. Against the fixed policy: 7 passed. Against the pre-fix policy restored on test: **2
failed, 5 passed** — and the two that failed are exactly the two forgery assertions
(*"forged terms_acceptances row was accepted — RLS is not binding user_id"*, and the same for
`session_consents`), while all five legitimate-path tests still passed. The suite therefore
detects the defect and does not fire on the paths that must keep working.

**Not proven:** production's live predicate was not read — prod was out of scope for this work, and
the test project turned out to carry an out-of-band predicate that appears in no file in this repo,
so test is not evidence for prod. Confirm prod before the v1.4 bump.

## Related

- **P1032 / P1034** — same class on `stories`, `points`, `story_points`. Fixed 2026-08-10/11.
- **P1038** — the audit that classified these two tables as not-applicable. Corrected by this spec.
- **P1045** — unauthenticated write surfaces; names the out-of-band-policy problem this spec hit again.
- **P1100** — open, the SECURITY DEFINER alternative for a table where RLS cannot express the rule.
- **decisions.md 2026-08-10** — "RLS INSERT policies must bind the row's own owner column"; and
  "`CREATE POLICY` without `TO <role>` defaults to `PUBLIC`", which is why the new policy is scoped.
