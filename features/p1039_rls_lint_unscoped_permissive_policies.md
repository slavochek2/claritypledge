---
status: in-progress
type: task
rank: 1000963.0
severity: high
created_date: '2026-08-10'
tags: [security, rls, ci, tooling]
delivery_stage: dev
pipeline_ran: [create-spec, dev]
driver: anomaly
---

# P1039: CI/pre-commit check for unscoped `USING(true)`/`WITH CHECK(true)` RLS policies

## Problem

P1035 found 5 RLS policies on production (`points`, `point_positions` ×3, `profiles`) that were
named and commented as service-role-only test-data bypasses, but were missing `TO service_role` —
defaulting to every role, including unauthenticated. This exact pattern has already recurred once
in this codebase's history: `20260214_e2e_test_rls_complete_fix.sql` created scoped-only versions
and explicitly removed earlier blanket-`true` policies; `20260219_service_role_test_policies.sql`
(5 days later) reintroduced the identical unscoped pattern it had just been fixed away from. Six
months of prod exposure followed before an unrelated adversarial-review pass caught it. Nothing in
the codebase currently guards against a third occurrence.

## Appetite

Low blast radius (a new pre-commit/CI check, additive — doesn't touch existing migrations or app
code). Fully reversible (delete the check). Low decision density — the pattern to detect is
concrete and already characterized by two real incidents.

## Solution

Add a check (pre-commit hook, following the existing pattern in `scripts/pre-commit-checks.sh` for
migration-safety checks like `check-migration-client-safety.sh`) that scans new/modified migration
files for `CREATE POLICY` statements where:
- The policy's `USING` or `WITH CHECK` clause is the literal `true`, OR references a role-identity
  function (`current_setting('role')`, `auth.role()`) intended to scope the policy, AND
- The `CREATE POLICY` statement has no `TO <role>` clause (defaults to `PUBLIC`)

Flag these as a hard block (matching `check-migration-client-safety.sh`'s pattern of requiring an
explicit annotation to proceed) unless the migration carries an explicit
`-- intentionally-public: <reason>` comment, mirroring the existing `-- client-safe: <reason>`
annotation convention P1032/P1035's migrations already use.

**Scope this to new/modified migrations only** (like the existing client-safety check) — not a
retroactive scan of migration history, since P1038 (audit of INSERT-ownership gaps) already covers
finding existing gaps; this spec is about preventing new ones.

## Risks / Non-Goals

### Risks
- **False positives on legitimately public policies** (e.g., `"Points visible by visibility"`
  SELECT policies are correctly public). Mitigation: scope the check to non-SELECT commands
  (INSERT/UPDATE/DELETE/ALL) only — public SELECT is a normal, common pattern; public writes are
  the specific bug class this targets.
- **Annotation becomes a rubber stamp** (any dev adds `-- intentionally-public` to bypass without
  real justification). Mitigation: same risk already accepted for `-- client-safe:` — code review
  is the actual enforcement layer; the annotation's value is making the choice explicit and
  greppable, not preventing bad judgment.

### Non-Goals
- Do NOT retroactively scan/fix existing migrations (P1038 covers the INSERT-ownership class;
  a separate one-time scan for THIS class, if wanted, is a different task — this spec is the
  going-forward guard only)
- Do NOT block SELECT policies (public reads are a normal, frequent, legitimate pattern in this
  schema)
- Do NOT attempt to validate that a `TO <role>` clause names the *correct* role — only that one
  exists when the check clause suggests role-scoping was intended

## Done-When

- [x] Pre-commit check exists and blocks a migration containing an unscoped `USING(true)` or
      `WITH CHECK(true)` (or role-identity-referencing) non-SELECT policy without the annotation
- [x] The check's failure path has been exercised (epistemic gate 7 — simulate a migration with
      the exact P1035 shape, confirm non-zero exit) before considering this done
- [x] A migration with a proper `TO service_role` clause passes cleanly (no false positive)
- [x] A migration with the `-- intentionally-public: <reason>` annotation passes cleanly
- [x] `docs/technical/database.md` or `.claude/rules/database.md` references the new check so
      future migration authors know it exists before hitting it
