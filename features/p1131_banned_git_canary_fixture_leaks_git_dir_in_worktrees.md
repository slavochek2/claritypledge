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

# P1131: "Banned-git hook canary" fixture leaks GIT_DIR — cherry-pick mid-sequence BLOCK case is unverified for gated-path worktree commits

## Summary

`scripts/test-block-banned-git.py`'s cherry-pick-mid-sequence fixture doesn't isolate itself from
the inherited `GIT_DIR` environment variable, so the pre-commit "Banned-git hook canary" fails
with "FIXTURE BROKEN: sequencer dir not resolvable" on any worktree commit that stages one of the
seven paths this canary group is gated on — even though nothing about `block-banned-git.py`'s real
behavior changed. It only passes on `main` by coincidence.

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

**Reproduction rate:** 100% for a `git commit` from a worktree that stages any of the seven paths
`pre-commit-checks.sh:363` gates this canary group on (`.claude/settings.json`,
`.claude/hooks/block-banned-git.py`, `.claude/hooks/route-brief.sh`,
`scripts/test-block-banned-git.py`, `scripts/test-route-brief.sh`,
`scripts/test-validate-command-refs.py`, `scripts/validate-command-refs.py`) — **not** every
worktree commit; the P1122 commit that surfaced this tripped it by staging
`scripts/validate-command-refs.py` for an unrelated reason (`git show --stat 6bb763c4`).
Commits that touch none of those seven paths skip the whole canary group
(`>>> P1116 mechanization canaries skipped`) and never see this failure.

## Expected Behavior

The "SHOULD BLOCK: cherry-pick --abort/--quit MID-sequence" fixture case should build and probe
its own isolated temp repo regardless of the invoking shell's `GIT_DIR`/`GIT_WORK_TREE`, and
either pass or fail based on `block-banned-git.py`'s actual behavior — never on which directory
(main vs. worktree) the hook happened to run from.

## Actual Behavior

Any worktree commit that stages one of the seven gated paths (see Reproduction Steps) blocks on
"Banned-git hook canary (P1116)... ✗" with "FIXTURE BROKEN: sequencer dir not resolvable,"
forcing the committer to either commit from main instead, or invoke `--no-verify` with a manual
pre-existing-failure classification each time.

## Affected Files

- `scripts/test-block-banned-git.py:159-172` — the cherry-pick-mid-sequence fixture; the
  `subprocess.run` calls for `git init`, `git rev-parse --git-path sequencer`, and the two
  `check(..., project_dir=tmp)` calls that follow all need an explicit `env=` with `GIT_DIR` and
  `GIT_WORK_TREE` stripped.
- `scripts/test-block-banned-git.py:37` — `run()`'s `env = dict(os.environ, CLAUDE_PROJECT_DIR=project_dir)`
  starts from the inherited `os.environ` and only adds `CLAUDE_PROJECT_DIR`; it never strips
  `GIT_DIR`/`GIT_WORK_TREE` before invoking the real hook (`block-banned-git.py`) as a subprocess.
  This is the second, more severe leak site: `check(..., project_dir=tmp)` calls `run(cmd,
  project_dir=tmp)`, so the *actual hook under test* — not just the fixture's own probe — can
  resolve `GIT_DIR` from the invoking shell instead of respecting `project_dir`/`CLAUDE_PROJECT_DIR`,
  changing its BLOCK/PASS verdict independent of the sequencer-probe issue above.

## Severity

**Medium** — does not itself let a banned git command through (the real hook,
`block-banned-git.py`, is untouched); it silently removes test *coverage* for the "cherry-pick
mid-sequence should BLOCK" case whenever a worktree commit stages one of the seven gated paths.

**Corrected timeline (2026-08-20, post-review):** the fixture is not P1116-original — `git log
--follow -- scripts/test-block-banned-git.py` shows it landed 2026-08-19 (`5e2f2c8d`, "mechanize
three measured-unenforced rule classes"), one day before this bug was found, not six weeks. The
original "since P1116 shipped (2026-06-10)" claim was a folder-name misread:
`features/done/2026-06-10/` is where the P1122 and P1116 *specs* happen to sit, but that folder
name is not a ship date — both specs' own files were last touched 2026-08-20. The actual exposure
window is ~1 day, and only for commits touching the seven gated paths, not "the overwhelming
majority of real commits."

## Fix Approach

In the fixture's `subprocess.run()` calls inside `scripts/test-block-banned-git.py` (the ones that
build/probe/exercise the `tmp` repo), pass an explicit `env=` with `GIT_DIR` and `GIT_WORK_TREE`
removed:

```python
_clean_env = {k: v for k, v in os.environ.items() if k not in ("GIT_DIR", "GIT_WORK_TREE")}
```

Thread `env=_clean_env` through the `git init`, `git rev-parse --git-path sequencer` calls in the
sequencer-probe block (lines ~159-172), **and** separately fix `run()` at line 37 to build its
`env` from `_clean_env` instead of raw `os.environ`, so the actual hook subprocess it invokes
(`check()` → `run()` → `block-banned-git.py`) can't inherit `GIT_DIR`/`GIT_WORK_TREE` either.
Both sites need the fix — stripping only the sequencer-probe leak (159-172) would still leave
`run()`'s own leak able to change the hook's verdict on any `project_dir=tmp` check.

## Acceptance Criteria

- [ ] `GIT_DIR="$(git rev-parse --git-dir)" python3 scripts/test-block-banned-git.py`, run from
      inside any worktree, passes 77/77 (no "FIXTURE BROKEN")
- [ ] The same command, run from `main`, still passes 77/77 (no regression on the
      currently-working path)
- [ ] A real `git commit` from a worktree no longer blocks on this canary for unrelated reasons
- [ ] No console errors / no change to `block-banned-git.py`'s actual banned-command detection
      behavior (only the fixture's isolation changes)

## Context

Discovered while committing P1122 (docs contradiction fix) from worktree `.claude/worktrees/w4`.
`scripts/validate-command-refs.py` (one of the seven gated paths) was staged for an unrelated
reason (`KNOWN_RETIRED` update) — the failure itself is independent of what was staged, only the
*triggering* of the canary group depended on it; confirmed via the reproduction steps above.

**Post-review correction (2026-08-20):** an independent Opus critic pass on this session's `/kdd`
meta-reflection re-verified this spec against the actual files and found three overclaims already
committed to main (this spec + `docs/decisions.md`): the fix was framed as adding a `cwd=`
override (wrong — an absolute `GIT_DIR` beats `cwd`-based discovery regardless; the fix is env
stripping, already what Fix Approach says, but the chat/decisions.md summary said "cwd" not "env"),
the blast radius was overstated as "every worktree commit" (actually gated to seven staged paths),
and the exposure window was overstated as "six weeks since 2026-06-10" (actually ~1 day — a
folder-name misread; `features/done/2026-06-10/` is not a ship-date bucket for either P1122 or
P1116's own spec files, both last touched 2026-08-20). All three corrected above. The general
lesson: derive a "how long has this been broken" claim from `git log -- <the actual file>`, never
from the name of the `features/done/<date>/` folder a spec happens to sit in.
