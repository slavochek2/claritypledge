---
status: week
type: bug
rank: 1000924
severity: medium
workstream: tooling
date_reported: '2026-06-10'
created_date: '2026-06-10'
tags: [test-flake, git-ops, pre-commit, sigterm]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P924: `test-git-ops-ship.sh` canary flakes ~40-50% at the M→N transition (SIGTERM `index.lock` race)

## Summary

`scripts/test-git-ops-ship.sh` aborts ~40-50% of runs immediately after test **M** (SIGTERM mid-cherry-pick + `--resume`, P788): the next test's setup (`scratch_feature p103` → `git checkout -q -b`, or its subsequent `git add`/`git commit`) fails with `fatal: Unable to create '.../.git/index.lock': File exists` (rc=128), or the suite exits rc=1 right after the `PASS: M` line. When the suite completes, every test passes — the failure is purely this race.

## Root Cause

**Under investigation — not confirmed.** Observed: a stale `.git/index.lock` exists in the scratch repo at the M→N boundary, after test M has already passed (its `--resume` ship completed and cleaned up).

Hypotheses tried and **not** confirmed:
- **(a) Orphaned `git cherry-pick` child of the SIGTERM'd ship.** `kill -TERM "$SHIP_PID"` (~line 301) kills the bash shell; `wait` returns when it dies, but a reparented git child can outlive it and re-create `index.lock`. **Counter-evidence:** the test polls for the *first* landed_sha before SIGTERM, so SIGTERM lands during the inter-pick `sleep` (`SHIP_DEBUG_SLEEP_SECS=1`), when no cherry-pick is in progress — which contradicts a git-child orphan.
- **(b) The foreground `--resume` ship (~line 321) leaving a lock.** It completes normally, so this is unlikely.

The actual origin of the post-M `index.lock` is **not pinned down**. `/reproduce` should neuter the `EXIT`-trap `rm -rf "$SCRATCH"` (line ~59) so the scratch repo survives an abort, then reproduce and inspect live `git` processes (`ps`, `lsof` on the scratch `.git`) and the `index.lock` owner at the moment of collision.

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

- [ ] `bash scripts/test-git-ops-ship.sh` passes 20/20 consecutive runs on macOS bash 3.2 (deterministic; no M→N `index.lock` aborts).
- [ ] Root cause of the post-M stale `index.lock` is identified and documented (which process creates it, when).
- [ ] The fix is in the test harness (test M / process reaping), not in `scripts/git-ops.sh` product code.
- [ ] No regression: all existing invariants (K-Y, Z2, AA-GG) still pass.
- [ ] The pre-commit canary (`scripts/pre-commit-checks.sh`) no longer flakily aborts on staged git-ops changes.
