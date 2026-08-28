---
status: week
type: task
rank: 78
workstream: infrastructure
created_date: '2026-08-28'
tags: [testing, ci, canaries, gates]
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1175: The shell canaries have no automated runner — they only fire when someone remembers

## Problem

**Situation:** `scripts/` holds 20 `test-*.sh` canaries. Each exists to stop a specific incident
from recurring — noop manifest stamps (P1168), migration version collisions (P1042), banned-git
hook behavior (P1131), worktree setup, preflight, git-ops invariants.

**Complication:** nothing runs them. `.github/workflows/test.yml` runs typecheck, lint and vitest
only; `pre-commit-checks.sh` invokes a handful conditionally on staged paths, so a canary whose
subject was not staged never fires. Verified by grep: only `goal-gate.yml` and `privacy-scan.yml`
reference any shell script at all. During the P1173 session four canaries were run by hand, and one
of them (P1042) caught a genuine regression that nothing else would have.

**Question:** what runs these on every change, and does a red one actually stop anything?

> Founder framing, verbatim: "I just want to make sure that we can push every day and we can fix
> things every day and I'm out of the loop of this."

## Appetite

Blast radius: medium — introduces a check that can block merges. Reversibility: high for the
workflow (delete the step); the required-check setting is a GitHub toggle, reversible in one click.
Decision density: one founder call (whether the check becomes required).

## Invariants

Harvested from `docs/decisions.md` — these are prior rulings, not new constraints:

- **A workflow that is not a *required* check is advisory, and advisory checks get ignored.**
  Only `audit-privacy` is required on `main` (2026-06-27, and 2026-08-19 on `ui-gate`). Wiring the
  canaries into CI without the required-check toggle buys visibility, not enforcement — the spec
  must not claim otherwise.
- **A local hook is accident-prevention, never the boundary** (2026-06-27). Anyone controlling the
  machine can bypass it; the server-side check is the real gate.
- **Running the same script server-side buys enforcement, not extra detection** (2026-08-14,
  `privacy-scan.yml`). Do not expect new failures to appear merely from relocating execution.

## Solution

Run every `scripts/test-*.sh` canary in CI on push and pull request, as its own job so a failure
names the canary rather than a generic step.

Two properties matter more than the wiring:

1. **They must be hermetic and non-destructive in a shared runner.** Each canary is expected to
   build its own throwaway repo under `mktemp`. This is asserted, not assumed — `test-git-ops-
   extensions.sh` printed `Deleted branch feature/p210-stranded` during the P1173 session, which
   needs confirming as scoped to its temp fixture before it runs unattended anywhere.
2. **A canary that cannot fail is not a canary.** Before entry, each one is run against the
   pre-fix code (or has its failure path simulated) and shown to exit non-zero — epistemic gate 7.
   Any canary that cannot be demonstrated red is quarantined out of the set, not wired in green.

[FOUNDER DECISION: should this become a *required* check on `main`? Making it required is what
converts it from a signal into a guarantee, and it is a GitHub repository-settings toggle the agent
cannot flip. Without it, a red canary does not stop a merge.]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A canary is not hermetic and mutates shared state in the runner | MITIGATE | Audit each for `mktemp` isolation before wiring; quarantine any that fails the audit |
| Canaries are slow enough to make CI annoying | MITIGATE | Measure total wall-clock first; the P1173 canary alone sleeps ~7s deliberately. Shard or move slow ones to the nightly run if the total is unreasonable |
| A flaky canary starts crying wolf and the whole job gets ignored | MITIGATE | Same quarantine rule as P1085's core: out of the set on first unexplained flake |
| Wiring them in without the required-check toggle changes nothing enforceable | ACCEPT | Visibility is still worth having; the toggle is the founder's, and the spec says so plainly |

**Non-Goals**
- Do NOT wire the Playwright/E2E suite in — that is P1085 and has an unresolved database question.
- Do NOT rewrite any canary's assertions to make it pass. A red canary is the product working.
- Do NOT add a coverage threshold or coverage tooling. Explicitly rejected 2026-08-28: the suite's
  problem is that tests do not run, not that too little is covered.

## Done-When

- [ ] Every `scripts/test-*.sh` runs automatically on push and pull request
- [ ] Each canary in the set has been observed exiting non-zero at least once (gate 7), with the
      evidence recorded; any that cannot be shown red is listed as quarantined and why
- [ ] Total added CI wall-clock is measured and stated
- [ ] A deliberately broken change is pushed to a branch and the correct canary turns the job red
- [ ] The required-check question is answered either way and recorded in this spec

## Alternatives Considered

- **Run them all in `pre-commit-checks.sh` unconditionally** — rejected: local hooks are bypassable
  and are accident-prevention rather than a boundary (Invariants), and unconditional local runs
  slow every commit whether or not the subject was touched.
- **Fold them into the P1085 nightly run** — rejected for now: these are seconds, not hours, and
  have no database dependency, so they belong on the fast per-change path. Slow ones may move there
  later if the wall-clock measurement says so.
- **Leave as-is, run by hand** — rejected: it is the status quo whose failure this spec documents.

## Rollback Strategy

Delete the workflow job. No data, no migration, no provisioning. If the check was made required,
untoggle it in repository settings first so merges are not blocked by an absent job.

## Related

- **P1085** — same root cause (a suite with no automated consumer) for the E2E suite; blocked on a
  database question this spec does not have.
- **P1118** — whether the `ui-gate` check binds real code and whether CI enforces it; shares the
  required-check question.
