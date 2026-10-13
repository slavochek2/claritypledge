---
status: week
type: task
rank: 35
workstream: infrastructure
created_date: '2026-10-13'
tags: [goal-gate, git-safety, crash-safety, gates]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
---

# P1479: goal-gate CHECK 3 soft-resets the branch to the merge-base, and a killed run leaves the branch looking like it lost every commit

## Problem

Filed cold from an agent-written task-inbox note. There was no founder conversation to quote.

**Situation:** `scripts/goal-gate.sh` CHECK 3 (`:238-277`) runs `pre-commit-checks.sh` over the
whole branch. To do that, it `git reset --soft "$MB"` (merge-base) inside the worktree, so the branch's
changes appear staged, and then restores with `git reset --soft "$ORIG_HEAD"` and
`git read-tree "$SAVED_TREE"`. `ORIG_HEAD` and `SAVED_TREE` are **shell variables**, and the restore
runs from an `EXIT` trap (`:260`).

**Complication:** `SIGKILL` (and a hard terminal close, OOM kill, or a harness timeout that kills
the process group) does not run an `EXIT` trap. A run killed between `:263` and `:275` leaves the
**branch ref at the merge-base**: `git log main..HEAD` shows 0 commits, and the branch's content sits
as uncommitted changes. A later gate run then records *that* merge-base as its `ORIG_HEAD` and
"restores" to it, which makes the loss look deliberate.

Observed 2026-09-09 in the P1284 review. `feature/p1284-script-inbox-batch` showed 0 commits ahead of
`main`, with seven commits' content uncommitted. `git reflog` showed the ref bouncing between the
merge-base and the real tip across repeated gate runs. Nothing was lost; it was repaired with
`git reset <absolute-sha>`. The orchestrator spent tool calls ruling out data loss.

**Question:** How does CHECK 3 keep giving pre-commit a non-empty index without ever leaving a branch
ref somewhere a killed run cannot recover from?

## Appetite

- **Blast radius:** every `/goal` loop and every CI `goal-gate` run (`.github/workflows/goal-gate.yml`,
  which runs `origin/main`'s copy). A wrong fix either strands branches again or changes what CHECK 3
  measures.
- **Reversibility:** `git revert` of the script.
- **Decision density:** zero founder decisions. The approach choice below is an engineering call.

## Invariants

- **CHECK 3 still refuses to run outside a worktree** (`:249-251`; the main checkout's index and HEAD
  are shared, per `.claude/rules/git.md`).
- **CHECK 3 still fails on an empty diff vs merge-base** (`:266-268`; the empty-index vacuous pass is
  the defect this check exists to kill).
- **What pre-commit sees must not change.** `pre-commit-checks.sh` reads the current branch name at
  `:35`, `:192`, `:1335`, `:1841` and `:2367` (grep 2026-10-13). An approach that detaches HEAD, or
  runs in a different worktree, changes those reads and therefore the verdicts. That is only
  acceptable if proven verdict-identical (gate 7c).
- **Never resolve a restore target relatively** (`HEAD~1`, `ORIG_HEAD` as git's own ref, `@{1}`).
  Always use an absolute sha recorded before the move.

## Solution

Two layers. The first is required; the second is preferred where it can be shown not to change
pre-commit's verdicts.

1. **Crash-safe restore (required).** Before the soft reset, write the branch name, the pre-reset sha
   and the saved index tree to a durable state file. Keep it in the worktree's git dir (e.g.
   `$(git rev-parse --git-dir)/goal-gate-check3.state`), not in a shell variable. Delete the file only
   after a successful restore. At the **start** of every invocation, if that file exists, restore from
   it first (`git reset --soft <recorded-sha>` with the recorded branch checked out, then `git
   read-tree <recorded-tree>`), say so loudly, and only then proceed. This also kills the second
   failure mode: a later run can never record the merge-base as its "original" head, because it
   restores the recorded tip first.
2. **No ref move (preferred, only with proof).** If the implementer can produce the same non-empty
   index without moving `refs/heads/<branch>` (for example, by moving a detached HEAD, or by using a
   temporary index via `GIT_INDEX_FILE`) **and** show every existing `scripts/test-goal-gate.sh` CHECK 3
   case plus a real-branch run give identical verdicts, use it. Keep layer 1 for any residual HEAD
   move.

## Alternatives Considered

- **A trap on more signals (`INT TERM HUP`).** Necessary but not sufficient: `SIGKILL` cannot be
  trapped, and the observed incident is consistent with a hard kill. Add it alongside layer 1, not
  instead of it.
- **Run pre-commit against `git diff <merge-base>...HEAD` directly.** `pre-commit-checks.sh` is
  written against the staged index (`git diff --cached`), and rewriting its input contract is out of
  scope.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The self-heal restores a stale state file that belongs to a different branch | MITIGATE | The state file records the branch name. Self-heal only when the current worktree is on that branch; otherwise refuse with a message naming both |
| The self-heal runs while another gate run is mid-CHECK-3 in the same worktree | MITIGATE | Take a lock (e.g. `mkdir`-based) for the duration of CHECK 3, and refuse a concurrent run |
| The no-ref-move variant silently changes a branch-name-dependent pre-commit check | MITIGATE | Layer 2 is gated on the verdict-identity proof above |

**Non-Goals**
- Do NOT change `pre-commit-checks.sh`.
- Do NOT change CHECKs 1, 2 or 4-7, or the CI workflow.
- Do NOT add recovery for branches stranded before this lands. `git reflog <branch>` remains the manual
  path.

## Rollback Strategy

Revert the script commit. The state file is inert without the script that reads it. A leftover file
can be deleted by hand once `git reflog` confirms the branch tip.

## Done-When

- [ ] New case in `scripts/test-goal-gate.sh`: the fixture's pre-commit stub sleeps, the gate is
      started, and `kill -9` is sent to the gate's process group during CHECK 3. Afterwards
      `git rev-parse refs/heads/<fixture-branch>` **equals the pre-run tip**, either immediately
      (layer 2) or after the next gate invocation self-heals (layer 1). This case was seen to fail on
      the current script (gate 7: paste both runs).
- [ ] Same case: after the killed run plus one normal run, the fixture's working-tree files are
      byte-identical to before (checksums), and `git log main..<branch>` shows the original commit
      count.
- [ ] A normal (un-killed) run leaves no state file behind (asserted in the test).
- [ ] All existing `scripts/test-goal-gate.sh` cases pass with unchanged verdicts, specifically 3a
      (empty branch), 3b (pre-commit red) and 3c (refuses outside a worktree).
- [ ] If layer 2 is used: a pasted before/after of a real worktree branch's CHECK 3 output showing the
      same pre-commit verdict.

## Related

- P1284: the review where the stranded ref was observed.
- P1175 (open): shell canaries have no automated runner. `test-goal-gate.sh` is one, and CI runs it
  only via `goal-gate.yml`.
- `.claude/rules/git.md`: never `HEAD~1` on a shared ref, and resolve absolute shas.

Promoted from the task inbox, 2026-10-13.
