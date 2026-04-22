---
status: week
type: task
rank: 1000753.0
workstream: infrastructure
created_date: '2026-04-22'
tags: [p781, git-ops, worktrees, cross-session, main-lock]
parent: p781
blocks: [p788, p789]
---

# P787: git-ops.sh subcommand extensions — gc, abandon, reconcile, commit-to-main, switch-safe, sync

## Problem

`scripts/git-ops.sh` currently implements only `claim`, `status`, `release` (shipped via P783). The P781 architect plan specifies seven more subcommands to complete the cross-session worktree surface:

- **gc** — list orphan branches (no lockfile, no recent activity)
- **abandon** — remove lockfile AND worktree, preserve branch for review
- **reconcile** — cross-check active lockfiles against `git worktree list`, surface disagreements
- **commit-to-main** — serialize concurrent commits to main via `.claude/worktrees/main.lock`, prevents race conditions when two sessions try to stamp pipeline frontmatter simultaneously
- **switch-safe** — refuse branch switch when main has uncommitted changes not attributable to caller's lock
- **sync** — pull from origin, refuse push on any branch that exists on origin (push requires manual human step)

Without these, agents still reach for `git worktree remove`, `git checkout`, direct `git commit` against main — the ad-hoc paths P781 was designed to eliminate.

## Appetite

**Medium blast radius.** All edits land in one file (`scripts/git-ops.sh`). `commit-to-main` uses a lockfile (`.claude/worktrees/main.lock`) whose semantics must be right on first try — a stuck main.lock would block every future commit to main until manually cleared.

**Fully reversible.** `git revert` the commit; the pre-T04 state is a known-good shipped version.

**High decision density.** Lock acquisition timeout, how to surface "held by another session X", when to force-release, whether `sync` should refuse pulls on diverged branches, etc. Each decision needs an answer in this spec before coding.

## Solution

### T03: `gc`, `abandon`, `reconcile`

```
git-ops.sh gc [--dry-run | --yes --delete-branches]
  - Lists branches with prefix `feature/p*` or `fix/p*` that have:
    (a) no active lockfile under .claude/worktrees/*, AND
    (b) no commits in the last 30 days
  - Default: dry-run. Requires BOTH `--yes` AND `--delete-branches` to actually delete.
  - Never touches branches present in `git worktree list` output.

git-ops.sh abandon <slot>
  - Removes `.claude/worktrees/wN/.lock` (ownership-checked, same rule as release)
  - Removes `.claude/worktrees/wN` (git worktree remove --force)
  - Does NOT delete the branch. Use `gc` for that.

git-ops.sh reconcile
  - For each slot directory under .claude/worktrees/:
    - Has .lock but not in `git worktree list` → report orphan-lock
    - In `git worktree list` but no .lock → report orphan-worktree
    - Both present and lockfile is LIVE → report OK
  - Exit 0 if all OK, 2 if any orphans found.
```

### T04: `commit-to-main`, `switch-safe`

```
git-ops.sh commit-to-main [--message M] [--files F1 F2 ...]
  - Acquires .claude/worktrees/main.lock (timeout: 120s, reports "held by session X (pid Y)" on contention)
  - Must be called from main repo root (NOT a worktree)
  - Stages --files (explicit list, never `-A`), commits with --message
  - Releases main.lock
  - Lock contains: PID + PID_START_TIME + NONCE + SESSION_ID + started_at

git-ops.sh switch-safe <branch>
  - Run pre-flight checks from pre-flight.sh (dep on P786 T07 — this cmd gracefully degrades if pre-flight.sh absent)
  - Refuse if cwd's main has uncommitted changes not in caller's lock manifest
  - Otherwise: git checkout <branch>
```

### T05: `sync`

```
git-ops.sh sync
  - Fetches origin (safe, read-only)
  - If current branch exists on origin (e.g., main, origin/feature/pN-*):
    FAIL with "Branch {branch} is published; push is human-gated. Never auto-push."
    Exit 3.
  - If current branch is local-only: runs git pull --ff-only
```

**Lock contention model:** `commit-to-main` waits up to 120s for main.lock. If timeout expires, it emits:
```
git-ops: main.lock held by session X (pid Y, started T).
         Last heartbeat: 2s ago (LIVE).
         Options: wait longer, or run `reconcile` to check for orphan.
```

Never force-releases. User-gated.

## Risks / Non-Goals

### Risks
- **Stuck main.lock** — e.g., session crashed mid-commit. Mitigated by: `reconcile` command detects orphan, user can manually delete `.claude/worktrees/main.lock` after verifying PID is dead.
- **`gc --delete-branches` trashes valid work** — mitigated by two-flag requirement (`--yes --delete-branches`) and 30-day activity window.
- **`sync` refuses a pull the user wanted** — by design; "push" is the failure mode we're preventing. Documented as deliberate.

### Non-Goals
- Do NOT auto-force-release locks after timeout. Always user-gated.
- Do NOT handle git LFS or submodules — out of scope.
- Do NOT try to recover from corrupted main.lock (malformed keys). Fail loud, user fixes.

## Done-When

- [ ] `git-ops.sh gc --dry-run` lists stale branches with no false positives on active slots
- [ ] `git-ops.sh abandon wN` removes lockfile + worktree, preserves branch
- [ ] `git-ops.sh reconcile` exits 2 when given a slot with lockfile but no worktree entry
- [ ] `git-ops.sh commit-to-main --files X --message "Y"` acquires main.lock, commits, releases
- [ ] Two concurrent `commit-to-main` calls serialize via main.lock — second call reports "held by session X"
- [ ] `git-ops.sh switch-safe main` refuses when main has uncommitted bystander changes
- [ ] `git-ops.sh sync` refuses on any branch with upstream tracking (origin/feature/*, origin/main, etc.)
- [ ] `git-ops.sh sync` on a local-only branch runs `git pull --ff-only`
- [ ] All new subcommands print sentinel-safe output (no `>`, `<`, `|` tokens — P783 shell-safety rule)

## Acceptance Criteria

- [ ] Regression test (hermetic): two concurrent subshell `commit-to-main` calls in a scratch repo — second fails with explicit "held by" message, no interleaved writes
- [ ] `gc --dry-run` output is stable across runs (sorted, deterministic)
- [ ] `reconcile` reports orphan-lock and orphan-worktree cases correctly
- [ ] All subcommand `--help` outputs reference P781/P787 for lineage

## Dependencies

- **Blocks:** P788 (`ship` subcommand builds on `commit-to-main` + `main.lock` model), P789 (skills use `commit-to-main`)
- **Blocked by:** None. Builds on already-shipped P783 surface (`claim`/`status`/`release`). Can start immediately on a branch from main.
- **Parallelizable with:** P786 (pre-flight.sh)

## Branch

`feature/p787-git-ops-extensions` — from main HEAD at start time.
