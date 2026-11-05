---
status: week
type: task
rank: 105
workstream: infrastructure
created_date: '2026-11-05'
tags: [pre-commit, tests, concurrency, git-ops]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1635: Concurrent commits overload the machine, and a clean ship runs no full suite

## Problem

**Situation:** `scripts/pre-commit-checks.sh` runs typecheck, build and the full unit suite (`npm test`) for any commit touching build-affecting files. Every worktree's commit runs this same hook, and nothing limits how many run at once.

**Complication:** Measured 2026-11-05:

- Load average 122, then 128, on 11 cores (5 performance). Swap 5.9 of 7.2 GB used.
- 3 full vitest runs at once, about 11 processes each. 6 commits in the hook, the longest around 15 minutes.
- Tracked test files by filename, including some vitest excludes: 253 (Aug 5), 518 (Oct 5), 1,054 (Nov 5). 15 worktrees, about 100 commits a day.
- The last recorded single-commit figure is "roughly 2.5 minutes" (`docs/decisions.md`, P1207 landing), from a much smaller suite. No current baseline exists.

Load has already produced false failures: P1394 and P1570 fixed tests that timed out only under load, and `decisions.md` records "~10 agents running full suites drove load average to ~195". Its proposal, "Serialize commits through one queue and cap parallel suite runs", was never built.

**A coverage gap sits under this.** The `decisions.md` P1207 entry says cherry-pick fires the hook on every commit. In a scratch repo on git 2.54, a plain commit fired it and a clean cherry-pick did not (two independent probes in spec review). `scripts/git-ops.sh` and `scripts/ship-gates.sh` contain no test command, and `.github/workflows/test.yml` runs only on `main` and PRs, not `staging/**`. So a clean `/ship` probably reaches `origin/main` with no full run on the landing tree, and CI sees a break only after it has reached `main`, which Vercel deploys.

**Question:** How do we bound simultaneous heavy runs and also get a full-suite verdict on what actually lands?

> Founder framing, verbatim: *"You can see multiple neighboring sessions being what appears to be stuck on committing. It takes so long. Never before it was so long."*

## Appetite

Blast radius: high, every commit and every landing. Reversibility: high, git revert plus a ruleset setting. Decision density: two founder calls below.

## Invariants

- **No path skips a check silently.** A step that runs zero tests, or fewer than the full suite, says so in the hook output with the count.
- **A file with no module-graph edge to its tests runs the full suite.** `pre-commit-checks.sh:107-108` relies on a `vercel.json`-only edit running the suite so the CSP canaries catch it.
- **Bypass stays banned.** Nothing here adds an env var or flag that skips tests.

## Solution

**Step 0, baseline.** Run the same scripted workload of 3 concurrent source commits before and after, with other sessions paused. Record per-step wall time and CPU, peak concurrent full runs, and total time. Count manual `./scripts/pre-commit-checks.sh` runs, since `CLAUDE.md` asks for one before each commit, which can double the suite per commit.

**Part 1, full suite on the staging hop.** Add `staging/**` to `test.yml`, and cover or explicitly refuse any other `STAGING_BRANCH_PREFIX` value (`git-ops.sh` supports one). Every landing route, `/ship` and `commit-to-main` alike, transits a staging branch (`docs/technical/git-workflow.md`), so this covers both with no local load, and CI judges the exact SHAs that get promoted.

**Founder decision, 2026-11-05: yes, make the unit-test job a required check on `main`, once the suite has shown it passes reliably on the staging hop.** This is a founder-only ruleset setting, so the founder flips it. Until then promotion must wait for the unit job and print its result without refusing, because `wait_for_required_checks` evaluates only the named required checks and would otherwise promote past a red or unfinished run with no message. The staging branch is not deleted while that job runs.

