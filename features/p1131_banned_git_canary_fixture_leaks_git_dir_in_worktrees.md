---
status: week
type: bug
rank: 51
severity: medium
workstream: infra
date_reported: '2026-08-20'
created_date: '2026-08-20'
tags: [pre-commit, worktree, testing, git-ops, p1116]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1131: "Banned-git hook canary" fixture leaks GIT_DIR — cherry-pick mid-sequence BLOCK case is unverified for every worktree commit

## Summary

`scripts/test-block-banned-git.py`'s cherry-pick-mid-sequence fixture doesn't isolate itself from
the inherited `GIT_DIR` environment variable, so the pre-commit "Banned-git hook canary" fails
with "FIXTURE BROKEN: sequencer dir not resolvable" on every commit made from a worktree — even
though nothing about `block-banned-git.py`'s real behavior changed. It only passes on `main` by
coincidence.

## Root Cause

The fixture (`scripts/test-block-banned-git.py:159-172`) creates a fresh temp repo (`git init`,
then manually makes `tmp/.git/sequencer/`), then calls `git rev-parse --git-path sequencer` with
`cwd=tmp` to confirm the fixture's own sequencer path resolved, before running the actual
BLOCK-case checks against it. It never strips the inherited `GIT_DIR`/`GIT_WORK_TREE` env vars
before spawning that subprocess.

When `scripts/pre-commit-checks.sh` runs as a real git hook from a worktree (e.g.
`.claude/worktrees/w4`), git sets `GIT_DIR` to an **absolute** path for the hook's environment
(e.g. `/Users/.../claritypledge/.git/worktrees/w4`). An absolute `GIT_DIR` env var wins over
`cwd`-based repo discovery in `git rev-parse`, so the subprocess resolves the sequencer path
against the *outer* worktree's real git-dir instead of the fixture's own `tmp/.git`. The fixture's
own integrity guard (added specifically so this failure mode reports "FIXTURE BROKEN" instead of
a false PASS — see the comment at line ~165) catches this and correctly refuses to silently pass,
but the practical effect is: the commit is blocked with "1 error(s)" any time this canary runs
from a worktree.

**Why it passes on `main`:** from the main checkout, git sets `GIT_DIR` to the relative string
`.git`, not an absolute path. A relative `GIT_DIR` resolves relative to the subprocess's `cwd`,
which is the fixture's own `tmp` dir — so on main it accidentally resolves to `tmp/.git` and the
fixture works by coincidence, not by design.

## Reproduction Steps

1. `cd .claude/worktrees/w4` (or any worktree)
2. `GIT_DIR="$(git rev-parse --git-dir)" python3 scripts/test-block-banned-git.py`
3. Observe: `FAIL: 1 case(s) regressed -- block-banned-git.py behaviour changed` /
   `FIXTURE BROKEN: sequencer dir not resolvable at <worktree>/.git/worktrees/wN/sequencer`
4. Compare: running the identical command from `main` (where `GIT_DIR` is the relative string
   `.git`) → `PASS: all cases behave as expected` (77/77)
5. Compare: running `python3 scripts/test-block-banned-git.py` bare (no `GIT_DIR` set) from the
   same worktree → also PASSES — proving the trigger is specifically the git-hook-injected
   absolute `GIT_DIR`, not the worktree location itself.

**Reproduction rate:** 100% for any real `git commit` from a worktree (this is the path
`pre-commit-checks.sh` actually runs under, since it executes as `.git/hooks/pre-commit`).

## Expected Behavior

The "SHOULD BLOCK: cherry-pick --abort/--quit MID-sequence" fixture case should build and probe
its own isolated temp repo regardless of the invoking shell's `GIT_DIR`/`GIT_WORK_TREE`, and
either pass or fail based on `block-banned-git.py`'s actual behavior — never on which directory
(main vs. worktree) the hook happened to run from.

## Actual Behavior

Every commit attempted from a worktree blocks on "Banned-git hook canary (P1116)... ✗" with
"FIXTURE BROKEN: sequencer dir not resolvable," forcing the committer to either commit from main
instead, or invoke `--no-verify` with a manual pre-existing-failure classification each time.

## Affected Files

- `scripts/test-block-banned-git.py:159-172` — the cherry-pick-mid-sequence fixture; the
  `subprocess.run` calls for `git init`, `git rev-parse --git-path sequencer`, and the two
  `check(..., project_dir=tmp)` calls that follow all need an explicit `env=` with `GIT_DIR` and
  `GIT_WORK_TREE` stripped.

## Severity

**Medium** — does not itself let a banned git command through (the real hook,
`block-banned-git.py`, is untouched); it silently removes test *coverage* for the "cherry-pick
mid-sequence should BLOCK" case whenever committing from a worktree, which is the documented
default workflow for `/dev` and `/fix` (CLAUDE.md "Risky Operations"). Since worktrees are the
default, this has likely been silently unverified since P1116 shipped (2026-06-10) for the
overwhelming majority of real commits.

## Fix Approach

In the fixture's `subprocess.run()` calls inside `scripts/test-block-banned-git.py` (the ones that
build/probe/exercise the `tmp` repo), pass an explicit `env=` with `GIT_DIR` and `GIT_WORK_TREE`
removed:

```python
_clean_env = {k: v for k, v in os.environ.items() if k not in ("GIT_DIR", "GIT_WORK_TREE")}
```

and thread `env=_clean_env` through the `git init`, `git rev-parse --git-path sequencer`, and the
two `check(..., project_dir=tmp)` calls in that block (check `check()`'s signature — it may need
an `env=` passthrough param added too, since it likely calls `subprocess.run` internally).

## Acceptance Criteria

- [ ] `GIT_DIR="$(git rev-parse --git-dir)" python3 scripts/test-block-banned-git.py`, run from
      inside any worktree, passes 77/77 (no "FIXTURE BROKEN")
- [ ] The same command, run from `main`, still passes 77/77 (no regression on the
      currently-working path)
- [ ] A real `git commit` from a worktree no longer blocks on this canary for unrelated reasons
- [ ] No console errors / no change to `block-banned-git.py`'s actual banned-command detection
      behavior (only the fixture's isolation changes)

## Context

Discovered while committing P1122 (docs contradiction fix) from worktree `.claude/worktrees/w4` —
entirely unrelated to P1122's content; confirmed via the reproduction steps above that the
failure is independent of what was staged at the time.
