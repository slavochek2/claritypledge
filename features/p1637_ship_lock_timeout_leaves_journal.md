---
status: week
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
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1637: A ship that times out on the main lock leaves its journal, so the retry stops

## Summary

During the P1630 ship, `git-ops.sh ship` timed out on `main.lock` against a live co-tenant; the retry then failed with "existing journal" and needed `--resume`.

## Root Cause

From reading the code, not yet reproduced: for a spec on main the journal is written before the lock is taken, and the lock timeout exits with no cleanup. Other refusals on that path do remove a fresh journal. Branch-born specs defer the journal and are unaffected.

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

- [ ] After a lock timeout with nothing picked, no journal remains and a plain retry ships
- [ ] A journal with a picked commit survives a timeout
- [ ] The "existing journal" message warns that deleting can replay commits
- [ ] The new canary in `scripts/test-git-ops-ship.sh` fails without the fix
