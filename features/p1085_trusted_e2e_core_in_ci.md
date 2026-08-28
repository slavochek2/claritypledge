---
status: today
type: task
rank: 0.125
created_date: '2026-08-14'
tags:
  - testing
  - e2e
  - ci
  - coverage
delivery_stage: create-spec
pipeline_ran:
  - create-spec
driver: anomaly
locked_at: '2026-08-28T05:20:54.230Z'
---

# P1085: A trusted E2E core that runs in CI

## Problem

**Situation:** 409 E2E spec files (~2800 tests) exist and **nothing runs them automatically.**
`.github/workflows/test.yml` runs typecheck, lint, and vitest only. The two Playwright workflows
(`csp-smoke`, `prod-health-smoke`) target deployed prod URLs, not this suite. No hook, no schedule,
no PR check. They run only when a human or an agent types the command by hand.

**Complication:** That absence — not the individual rotted tests — is the root cause of coverage
rot ([decisions.md](../docs/decisions.md) 2026-08-11). It let the whole suite stay 100%
uncollectable for months without anyone noticing (P1033); let an assertion against copy renamed in
March survive until August (P1043); and let an RLS security assertion pass for an unrelated reason
since March. P1043 is now repairing those tests one file at a time. With no automated consumer,
they rot again on the same timescale, invisibly, for the same reason — 10 of 250 failing files are
repaired so far, and the mechanism that rotted them is untouched.

**Question:** What is the smallest set of E2E tests that can run automatically on every push, and
what database does it run against?

## Scheduling + autonomy direction (founder, 2026-08-28)

Recorded so this spec is self-explanatory next time it is opened.

**Target shape:** the suite runs **overnight on a schedule**, not at push time. The morning push
gate is "last night's core run was green" — so a push never waits on a multi-hour suite, and the
founder is not the mechanism that remembers to run anything. One guaranteed push opportunity per
day, minimum.

**Run vs auto-repair are two jobs; only the first is safe to start with.**
- *Job A — run + triage + report.* Nightly run, quarantine what fails, write a morning summary.
  Changes no code. Machine time only; tokens are spent solely when something is actually red.
- *Job B — auto-repair.* Deferred until Job A is boringly green and failures are rare. An agent
  repairing tests unattended is precisely where "weaken the test until it passes" beats "fix the
  code" — the inversion `.claude/rules/tests.md` exists to prevent, with nobody watching at 3am.

**Does running at night solve the database question? Partly — and it is the smaller part.**
Two problems were being conflated:
1. *Cross-session interference* (~15 concurrent local sessions on the shared test DB; the P885
   schema-drift incident is the worst case). **Night dissolves this** — those sessions are idle.
2. *Auth rate limiting.* **Night does NOT help.** Per decisions.md 2026-08-13 the ceiling is
   1800/hour bursting to ~30; measured average demand of 841–1381/hr sat *under* budget throughout,
   and **"the existing IP was never the constraint"**. The suite drains the 30-token burst by
   itself in seconds because workers create users in tight loops and retry in lockstep. Self-
   inflicted burstiness, not contention — an empty network at 3am is just as jammed.

**Consequence for Part 1 below:** the "provision a new Supabase project" option is weaker than this
spec's Problem section implies, and the [FOUNDER DECISION] may be closable at no cost. The diagnosed
fix for (2) is **jittered backoff paced against the burst** — a change in the test harness, not new
infrastructure. Sequence to evaluate: pacing fix -> schedule the already-green core nightly -> only
then ask whether a separate database is still needed.

## Appetite

**Blast radius: medium-high** — introduces a check that can block merges to `main`, and may
provision a new Supabase project. **Reversibility: high for the gate** (delete the workflow step,
delete the core list), **lower for a provisioned project** (creating one is reversible, but config
drift accrues while it exists). **Decision density: two open questions**, one of which
([FOUNDER DECISION] in Research Questions) may cost money.

## Solution

Three parts, in order. Part 1 blocks the rest.

**1. Choose the CI database.** See Research Questions. The shared test project is disqualified up
front: P1043 measured its per-IP auth burst being exhausted by the suite alone, producing
`Request rate limit reached` failures indistinguishable from real bugs. A gate that fails for that
reason is worse than no gate.

**2. Define the core by explicit criteria, seeded from tests that already pass.** Run 6
(2026-08-14, full unfiltered suite) measured **159 of 409 files fully green — 868 tests, zero
failures**. An initial core is therefore carvable with **no repair work at all**. Proposed entry
criteria, all four required:

- **(a) Covers a critical path** — auth, live session, letter send/read, story publish, or an
  RLS/security boundary.
- **(b) Currently green** in the run-6 baseline.
- **(c) Self-sufficient** — creates its own fixtures and its own auth. No dependence on ambient
  `storageState`, no dependence on global DB state
  ([e2e-testing-guide.md](../docs/technical/e2e-testing-guide.md), 2026-08-11 rule).
