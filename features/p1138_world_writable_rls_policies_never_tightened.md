---
status: qa
type: bug
rank: 57
severity: high
workstream: infrastructure
date_reported: '2026-08-21'
created_date: '2026-08-21'
tags: [rls, security, prod, data-integrity]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
date_resolved: '2026-08-21'
root_cause: "Absolute-predicate write policies (USING(true)/WITH CHECK(true), no TO <role>) written permissive at creation, never revisited. clarity_verifications/demo_rounds/ideas/live_turns had zero live callers (clarity_verifications' write path is dead code in an unrouted page — the spec's original write-path audit was wrong, corrected empirically before the fix). ml_training_sessions carried a stray out-of-band policy duplicating an already-correct TO authenticated one; the upstream GCS signed-URL edge function already required a JWT, so no legitimate guest write depended on the broad policy."
resolution: "Migration 20260821140000_p1138_close_unauthenticated_write_policies.sql: dropped the 4 dead UPDATE policies outright; dropped the stray ml_training_sessions INSERT policy; reconstructed its missing CREATE TABLE. Extended scripts/rls-drift-check.py with a new unconditional-write leg (fires regardless of prod/test/file agreement) plus self-tests proving it catches the class and doesn't false-positive. Applied to test only — prod requires separate explicit approval per this spec's Non-Goals. Sibling finding on a different table family filed as P1139."
reproduce_artifact:
  test_file: e2e/integration/p1138-reproduce.spec.ts
  root_cause: "Absolute-predicate write policies (USING(true)/WITH CHECK(true), no TO <role>) written permissive at creation, never revisited; anon+authenticated hold table-level INSERT/UPDATE/DELETE grants so the policy is the only gate. Confirmed empirically on test via the real unauthenticated REST path — not just policy/grant catalogue reads."
  confidence: high
  surfaces_in_scope: [clarity_verifications, clarity_demo_rounds, clarity_ideas, clarity_live_turns, ml_training_sessions]
  surfaces_deferred: []
  scenarios_excluded: "clarity_idea_votes — founder decision, 20260211_tighten_idea_feed_rls.sql keeps USING(true) deliberately for anonymous voting"
  reproduced_at: '2026-08-21'
---

# P1138: A group of tables accepts unauthenticated writes on prod — original policies never tightened

> **Live and unpatched.** Per `.claude/commands/slava/maintain/privacy/SKILL.md`, the affected
> table list, the current grant/permission state, and the reproduction query are deliberately
> **not** in this public spec. They are in `.private/docs/security-log.md`, entry **2026-08-21
> "P1138 — absolute-predicate write policies, live on prod and test"**. Read that first;
> this spec is not actionable without it.

## Summary

A group of tables carries write policies with an unconditional predicate, live on prod and on
test. Unlike the drift incident that led to this discovery, these are faithfully reproduced
from migration files and identical across both environments, so the existing drift checker
cannot see them.

## Root Cause

Two origins, both "written permissive at creation, never revisited":

1. Several tables were created in early migrations with an unconditional write predicate and
   no explicit role scope. A later migration tightened one related group of tables and left
   this group alone. Nothing in that migration or in `docs/decisions.md` explains the
   exclusion — it reads as omission rather than a considered carve-out.
2. One affected table has **no `CREATE TABLE` in any migration at all** — recorded in the
   private log (2026-08-12) as created out-of-band. Its policy has the same origin.

**Why the existing guard does not fire.** `scripts/rls-drift-check.py` (P1048) compares live
prod against live test against migration files. These policies are present in all three, so
the checker is silent by design. It catches *divergence*; it is structurally blind to
*consistently wrong everywhere*.

This is the gap `docs/decisions.md` 2026-08-10 (`CREATE POLICY` without `TO <role>`) already
named as unbuilt: "A CI/lint check for `USING(true)`/`WITH CHECK(true)` ... that lacks a
`TO <role>` clause would catch this mechanically — not yet built." That entry also predicted
the recurrence shape: this bug class had already recurred once at the time of writing, with
nothing guarding a third occurrence.

**Write-path audit (`grep -rn` every `.update(`/`.insert(` call site in `src/`), done for
Fix Approach step 1:** three of the five affected tables (`clarity_demo_rounds`,
`clarity_ideas`, `clarity_live_turns`) have **zero** `.update()` call sites anywhere in the
repo — only `.insert()`. Their UPDATE policy has no legitimate client caller at all and
should be dropped outright, not scoped. `clarity_verifications` has real UPDATE callers
(`api.ts` rating/position updates) and needs the ownership predicate, not a drop.
`ml_training_sessions`'s three INSERT call sites are all unauthenticated-shaped (session
code + display name only, no `auth.uid()` check) — consistent with this being a genuine
guest/anonymous-session write path, not a bug in the caller.

## Reproduction Steps

Confirmed read-only against live policy catalogue on both projects, 2026-08-21, with the
project ref stated per query. Steps, table list and results: private log, 2026-08-21 entry.

**Reproduction rate:** 100% (policy state, not timing-dependent)

**Empirically reproduced 2026-08-21, test only (`gfjctyxqlwexxwsmkakq`).** All five in-scope
tables were exploited end-to-end via the real unauthenticated REST path (anon key, no
session): rows landed for `ml_training_sessions` (anon INSERT) and existing rows were
mutated with no ownership relationship for `clarity_verifications`, `clarity_demo_rounds`,
`clarity_ideas`, `clarity_live_turns` (anon UPDATE). Verified via a service-role re-read
after each attempt, not by reading the policy back. All seeded/exploited rows cleaned up
after — zero residue confirmed by a follow-up service-role query. Prod was never touched.

