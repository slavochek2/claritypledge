---
status: all-done
type: bug
rank: 107
severity: medium
workstream: infrastructure
date_reported: '2026-11-05'
created_date: '2026-11-05'
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [git-ops, ship, journal]
disclosure: public
pipeline_ran: [create-bug, reproduce, fix]
date_resolved: '2026-11-05'
root_cause: "cmd_ship wrote the journal before the main lock and the lock timeout exited without cleanup"
resolution: "remove the fresh journal on timeout only when this run wrote it and nothing was picked; warn in the existing-journal hint"
reproduce_artifact:
  test_file: scripts/test-git-ops-ship.sh
  root_cause: "cmd_ship writes the journal (ship_init_journal, git-ops.sh ~L4483) for a spec on main before the pre-pick lock acquire (~L4713); acquire_main_lock timeout does a bare exit 1 with no journal cleanup"
  confidence: high
  surfaces_in_scope: [ship-main-spec-route]
  surfaces_deferred: []
  reproduced_at: 2026-11-05
  fix_shape: decided
completed_at: 2026-11-05
---

# P1637: A ship that times out on the main lock leaves its journal, so the retry stops

## Summary

During the P1630 ship, `git-ops.sh ship` timed out on `main.lock` against a live co-tenant; the retry then failed with "existing journal" and needed `--resume`.

## Root Cause

Confirmed by reproduction (2026-11-05). For a spec on main, `cmd_ship` calls `ship_init_journal` (`scripts/git-ops.sh` ~L4483) before the pre-pick `acquire_main_lock` (~L4713). When the lock times out, `acquire_main_lock` returns 1 and the caller does a bare `exit 1`, so the fresh journal is never removed. Other refusals on that path (e.g. L4600-4670) remove a fresh journal with `(( journal_exists == 0 )) && rm -f`. Branch-born specs defer the journal until after the lock and are unaffected.

**Evidence:** scenario P of `scripts/test-git-ops-ship.sh` (live `main.lock`, `GIT_OPS_MAIN_LOCK_TIMEOUT=2`) already produces the timeout; extended with a journal-absent assertion it fails: `FAIL: P2: lock timeout left journal .../.ship-journal/p105.json behind (nothing was picked)`. The canary is NOT committed: a red scenario in that file would fail the pre-commit gate that runs the whole suite, so it rides the fix commit.

## Invariants

- A journal whose run has picked a commit is never removed automatically: deleting it can replay commits.
- `main.lock` is never force-released.

## Reproduction Steps

1. Hold `main.lock` from a live process, with a short `GIT_OPS_MAIN_LOCK_TIMEOUT`.
2. Run `git-ops.sh ship pN` for a spec on main; observe the timeout.
3. Release the lock and run it again; observe "existing journal".

**Reproduction rate:** expected 100% on this shape; to be confirmed by `/reproduce`.

## Expected Behavior

After a timeout with nothing picked, a plain retry of the same command works, and the cleanup report shows no stranded ship.

## Actual Behavior

The retry stops, and the message offers "delete the journal" with no warning.

## Affected Files

- `scripts/git-ops.sh` — lock timeout in the ship path, journal write, and the "existing journal" message
- `scripts/test-git-ops-ship.sh` — canary

## Severity

**Medium** — recoverable, but a shared-checkout retry is steered to the wrong command and the hint can be unsafe.

## Fix Approach

On lock timeout, remove the fresh journal if `ship_journal_never_picked` holds; warn in the hint. Commit through `commit-to-main`, because the self-modification guard refuses a branch touching `git-ops.sh` (per the critic, to verify). See docs/decisions.md 2026-11-05 "A ship that times out on the main lock should not leave its journal".

## Acceptance Criteria

- [x] After a lock timeout with nothing picked, no journal remains and a plain retry ships (canary P2; holds when main did not move, otherwise the journal is kept and `--resume` ships it, canary P4)
- [x] A journal with a picked commit survives a timeout (canary P3 for an existing journal, P4 and P5 for a fresh run that cannot prove it never picked)
- [x] The "existing journal" message warns that deleting can replay commits
- [x] The new canary in `scripts/test-git-ops-ship.sh` fails without the fix (P2 fails against the unfixed script: `lock timeout left a journal behind`)

## Resolution

**Fixed:** 2026-11-05. `cmd_ship` lock-timeout branch removes this run's own unpicked journal, keeps any other with an accurate message, and the "existing journal" hint warns about replay. Canary scenarios P2 to P5 in `scripts/test-git-ops-ship.sh`; full ship suite 82 pass, 0 fail.

**Known limitations (from review):** the pid ownership check proves the last writer, not the user, so a same-P run holding the lock 120s without a pick could lose its journal and need a re-run, with no replay. When the lock holder advances main, a fresh run's journal is kept and `--resume` recovers it, so the plain retry works only when the holder was idle.
