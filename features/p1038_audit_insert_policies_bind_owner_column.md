---
status: week
type: task
rank: 1000962.0
severity: high
created_date: '2026-08-10'
tags: [security, rls, audit, content-integrity]
delivery_stage: create-spec
pipeline_ran: [create-spec]
driver: anomaly
---

# P1038: Audit all owner-column tables for INSERT policies that don't bind ownership

## Problem

P1032 and P1034 found the same bug class on two different tables discovered reactively, one
after the other: an INSERT policy checks that the caller is *a* verified user, but never that
the row's own owner column (`author_id`, `first_validator_id`, etc.) actually names the caller —
while the table's UPDATE/DELETE policies on the same column already do bind ownership. Both
instances were found by accident (P1032 via a spec-review pass on unrelated work; P1034 via
adversarial code review of P1032's own fix). There is no reason to believe these are the only two
— every table with an owner column and an INSERT policy is a candidate until checked.

## Appetite

Low blast radius per fix (a single `AND <owner_column> = auth.uid()` predicate addition, matching
the proven P1032/P1035 pattern) but the audit itself touches every owner-column table in the
schema — potentially multiple migrations. Fully reversible per-table (each fix is an independent
`DROP POLICY` + `CREATE POLICY` migration). Low decision density — the fix pattern is already
established; this is enumeration + verification, not design.

## Solution

1. Enumerate every table with an owner/author-identity column: grep all `CREATE TABLE` statements
   in `supabase/migrations/` for columns matching `author_id`, `*_id UUID.*REFERENCES profiles`,
   `user_id`, `creator_id`, `host_id`, etc. Cross-check against `docs/technical/database.md`.
2. For each such table, find its current INSERT policy (`grep -A5 "FOR INSERT" supabase/migrations/`
   for that table, taking the most recent one — same method P1032's spec used to confirm which
   policy is live) and its UPDATE/DELETE policies on the same table.
3. Compare: does the INSERT policy's `WITH CHECK` bind the owner column the same way UPDATE/DELETE
   do? If UPDATE/DELETE don't bind ownership either (some tables may be intentionally open), that's
   not a gap — only flag tables where INSERT is the odd one out.
4. For each confirmed gap, verify live state on both test and prod (`pg_policies` query) before
   fixing — P1035 showed migration file history can lie about live state.
5. Fix confirmed gaps with the established pattern; one migration per table or a batched migration
   if multiple gaps are confirmed at once. Write a canary per table following P1032's
   `e2e/integration/p1032-reproduce.spec.ts` shape (forge the owner column, assert rejection, plus
   a positive control).

## Risks / Non-Goals

### Risks
- **False positives on intentionally-open tables** (e.g., `witnesses` — any authenticated user can
  endorse any profile by design, per `.claude/rules/database.md`). Mitigation: only flag a gap when
  the table's own UPDATE/DELETE policies bind ownership and INSERT doesn't — an intentionally-open
  table won't bind ownership anywhere, so it won't false-positive under this comparison.
- **Scope creep into unrelated RLS hardening.** Mitigation: this audit is scoped to the exact
  bug class (INSERT vs UPDATE/DELETE ownership-binding asymmetry) — not a general RLS review.

### Non-Goals
- Do NOT audit SELECT policies (different bug class — visibility, not ownership-on-write)
- Do NOT audit service-role bypass policies (that's the separate P1035 bug class — unscoped `TO`
  clause — tracked as its own follow-up, not this audit)
- Do NOT redesign the ownership model for any table — only add the missing binding predicate,
  matching the exact pattern each table's own UPDATE/DELETE policy already uses
- Do NOT fix tables where UPDATE/DELETE also don't bind ownership — that's a different, larger
  design question requiring a founder decision, not a mechanical audit fix

## Done-When

- [ ] Every table with an owner column has been checked and its status recorded (bound / not
      applicable / gap found)
- [ ] Every confirmed gap has a fix migration, verified live on test before merging
- [ ] Each fix has a regression canary following the P1032 pattern (forge + assert rejection +
      positive control)
- [ ] Findings summarized in `docs/decisions.md` or this spec's resolution, even if the audit
      finds zero additional gaps (a clean audit is still worth recording — see decisions.md
      epistemic gate 8, record under uncertainty)
