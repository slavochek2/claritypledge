---
status: in-progress
type: bug
rank: 1000055.0
severity: medium
workstream: tooling
date_reported: '2026-04-04'
created_date: '2026-04-04'
tags: [skills, ship, fix, process]
---

# P650: Three /ship + /fix skill flow bugs causing extra commits, failed checkouts, and wrong merge status

## Summary

Three predictable failure modes in the /ship and /fix skill flow: (1) /ship declares a feature "already on main" by misreading the feature branch log, (2) spec close produces 2 commits instead of 1 due to Edit-before-stage ordering, (3) `git checkout main` fails mid-ship when the spec has an uncommitted edit.

## Root Cause

**Bug 1 — Wrong log check:** Step 1a in ship.md checks divergence with `git rev-list`, but when verifying "is this already merged?", the agent reads `git log --oneline -8` without specifying the branch — so it reads the feature branch log and can incorrectly conclude the commit is already on main.

**Bug 2 — Edit-before-stage ordering:** ship.md step 5 and fix.md Phase 4 QA gate both describe updating frontmatter and moving the spec, but neither enforces the order: stage `git mv` first, then Edit frontmatter, then commit. When Edit runs before staging, git tracks the edit as a working-tree change separate from the rename, requiring a second commit.

**Bug 3 — Missing pre-checkout status check:** ship.md step 3.7 runs `git merge main` then switches to main for the final merge, but never checks `git status --short` first. Any uncommitted edit in the working tree causes `git checkout main` to abort.

## Reproduction Steps

1. Create a feature branch, commit a fix, run `/fix` to close spec
2. Run `/ship pN`:
   - **Bug 1:** Agent reads `git log --oneline -8` (feature branch), sees the fix commit, declares "already on main" — merge skipped
   - **Bug 2:** Agent edits spec frontmatter (status → all-done), then runs `git mv` — spec close requires 2 commits
   - **Bug 3:** Agent runs `git checkout main` with an uncommitted spec edit in working tree — checkout aborts with error

**Reproduction rate:** 100% for bugs 2 and 3 whenever steps are followed in the wrong order; bug 1 is intermittent (depends on log reading context)

## Expected Behavior

- Bug 1: /ship verifies merge status by checking `git log --oneline main | grep <sha>` — not feature branch log
- Bug 2: spec close always bundles rename + frontmatter edit in one commit
- Bug 3: /ship runs `git status --short` before `git checkout main` and commits/stashes any open edits first

## Actual Behavior

- Bug 1: Agent misreads feature branch log as main's log, may skip merge entirely
- Bug 2: spec close creates 2 commits — one for `git mv`, one for the frontmatter edit
- Bug 3: `git checkout main` fails mid-ship; user must manually commit/stash before retry

## Affected Files

- `.claude/commands/slava/build/ship.md` — step 1a (merge status check), step 3.7 (pre-checkout status), step 5 (spec close ordering)
- `.claude/commands/slava/build/fix.md` — Phase 4 QA gate (spec close ordering)

## Severity

**Medium** — all 3 are recurring and predictable; bugs 2 and 3 add manual recovery steps every ship; bug 1 risks silently skipping a merge

## Fix Approach

**Bug 1:** In ship.md step 1a, add explicit check: `git log --oneline main | grep <commit-sha>` before declaring "already merged". Never infer from feature branch log.

**Bug 2:** In ship.md step 5 and fix.md Phase 4, add explicit ordering instruction: (1) `git mv` the spec file, (2) Edit frontmatter on the moved file, (3) `git add` + commit both together.

**Bug 3:** In ship.md step 3.7, add `git status --short` check before `git checkout main`. If any uncommitted changes exist, commit or stash them first.

## Acceptance Criteria

- [ ] /ship correctly identifies "already merged" only when commit SHA appears in `git log --oneline main`
- [ ] spec close (done/ move + frontmatter update) lands in a single commit, not two
- [ ] `git checkout main` during /ship never fails due to uncommitted working tree changes
- [ ] No extra manual recovery steps required in a clean /ship run
