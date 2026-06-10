---
status: all-done
type: bug
rank: 1000924
severity: medium
workstream: tooling
date_reported: '2026-06-10'
created_date: '2026-06-10'
tags: [test-flake, git-ops, pre-commit, sigterm]
pipeline_ran: [create-bug, reproduce, fix, ship]
reproduce_artifact:
  test_file: scripts/test-p924-sigterm-orphan-reap.sh
  root_cause: "Test M launches ship via `( cd && bash git-ops.sh ship p102 ) & SHIP_PID=$!` then `kill -TERM $SHIP_PID`. On bash 3.2 (macOS /bin/bash) the subshell is NOT exec-optimized, so `bash git-ops.sh` is a CHILD of the subshell wrapper. `kill $SHIP_PID` reaps only the wrapper; the ship process is reparented (orphaned) and keeps running its remaining cherry-picks + Phase-2 spec-close (~3s of git add/commit), re-creating .git/index.lock and racing the next test's `git checkout -b`/`add`/`commit` at the M->N boundary. NOT a git cherry-pick child (spec hypotheses a/b) — both assumed SHIP_PID == the git-ops.sh process; it is the subshell wrapper."
  confidence: high
  surfaces_in_scope: [test-git-ops-ship.sh-M-block]
  surfaces_deferred: []
  reproduced_at: '2026-06-10'
completed_at: 2026-06-10
---

# P924: `test-git-ops-ship.sh` canary flakes ~40-50% at the M→N transition (SIGTERM `index.lock` race)

## Summary

`scripts/test-git-ops-ship.sh` aborts ~40-50% of runs immediately after test **M** (SIGTERM mid-cherry-pick + `--resume`, P788): the next test's setup (`scratch_feature p103` → `git checkout -q -b`, or its subsequent `git add`/`git commit`) fails with `fatal: Unable to create '.../.git/index.lock': File exists` (rc=128), or the suite exits rc=1 right after the `PASS: M` line. When the suite completes, every test passes — the failure is purely this race.

## Root Cause

**CONFIRMED (P924 /reproduce, 2026-06-10) — high confidence.** The post-M `index.lock` is created by an **orphaned `bash git-ops.sh ship p102` process**, not a git cherry-pick child.

Test M launches the ship as:
```bash
( cd "$SCRATCH/main" && SHIP_DEBUG_SLEEP_SECS=1 bash "$GIT_OPS" ship p102 ) >…/m-ship.log 2>&1 &
SHIP_PID=$!
```
On **bash 3.2.57** (macOS `/bin/bash`, the harness shell) the subshell `( … )` is **not exec-optimized**, so `bash git-ops.sh` runs as a **child** of the subshell wrapper. `SHIP_PID` is the *wrapper*, not the ship. `kill -TERM "$SHIP_PID"` (line 301) reaps only the wrapper; `wait` returns immediately, but the ship is **reparented (orphaned)** and keeps running its remaining cherry-picks + Phase-2 spec-close (`git add`/`git commit`) for ~3s (3 remaining picks × `SHIP_DEBUG_SLEEP_SECS=1`). That orphan re-creates `.git/index.lock` and collides with the next test's `git checkout -b` / `add` / `commit` at the M→N boundary.

This explains both failed downstream fixes (recorded under Fix Approach): a single `rm -f index.lock` is re-created by the still-alive orphan; the orphan collides with `add`/`commit`, not just checkout — because it is a *whole ship process* mid-sequence, not one transient git child.

**Why the original hypotheses missed it:** both (a) and (b) assumed `SHIP_PID == the git-ops.sh process`. It is the subshell wrapper. (zsh *does* exec-optimize the same construct — SHIP_PID would equal the ship — which is why the flake is specific to the bash-3.2 harness.)