**Testing pitfall found and worked around:** a naive REST request that asks for the
inserted/updated row back (`Prefer: return=representation`, i.e. supabase-js `.select()`
chained after `.insert()`/`.update()`) can produce a **false negative** on
`ml_training_sessions` specifically — Postgres evaluates the table's SELECT policy against
the just-written row to satisfy the `RETURNING` clause, and that policy is locked to an
admin JWT claim. The INSERT itself still succeeds silently; only the echo-back is blocked,
and Postgres reports it with the same "violates row-level security policy" wording as a
real WITH CHECK failure. The real app call sites (`src/app/data/api.ts`) never chain
`.select()` on these inserts, so `Prefer: return=minimal` is the behavior that matters — the
canary test asserts via a separate service-role read for exactly this reason.

Canary: `e2e/integration/p1138-reproduce.spec.ts` — 5/5 failing before a fix, for the
right reason in each case (service-role re-read shows the unauthenticated write landed).

## Expected Behavior

A write from an unauthenticated caller is refused on every affected table. Tables with no
legitimate client-side write path carry no write policy at all, matching the precedent the
earlier tightening migration set for its own group of tables.

## Actual Behavior

The write is admitted unconditionally. One affected table holds the programme's core
calibration measurement; another holds the ML training corpus. Both are therefore open to
silent third-party modification, which is a research-integrity problem before it is a
privacy one.

## Affected Files

- Two early migrations under `supabase/migrations/` create the affected policies — named in
  the private log, withheld here while unpatched
- One affected table has no `CREATE TABLE` in `supabase/migrations/` at all
- `scripts/rls-drift-check.py` — the checker that cannot see this class

## Severity

**High** — a live unauthenticated write surface on prod affecting research-measurement
integrity and the training corpus. Not critical: no private-data disclosure, no privilege
escalation (the calibration table is unrelated to account verification — confirmed this
session), and most affected tables hold zero prod rows.

## Fix Approach

Drop the write policies where no client path needs them; scope them where one does.

`/reproduce` must establish, **per table, from `src/`**, whether a legitimate client write
path exists before anything is dropped. The precondition the earlier drift remedy used —
confirm each table retains the policies its real callers need, so the fix does not become an
outage — applies here unchanged.

Sequenced, test first, prod only on explicit founder approval:

1. Grep `src/` for writes to each affected table. A table with no caller loses the policy.
2. For a table with a real caller, add the ownership predicate its sibling policies already
   use, plus an explicit `TO <role>` clause per `docs/decisions.md` 2026-08-10.
3. Reconstruct the missing `CREATE TABLE` into a migration in the same pass, or that table
   stays invisible to every file-based audit that follows.
4. Extend `scripts/rls-drift-check.py` to flag an unconditional write predicate granted
   broadly, **regardless of whether prod, test and files agree**. Per
   `.claude/rules/epistemic.md` gate 7, watch it fail before trusting it — a green run on a
   new gate proves only that the happy path runs.

## Non-Goals

- **One table in the swept set is deliberately excluded.** Its unconditional predicate is a
  documented, accepted limitation: the anonymous model it serves has no authenticated identity
  for RLS to bind against, with enforcement at the app layer instead. Closing it means
  requiring sign-in for that action — a product decision, not a bug fix.
  `[FOUNDER DECISION: does that action require authentication?]`
- The read-side policies on the same tables are out of scope; this spec covers writes only.
- No prod mutation happens under this spec without a separate, explicit approval.

## Acceptance Criteria

- [x] An unauthenticated write to each affected table is refused **on test**, demonstrated by a
      canary observed failing first, not by reading the policy back — `e2e/integration/
      p1138-reproduce.spec.ts` failed 5/5 for the right reason before the migration, passed
      6/6 (including a new authenticated-path regression test) after it
- [x] Every legitimate in-app write path on the affected tables still succeeds — verified per
      table against a real caller, not asserted. `clarity_verifications`/`demo_rounds`/`ideas`/
      `live_turns`: grep-verified zero live UPDATE callers (`clarity_verifications`'s only
      callers live in the unrouted `clarity-chat-page.tsx` — dead code), so nothing to
      preserve; `ml_training_sessions`: new canary test signs in a real test user and confirms
      the authenticated INSERT still lands
- [x] The out-of-band table has a `CREATE TABLE` in `supabase/migrations/` — reconstructed in
      `20260821140000_p1138_close_unauthenticated_write_policies.sql`, columns confirmed
      against a live test-DB read (service role)
- [x] `scripts/rls-drift-check.py` flags an unconditional write predicate even when prod, test
      and migration files all agree, **and has been observed exiting non-zero** on a staged
      failure — `scripts/test-rls-drift-check.py` §7 constructs exactly that scenario
      (converged, migration-created, still `USING(true)`) and asserts exit 1; also confirmed
      it does NOT false-positive on a properly-scoped policy. 38/38 self-test assertions pass.
      Live run against real prod+test also exercised the new leg (found this fix not yet on
      prod, plus 4 unrelated pre-existing findings on a different table family — filed as
      P1139, Tier-1 same-class-different-surface)
- [ ] Live policy state on prod shows the fix applied, re-queried after deploy with the project
      ref stated explicitly in the evidence `[post-deploy]`
- [ ] Private log entry updated from unpatched to fixed, with the re-query output `[post-deploy]`
- [x] No console errors in the affected user flows after the change — no `*.tsx`/UI files
      touched; the only functional call site (`ml_training_sessions` authenticated INSERT) is
      covered by the new e2e regression test, which passed with no errors
