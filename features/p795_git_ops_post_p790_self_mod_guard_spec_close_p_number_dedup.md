---
status: qa
type: bug
rank: 1000795.0
severity: medium
workstream: infra
date_reported: '2026-04-23'
created_date: '2026-04-23'
tags: [git-ops, ship-pipeline, scripts, infrastructure]
delivery_stage: fix
pipeline_ran: [create-bug, fix]
---

# P795: git-ops.sh post-P790: self-mod guard + spec-close deletion + P-number dedup

## Summary

Three bugs in the ship/worktree infrastructure exposed during P790 shipping: (1) `ship` happily runs when the branch modifies `git-ops.sh` itself, using stale script code mid-run; (2) the spec-close commit omits the `git mv` source deletion, leaving a staged-but-uncommitted deletion across sessions; (3) `next-p-number.sh` ignores deleted specs, allowing P-number reuse — P792 collided.

## Root Cause

**Bug 1 — Self-modifying ship:** Bash parses function bodies at script load time. When `ship` cherry-picks a commit that modifies `scripts/git-ops.sh`, the new file lands on disk but the running process continues executing the old code. No guard exists to detect this condition.

**Bug 2 — Spec-close missing source deletion:** The spec-close commit at ~L1421 of `git-ops.sh` is scoped to `$spec_dest` only: `git commit ... -- "$spec_dest"`. The `git mv` staging of the source path (`$spec_file`) is therefore left staged but uncommitted after the session ends. On P790 this caused the spec to land in `features/done/uat/` rather than `features/done/`.

**Bug 3 — P-number reuse from deleted specs:** `next-p-number.sh` scans only live files. After a spec is deleted (e.g., P792 was cleaned up), its number becomes available again and can be re-assigned to a new spec — causing duplicate P-number collisions in git history.

## Reproduction Steps

**Bug 1:**
1. Create a branch with at least one commit that modifies `scripts/git-ops.sh`
2. Run `./scripts/git-ops.sh ship pN` on that branch
3. Observe: ship proceeds without any warning; running process uses pre-patch `git-ops.sh` logic

**Bug 2:**
1. Have an in-progress spec at `features/pN_*.md`; run ship through to spec-close
2. Observe: `git status` shows the source spec path as staged-but-uncommitted after ship exits

**Bug 3:**
1. Create `features/p200_test.md`, commit, then `git rm features/p200_test.md`, commit the deletion
2. Run `./scripts/next-p-number.sh`
3. Observe: returned number may be ≤ 200, allowing P200 to be reused

**Reproduction rate:** 100% for each sub-bug

## Expected Behavior

- **Bug 1:** `ship` exits non-zero with message "branch modifies scripts/git-ops.sh — commit that change to main via commit-to-main first, rebase [branch] onto main, then re-ship"
- **Bug 2:** The spec-close commit includes both the `$spec_dest` and the staged deletion of `$spec_file`; `git status` is clean after ship
- **Bug 3:** `next-p-number.sh` returns a number strictly greater than any P-number ever used (including deleted ones)

## Actual Behavior

- **Bug 1:** Ship runs with stale script code after cherry-picking self-modifying commits; P790 spec was misrouted as a result
- **Bug 2:** `git mv` source deletion is staged but not committed by the spec-close step
- **Bug 3:** Deleted P-numbers are invisible to `next-p-number.sh`, causing reuse; P792 collided

## Affected Files

- `scripts/git-ops.sh` — ~line 1306 (after branch resolution, before `acquire_main_lock`) — self-mod guard needed
- `scripts/git-ops.sh` — ~line 1421 — spec-close commit missing `"$spec_file"` in path limiter
- `scripts/next-p-number.sh` — live-file scan only; needs git-history scan for deleted specs
- `scripts/test-git-ops-ship.sh` — two new canary tests needed (V and W)

## Severity

**Medium** — development workflow reliability broken; each bug has a manual workaround but all three caused concrete incidents during P790 shipping. No end-user data or features affected.

## Fix Approach

As designed in the architect plan (see `~/.claude/plans/abundant-fluttering-starfish.md`):

**Fix 1** — Insert self-mod guard in `git-ops.sh` after branch resolution (~L1306), before `acquire_main_lock`:
```bash
if ( cd "$REPO_ROOT" && git log --oneline "$branch" "^main" -- scripts/git-ops.sh 2>/dev/null | grep -q . ); then
  die "ship: branch modifies scripts/git-ops.sh — commit that change to main via commit-to-main first, rebase $branch onto main, then re-ship"
fi
```

**Fix 2** — Add `"$spec_file"` to the spec-close commit path limiter (~L1421):
```bash
( cd "$REPO_ROOT" && git commit -q -m "chore: close $pn — $title" -- "$spec_dest" "$spec_file" )
```

**Fix 3** — After live-file scan in `next-p-number.sh`, also collect P-numbers from git-deleted specs via `git log --all --diff-filter=D --name-only --format="" -- 'features/[pP]*.md' ...`; take max across both sets.

**Canary V** — `test-git-ops-ship.sh`: branch-modifies-git-ops.sh refuses ship (exit non-zero, correct message, main unchanged, no journal file).

**Canary W** — `test-git-ops-ship.sh`: deleted P200 spec cannot be re-assigned by `next-p-number.sh`.

## Acceptance Criteria

- [x] Attempting to ship a branch that modifies `scripts/git-ops.sh` exits non-zero with message containing "modifies scripts/git-ops.sh"
- [x] After a successful ship, `git status` is clean (no staged-but-uncommitted spec source path)
- [x] `next-p-number.sh` returns a number > 200 in a scratch repo where P200 was created then deleted
- [x] Canary V passes: ship refused, main HEAD unchanged, no journal file created
- [x] Canary W passes: returned number is strictly > 200
- [x] No regressions in existing canary tests (A–U)
