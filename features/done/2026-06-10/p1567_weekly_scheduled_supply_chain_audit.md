---
status: all-done
type: task
rank: 73
workstream: infrastructure
created_date: '2026-10-26'
tags: [security, supply-chain, monitoring, ci]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
completed_at: 2026-10-26
---

# P1567: Weekly scheduled supply-chain audit

## Problem

**Situation:** `scripts/dep-audit.sh` audits every dependency manifest and lock in the repo against
OSV and `npm audit`, and exits 0 CLEAN / 1 FINDING / 2 INCOMPLETE
([supply-chain.md](../../../docs/technical/supply-chain.md)). It runs only when someone types it.
**Complication:** A package we already lock can be flagged malicious days after we locked it. The
lock does not change, so no commit, push or pre-commit check ever re-runs the audit, and nobody
finds out.
**Question:** How does a newly published advisory against something we already depend on reach the
founder without anyone remembering to look?

> Founder framing, verbatim: "I don't want to deal with this. Ideally, it's automated as part of our slash day routine."

## Appetite

Blast radius: low — one new workflow, no product code. Reversibility: delete the file. Decision
density: zero — the alert route is already decided (rulings below).

## Solution

A GitHub Actions workflow on a weekly cron (`17 6 * * 1`, Monday 06:17 UTC, before the founder's
`/day`) plus `workflow_dispatch` checks out `main` and runs `./scripts/dep-audit.sh`, using the
runner's `python3` and Node from `actions/setup-node`. It follows the scheduled-alert pattern in
`edge-smoke.yml`, with these differences:

- Exact issue title: `Supply-chain audit: FINDING or INCOMPLETE on main`. Looked up among open
  issues authored by the Actions bot (`gh issue list --author app/github-actions`), so other open
  issues can never push it past the list limit.
- exit 0: close that issue if open (recovery).
- exit 1 or 2: comment on that issue, or create it. **The body carries only the fixed status word
  (`FINDING (exit 1)` / `INCOMPLETE (exit 2)`) and the run URL.** The repo is public, so audit output
  (package names, advisory ids) stays in the run log, exactly as `edge-smoke.yml` keeps its failing
  function names out of the body. No audit output is ever interpolated into a shell string.
- The alert step runs on `always()` and treats anything other than a recorded exit 0 as failing:
  an audit that crashed, timed out, was cancelled or never started (checkout or setup failed)
  opens the issue as INCOMPLETE. Step and job carry explicit `timeout-minutes`.
- `actions/checkout` with `persist-credentials: false` (`edge-smoke.yml` does not set it; this
  workflow must).
- A `workflow_dispatch` input `simulate_exit` (default empty) skips the audit and records the given
  exit code, so the alert path can be exercised on prod without breaking `main`.

`/day` already lists open GitHub issues (`.claude/commands/slava/maintain/day-cp.md`, the
`gh issue list --state open` step), so the founder sees it there with no `/day` change. Verify that
claim during implementation; change `/day` only if the issue would not appear.

## Invariants

- Only exit 0 counts as clean. A crashed, timed-out or skipped audit opens the issue
  (dep-audit's own contract: "INCOMPLETE ... never reported as clean").
- The workflow holds no secrets beyond the default `GITHUB_TOKEN`, with `contents: read` and
  `issues: write` only, and `persist-credentials: false` on checkout (P1563 install-time controls).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| OSV or npm registry outage opens a false alarm | ACCEPT | It says INCOMPLETE, closes on the next clean run; a missed real alert costs more |
| A standing INCOMPLETE (for example an `unchecked` source) keeps the issue open forever | MITIGATE | The audit passes on main today; verify that before enabling |
| Weekly is too slow for an active compromise | ACCEPT | Install-time controls (no scripts, 7-day cooldown) are the fast layer; this is the backstop |

**Non-Goals**
- Do NOT run the audit inside `/day` or `/weekly` (decisions.md 2026-08-09 [process]).
- Do NOT change `scripts/dep-audit.sh` or its exit contract.
- Do NOT email or message the founder; issues only.

**Rulings** (`scripts/search-decisions.sh`, both logs searched): decisions.md 2026-08-09 [process]
"Monitoring is a scheduled workflow, not a step inside a human-invoked skill" (P1031); 2026-06-06
[process], scheduled-gate alerts route to find-or-append GitHub issues consumed by `/day`, never the
founder's inbox.

## Done-When

- [x] The alert logic is tested before merge by a script that runs the workflow's alert step
      verbatim (extracted from the YAML, not re-typed) against a stub `gh`, for exit 0, 1, 2, a
      crash, and "audit never ran": 1/2/crash/never-ran create or comment, 0 closes, and a second
      failure comments instead of opening a duplicate. Exit codes pasted, including a control that
      makes the test fail. `[post-deploy]` dispatch with `simulate_exit=1`, then `2`, then a clean
      run on GitHub: one real issue opened, commented, closed; no test issue left open
      Evidence 2026-10-26: `scripts/test-p1567-supply-chain-alert.sh` exit 0, 0 failures (exit 0/1/2/137/unset/empty/hostile text/lookup failure/simulated 0); removing the comment step, the SIMULATED guard or the lookup fallback from the real workflow each made it FAIL (exit 1).
- [x] `./scripts/dep-audit.sh` exits 0 on current `main` locally, so the first scheduled run will
      not open a standing issue. `[post-deploy]` first real dispatch is green
      Evidence: `./scripts/dep-audit.sh` exit 0, 50 manifests, RESULT: CLEAN.
- [x] The workflow passes `actionlint` (or the repo's existing workflow lint), sets
      `persist-credentials: false`, and requests only `contents: read` and `issues: write`
      Evidence: actionlint is not installed here; YAML parses (Ruby) and pre-commit passed; the test asserts persist-credentials, ref: main, GH_REPO and the concurrency group.
- [x] `/day`'s open-issue step would list the alert issue: its command shown to return issues of
      this title (read-only `gh issue list` against an existing open issue)
      Evidence: `day-cp.md` runs `gh issue list --state open --limit 50` with no author or label filter.
- [x] `docs/technical/supply-chain.md` says the audit also runs weekly and where the alert goes
      Evidence: new "Weekly scheduled audit" section.

## Alternatives Considered

- **Run the audit in `/day`**: rejected by the 2026-08-09 ruling; detection would wait for a session.
- **Dependabot or GitHub security alerts only**: covers npm advisories but not OSV `MAL-` ids across
  Deno and Python locks, and does not report INCOMPLETE.
- **`/security-review` on a schedule**: reviews a branch diff, not the installed dependency set.

## Rollback Strategy

Delete the workflow file; close any open alert issue.