### Evidence
- **Standalone bash-3.2 test:** `( cd && bash child.sh ) & ; kill $!` left `bash child.sh` reparented and running (wrote `STILL-ALIVE` markers 1–2s after the kill). Same construct under zsh was exec-optimized and reaped cleanly.
- **Real harness, instrumented:** after the M-block `kill+wait`, `pgrep` found `bash …/scripts/git-ops.sh ship p102` (e.g. PID 11692) alive. (The suite still passed 12/12 on this idle machine — the orphan finished before test N's checkout — but it is present every run; on a loaded machine the collision fires, matching the reported ~40–50%.)
- **Canary `scripts/test-p924-sigterm-orphan-reap.sh`:** replicates the M-block launch+interrupt verbatim and asserts no orphan survives. FAILS now (exit 1, orphan present); PASSES (exit 0) under both candidate fixes — process-group kill *and* poll-until-dead. Poll-until-dead exits cleanly; the `set -m` + `kill -- -$PID` group-kill variant carried job-control exit-status noise (exit 1 despite the assertion passing) — `/fix` should prefer poll-until-dead, or handle the group-kill exit status explicitly.

## Invariants

- The fix belongs at the **source** (test M — reliably reap the orphaned process/process group before proceeding), NOT in downstream lock-clearing. Two downstream attempts failed (see Fix Approach) — do not repeat them.
- This is a **test-harness** bug, NOT a product bug in `scripts/git-ops.sh`: production `ship` is never SIGTERM'd by a harness. Do not "fix" `git-ops.sh` ship for this.

## Reproduction Steps

1. On macOS, bash 3.2.57, from the repo root: `bash scripts/test-git-ops-ship.sh`
2. Repeat 5-8 times (it is intermittent).
3. Observe: ~40-50% of runs abort right after `PASS: M: SIGTERM mid-sequence + --resume converges to final state`, with either rc=128 (`fatal: Unable to create '.../.git/index.lock': File exists` at `git checkout -q -b feature/p103-demo`) or rc=1.

**Reproduction rate:** intermittent (~3/6 to 2/5 on this machine).

## Expected Behavior

The canary is deterministic: it either passes fully (`PASS: all git-ops.sh ship invariants ... hold`) or fails on a real invariant. No timing-dependent aborts at the M→N boundary.

## Actual Behavior

~40-50% of runs abort at the M→N transition on a stale `index.lock`, before reaching the later tests. Because this canary runs in the pre-commit hook (`scripts/pre-commit-checks.sh:222`, fires when `scripts/git-ops.sh` or the test files are staged), a flaky gate trains operators/agents to retry-commit-until-green — exactly the masking the Test Integrity rule (`.claude/rules/tests.md`) forbids.

## Affected Files

- `scripts/test-git-ops-ship.sh` — test M (~lines 271-340: launch/poll/SIGTERM/`--resume`); `scratch_feature` (~line 111, the colliding `git checkout -q -b`).
- `scripts/pre-commit-checks.sh:222` — invokes this canary; the consumer of the flakiness.

## Severity

**Medium** — degrades the pre-commit canary's reliability (~40% false abort) and erodes trust in the gate; no product/runtime impact and a workaround exists (re-run). Prior art: `c6d997dd` "fix(git-ops): … fix Z2 co-locate flake" hardened a *different* flake in this same canary — the M-test SIGTERM race was not addressed there.

## Fix Approach

Investigate at the source (test M). Likely: reliably reap the orphaned process **group** after the SIGTERM (e.g. launch the ship in its own process group and `kill` the group; or poll until no `git` process is operating on the scratch repo AND `index.lock` is stably absent) before the M block returns. Confirm the actual orphan identity first via `/reproduce` (neuter the EXIT-trap `rm` so the scratch repo survives an abort).

**Failed attempts — do NOT repeat (both reverted):**
1. Settle-wait then `rm -f .git/index.lock` in `scratch_feature` before checkout — the orphan re-creates the lock after the `rm`.
2. Retry-the-checkout loop clearing the lock each attempt — the orphan also collides with the subsequent `git add`/`git commit`, not just the checkout.

## Acceptance Criteria

- [x] `bash scripts/test-git-ops-ship.sh` passes 20/20 consecutive runs on macOS bash 3.2 (deterministic; no M→N `index.lock` aborts). — 20/20 under concurrent load, all ending "all git-ops.sh ship invariants ... hold".
- [x] Root cause of the post-M stale `index.lock` is identified and documented (which process creates it, when). — orphaned `bash git-ops.sh ship p102` child (bash-3.2 non-exec-optimized subshell); documented in `scripts/lib/ship-reap.sh` header.
- [x] The fix is in the test harness (test M / process reaping), not in `scripts/git-ops.sh` product code. — only `test-git-ops-ship.sh`, `test-p924-*.sh`, new `lib/ship-reap.sh`, `pre-commit-checks.sh`; `git-ops.sh` untouched.
- [x] No regression: all existing invariants (K-Y, Z2, AA-GG) still pass. — every one of the 20 runs printed the full-pass line.
- [x] The pre-commit canary (`scripts/pre-commit-checks.sh`) no longer flakily aborts on staged git-ops changes. — full pre-commit ran green; reap is poll-until-dead deterministic.