- **(d) Deterministic** — three consecutive green runs on unchanged code before it enters.

**3. Wire only the core into `test.yml`** as a check on push and PR to `main`. Everything outside
the core stays runnable by hand and is **explicitly labelled unwatched** in the testing guide, so
no reader infers coverage that does not exist.

## Risks / Non-Goals

### Risks

- **A gate that starts red is ignored within a week.** Mitigation: criterion (d); and a test that
  fails the gate twice for a non-product reason is **evicted from the core**, not tolerated inside
  it.
- **A core small enough to be fast may miss the regression it exists to catch.** Mitigation:
  criterion (a) is coverage-of-path, not test count. Research Question 3 makes the unwatched paths
  explicit rather than implicit.
- **Green proves only what the core models.** The core cannot be cited as evidence for out-of-core
  behaviour ([epistemic.md](../.claude/rules/epistemic.md) gate 7b). Mitigation: the testing guide
  states the watched/unwatched split.
- **Local pre-verification of core candidates is untrustworthy on a loaded machine.** P1043
  measured the same unchanged spec at 4.5 min and 57.5 min, with a twice-passing test failing only
  in the slow run (8 stray vite servers, 59 Playwright processes). CI runners are clean, so this is
  a local-only risk — but candidate selection happens locally. Mitigation: reap strays first
  ([process-learnings.md](../docs/process-learnings.md), due: week).

### Non-Goals

- Do NOT triage the remaining ~800 failures to green under this spec — that is P1043, which this
  spec re-scopes.
- Do NOT wire the full suite into CI. Run 6 took **5h25m**.
- Do NOT point CI at the shared test Supabase project.
- Do NOT delete or `.skip()` out-of-core tests to improve the numbers. Unwatched ≠ deleted; leave
  them runnable and labelled.
- Do NOT change product code to make a candidate test pass — a red candidate is excluded from the
  core, or filed as a product bug with its own P-number.

### Alternatives Considered

- **(A) Repair all ~2800 and gate the whole suite.** Rejected 2026-08-11: multi-hour wall clock,
  needs sharding plus its own database, and everything outside the critical path rots again anyway.
  This is the path the work has been drifting back onto.
- **(B) Prune hard** — delete most of the suite as a liability that produced no signal for months.
  Defensible and still available. This spec is the reversible form of the same judgment: label
  unwatched now, delete later with evidence rather than before it.
- **(C) Schedule the existing suite nightly, unchanged.** Rejected: it starts red, so it is ignored
  within a week — the failure mode risk 1 exists to prevent.

### Rollback Strategy

Remove the workflow step from `test.yml` (one block) and delete the core list file. If a dedicated
Supabase project was provisioned, decommission it. Reverts to today's state with no product impact.

## Research Questions

**1. Which database do the CI runs use? — blocks everything else.**
   - **(a) A dedicated CI Supabase project.** Isolated from local sessions. Costs money; needs
     migrations applied on every schema change and service keys in GitHub secrets.
     **[FOUNDER DECISION, resolved 2026-08-21: rejected — no paid CI Supabase project.]**
   - **(b) An ephemeral local Supabase inside the runner.** Free, perfectly isolated, no secret
     sprawl — but must apply **222 migrations** and serve **17 edge functions** per run. Startup
     cost and edge-function parity are both unverified. **[FOUNDER DECISION, resolved 2026-08-21:
     chosen — keep it simple, no paid project.]** Depends on P1132 landing first: that spec is what
     makes a from-empty migration apply possible at all.
   - **(c) Something else.** Ruled out by the decision above.

   **Deliverable: a measured answer, not a survey** — actual migration apply-time in a runner, and
   confirmation that the edge functions the core touches behave locally. There is no seed file
   (`supabase/seed*.sql` does not exist), so fixture creation cost must be measured too. The
   database choice is settled; this measurement is still outstanding.

**2. What is in the core?** Produce the list by applying criteria (a)–(d) to the 159 green files.
   Output: a committed list plus, for each entry, the critical path it covers.

**3. Which critical paths have NO green test today?** That set — and only that set — is the repair
   budget handed back to P1043.

## Done-When

- [ ] `test.yml` runs a named E2E core on push and PR to `main`, and the core's wall-clock
      duration is recorded in this spec and accepted by the founder
- [ ] The core runs against a database no local session shares — **verified** by running the local
      suite concurrently with a CI run and observing zero auth rate-limit failures in CI
- [ ] Three consecutive core runs are green on unchanged code
- [ ] **The gate has been seen to FAIL:** a deliberate product break turns the check red, with the
      non-zero exit pasted into this spec (epistemic gate 7 — a gate never watched failing is
      unproven)
- [ ] `docs/technical/e2e-testing-guide.md` names which tests are watched and which are explicitly
      unwatched, with the unwatched count
- [ ] P1043's acceptance criteria are re-scoped to the core; its out-of-core failures are recorded
      as unwatched rather than pending
