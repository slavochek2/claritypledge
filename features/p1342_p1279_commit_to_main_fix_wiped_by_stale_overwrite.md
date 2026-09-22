---
status: qa
type: bug
rank: 10
severity: high
workstream: infra
date_reported: 2026-09-22
created_date: 2026-09-22
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [git-ops, regression, commit-to-main, canary]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P1342: P1279's commit-to-main fix was wiped by a stale whole-file overwrite, and its canary is not wired to catch it

## Summary

`git-ops.sh commit-to-main` again exits 0 when the commit records files other than the ones
requested — the exact defect P1279 fixed on 2026-09-09. INBOX-57 (2026-09-11) observed it live:
empty commit `2ca583efd`, seven files requested, zero recorded, exit 0.

## Root Cause

Verified by command, 2026-09-22:

- P1279 landed its fix in `a7948ae85` + `de4a616dd` (+ a comment in `a0e51d0e0`), all on `main`.
- **`4179d97fb` (P1268, 1h45m later) removed every line of it.** Its message says it "lands
  scripts/git-ops.sh ahead of the p1268 ship" — a whole-file copy taken from a branch that predated
  P1279. Line-survival check: 67/67, 12/12 and 7/7 of those commits' added lines are absent from
  current `scripts/git-ops.sh`. No other commit in the window lost content (P1246/P1255/P1250 lines
  survive; nine P1246 lines differ because P1246's own later commits revised them).
- Nothing stopped it: `scripts/test-p1279-commit-to-main-index-race.sh` exists but is **not called
  by `pre-commit-checks.sh`** (grep of the §4.7 git-ops block). Run today on `main`: 5 passed,
  2 failed (`race`, `rc3`) — the canary would have refused `4179d97fb`.
- `.claude/rules/git.md` (§ "The lock does not cover the pre-commit hook window") describes the
  P1279 behaviour as current. It has been false since `4179d97fb`.

## Invariants

- `commit_staged_exact` return codes: 0 ok, 1 refused (nothing committed), 3 a commit LANDED
  recording the wrong files. rc 3 is never rolled back (`HEAD~1` on the shared checkout is banned).
- `commit-to-main` propagates rc 3 verbatim.

## Reproduction Steps

1. On `main`: `bash scripts/test-p1279-commit-to-main-index-race.sh`
2. Observe `FAIL race` and `FAIL rc3`, "5 passed, 2 failed".

**Reproduction rate:** 100% (hermetic scratch repo).

## Expected Behavior

Race scenario exits non-zero (3); canary 7/7; a commit that stages `scripts/git-ops.sh` runs the
P1279 canary and is refused if it fails.

## Actual Behavior

Exit 0 with a WARNING line (`git-ops.sh:2038-2041`) under a comment claiming it "CANNOT FIRE TODAY".

## Affected Files

- `scripts/git-ops.sh` — `commit_staged_exact` (~1215), `cmd_commit_to_main` (~2020), publish-spec,
  branch-born seed and spec-close callers.
- `scripts/pre-commit-checks.sh` — §4.7 git-ops canary block.

## Severity

**High** — the shared checkout's only locked commit path silently commits a co-tenant's files.

## Fix Approach

Re-apply the three P1279 commits' `git-ops.sh` hunks onto current `main` (3-way), keeping every
P1268 change. Wire `test-p1279-commit-to-main-index-race.sh` into the §4.7 block and the
`GIT_OPS_STAGED` trigger list. Rules text in `git.md` becomes true again, so it needs no edit.

## Acceptance Criteria

- [x] `bash scripts/test-p1279-commit-to-main-index-race.sh` → 7 passed, 0 failed. — branch run 2026-09-22: "P1279 canary: 7 passed, 0 failed" (main: 5/2).
- [x] Control: the same canary against `git show 4179d97fb:scripts/git-ops.sh` → fails `race` and `rc3`. — `P1279_GIT_OPS_SRC=<that copy>`: "5 passed, 2 failed", both named.
- [x] The P1268 canary (`scripts/test-git-ops-adopt.sh`) and the P787/P788 git-ops canaries still pass. — adopt 42/0; extensions and ship canaries exit 0.
- [x] `pre-commit-checks.sh` runs the P1279 canary when `scripts/git-ops.sh` is staged — shown by a staged pre-P1279 copy being refused. — running the branch's `pre-commit-checks.sh` with the 4179d97fb copy staged: exit 1, "commit-to-main recorded-set canary (P1279)… ✗, 5 passed, 2 failed".

## Known limits (review findings, recorded rather than fixed here)

- The canary tests the WORKING-TREE `git-ops.sh`, not the staged blob, so a stale copy staged
  over a fixed working tree would pass (Codex review). This is true of every pre-commit canary in
  this repo, not specific to P1279; the AC above was proven with both copies stale.
- The hook always runs MAIN's `pre-commit-checks.sh`, so this wiring protects worktree commits
  only once shipped.
- Also on this branch: `test-p1211-git-ops-schema-gate.sh` scrubs the git env at its top. Its first
  run from this worktree's pre-commit set `core.bare=true` on the shared repo and recursed (P1346).
  Decoy proof: the old copy flips `core.bare`, the new one does not (22/0).
