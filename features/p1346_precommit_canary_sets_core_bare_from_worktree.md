---
status: qa
type: bug
rank: 14
severity: high
workstream: infra
date_reported: 2026-09-22
created_date: 2026-09-22
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [pre-commit, canary, core-bare, git-env]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P1346: a pre-commit canary run from a worktree sets core.bare=true on the shared repo and recurses into the hook

## Summary

Committing `scripts/git-ops.sh` from a linked worktree made `test-p1211-git-ops-schema-gate.sh`
(pre-commit §4.7c3) write `core.bare = true` into the shared `.git/config`. That broke git for every
session on the main checkout. The canary's own `git commit` also landed in the real repo and fired
the pre-commit hook again, which ran the canary again, 10+ levels deep before it was killed. This is
the fourth `core.bare` incident (decisions.md 2026-09-07, 09-08, 09-15), and this time the cause
has been determined.

## Root Cause

Verified 2026-09-22 in a throwaway sandbox. A hook in a linked worktree receives
`GIT_DIR=<repo>/.git/worktrees/wN`. With that GIT_DIR inherited, `git init <dir>` re-initialises
GIT_DIR instead of creating `<dir>/.git` ("re-init: ignored --initial-branch") and writes
`core.bare = true` into the **common** config. A plain repo (`GIT_DIR=<repo>/.git`) is not flipped.
That is why the main checkout alone never reproduces it. P1131's canary header had already measured
the same mechanism.

`test-p1211-git-ops-schema-gate.sh` never unsets the git env. Eleven other `scripts/test-*.sh` files
that `git init` do not either. Each earlier fix (P1131, P1273, P1279) added the `unset` to one file.
All pre-commit canaries run through `run_quiet` (`scripts/lib/run-quiet.sh`). Its P1273 guard
catches writes to the index, but nothing stops the child from inheriting `GIT_DIR`.

Observed side effects, 2026-09-22: `core.bare=true` twice within about a minute, repaired by hand
both times. The w1 private index was rewritten to 521 staged deletions and rebuilt with `read-tree
HEAD`. No refs or commits were affected (reflog checked).

## Invariants

- Checks keep reading the commit's real staged content: `GIT_INDEX_FILE` is **not** scrubbed,
  because a pathspec or `-a` commit uses a temporary index that the privacy scans must see. The P1273
  guard remains the protection against index writes.
- The hook always runs main's `pre-commit-checks.sh` and `run-quiet.sh` (the untracked wrapper
  `exec`s an absolute path), so this fix protects every worktree only once it is on `main`.

## Reproduction Steps

1. In a sandbox: create a repo, `git worktree add ../wt`.
2. `env GIT_DIR=<repo>/.git/worktrees/wt git init -q <tmp>/w4`
3. `git --git-dir=<repo>/.git config core.bare` → `true`.

**Reproduction rate:** 100%.

## Expected Behavior

No check run by `pre-commit-checks.sh` can reach the committing repo through `GIT_DIR`,
`GIT_WORK_TREE`, `GIT_COMMON_DIR` or `GIT_OBJECT_DIRECTORY`.

## Actual Behavior

Each check inherits them, and any check that runs `git init` or `git commit` without scrubbing them
damages the shared repo.

## Affected Files

- `scripts/lib/run-quiet.sh` — `run_quiet`.
- `scripts/test-index-integrity-guard.sh` — the lib's canary.

## Severity

**High** — every concurrent session on the main checkout loses git until someone repairs the config by hand.

## Fix Approach

As built (after two review rounds): `run_quiet` runs each step in a subshell that unsets
every variable from `git rev-parse --local-env-vars` (fixed list as fallback) —
GIT_DIR, GIT_WORK_TREE, GIT_COMMON_DIR, GIT_OBJECT_DIRECTORY, GIT_CONFIG_PARAMETERS,
alternates, grafts, replace refs, shallow. `GIT_INDEX_FILE` is dropped when it resolves to the
repo's DEFAULT index (git exports it on every commit, absolute in a worktree — Opus) and kept
only for a temporary index (pathspec / `-a` commits), which staged-content checks must read.
The first draft kept GIT_INDEX_FILE unconditionally; the Invariants line above is superseded. Add a canary scenario that runs `git init` through `run_quiet` with a linked
worktree's GIT_DIR exported, pointing at a **decoy** repo, never this one (P1131's lesson), and
asserts that `core.bare` stays false. Per-file unsets in the twelve scripts become redundant under
pre-commit. They are left in place.

## Acceptance Criteria

- [x] New canary scenario: `git init` via `run_quiet` with a decoy worktree's `GIT_DIR` leaves the decoy's `core.bare=false`. — `scripts/test-index-integrity-guard.sh` scenario 5, which also asserts the step ran and created its own repo.
- [x] Control: the same scenario against the pre-fix `run-quiet.sh` flips it to `true`. — main's lib: 9 failures incl. "flipped the decoy's core.bare to true"; the same `git init` outside `run_quiet` flips it in-suite.
- [x] `run_quiet` children still see `GIT_INDEX_FILE` (asserted). — revised: a TEMPORARY index is passed through (6a) and the default index is dropped (6b, absolute and relative); 4a/4b prove the effect. 24/0.

Post-ship check, tracked in the inbox (the hook runs MAIN's lib, so it cannot be observed
before merge): a worktree commit staging `scripts/git-ops.sh` completes and `core.bare` on main
stays `false`.