**Part 2, related tests at commit.** The hook replaces the full run with `vitest related --run <staged files>`, passing the staged list explicitly. A staged build-affecting file that is not imported source (`vercel.json`, lockfiles, `tsconfig*`, `public/`, config, `scripts/`, deletions, renames) runs the full suite. Tests that read source from disk always run too, because the module graph cannot see them: `p1533-auth-callback-no-public-nav.test.ts` reads `src/App.tsx` without importing it. 194 of 952 test files use `readFileSync` or an exec call (a coarse count). The implementer derives this group at run time rather than keeping a list, and step 0 measures its cost. Every test run in the hook has a worker cap, because a change to a widely imported file can select hundreds of test files. The step prints its selected count outside `run_quiet`, which hides output on success.

**Founder decision, 2026-11-05: yes, accept part 2.** A queue that keeps the full suite per commit makes the last of 6 commits wait about 5 suite runs while it holds `main.lock`, and other `commit-to-main` callers give up at 120s. Part 2 removes the lock, its stale-holder recovery and its waiting state. The accepted cost: a break in another area is caught at the staging hop rather than at the commit.

**If step 0 shows tests are not the main load, stop and return to the founder before building.**

### Queue requirements (only if part 2 is later reversed)

- Acquire outside `run_quiet`, which hides output and fails a commit if the index changed during the step (`scripts/lib/run-quiet.sh`).
- Acquire before `main.lock`, or refuse to queue while holding it.
- Define the wait limit, what happens when it expires, and a run-time limit on a live holder.
- Reclaim only after the holder's whole process tree is gone, atomically, with a PID-reuse check.
- A broken queue must not release every waiter at once.
- Log acquire and release, so overlap is measured rather than sampled by `ps`.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Related selection misses a test that reads a file by path rather than importing it | MITIGATE | The disk-reading group always runs; part 1 is the backstop |
| Red staging CI found after the author's session has moved on | MITIGATE | Promotion prints the unit job's result (Solution, part 1) |
| Fallback full runs still overlap | MITIGATE | Every run is capped; pass/fail threshold in Done-When |
| typecheck and build stay unbounded and may be the larger share of load | MITIGATE | Step 0 measures per-step CPU. If they dominate, this spec's Solution is revisited before building |
| Working tree differs from index during tests, in a partially staged file | ACCEPT | True of the full suite today |
| Worktrees run main's hook, so a branch cannot exercise its own change | MITIGATE | Prove with a copy of the hook before landing, as P1474 did by section extraction |

**Non-Goals**

- Do NOT raise `testTimeout`.
- Do NOT change the `commit-to-main` lock or the P1279 recorded-set check.
- Do NOT touch e2e runs (P1607).

## Done-When

- [ ] Step 0's before and after figures recorded here, from the same workload, with peak concurrent test workers no higher than the machine's 11 cores and total time for the 3 commits lower than before
- [ ] A staging push runs the full unit suite in CI, shown by a run link, and a deliberately broken test turns it red (exit code pasted)
- [ ] Promotion with a red, optional unit job prints that result, and a test proves it
- [ ] An unrelated-area broken test passes commit and turns the staging run red; a related broken test is refused at commit
- [ ] A `vercel.json`-only commit runs the full suite, a zero-test selection prints that it ran zero, and changing `src/App.tsx` in a way that breaks the p1533 test is refused at commit
- [ ] Documented workflows pass through the changed hook copy: docs-only commit, source commit, `commit-to-main`, a conflicted cherry-pick's `--continue`

## Alternatives Considered

- **Queue plus full suite per commit (the first draft):** kept only as the fallback. Three reviewers found that the wait exceeds the agent's 120s tool limit, and one found it also exceeds the 120s `main.lock` wait, which the code confirms.
- **`vitest --changed`:** rejected. It reads the working tree as well as the index, so a co-tenant's unstaged file widens the selection. Passing the staged list is deterministic.
- **Worker cap alone:** total process count still grows with the number of sessions.
- **Raise timeouts again:** the machine stays overloaded.

## Rollback Strategy

Revert the hook and workflow commits, and clear the required-check setting if one was added.

## Related

- P1394, P1570, P1573: load-only test failures. P1279: hook window race. P1607: e2e slot lock.
- `docs/decisions.md`: "Load is the flake source"; P1207 landing entry, whose cherry-pick claim needs correcting if `/dev` reproduces this on a real ship.
