---
status: qa
type: task
rank: 91
workstream: infrastructure
created_date: '2026-09-09'
tags: [tooling, scripts, pre-commit, gates, e2e]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: process-debt
---

# P1284: Five script defects from the task inbox — rank ratchet, goal-gate ceiling, skills-sync scope, deploy-manifest fix command, e2e zombie reaper

## Problem

Five entries in `docs/process-learnings.md` are script-only defects. Each has a written falsifier,
each has been observed more than once, and none is blocked on a founder decision. They are batched
here because they share one property: a tool reports a state that is not the state the operator is
in, and the operator acts on the report.

The inbox entries are the authoritative framing. Verbatim, from `docs/process-learnings.md`:

> Founder framing, verbatim (2026-09-01): *"`./scripts/next-rank.sh week` returned `1000062` for
> P1212 while hand-ordered specs in the same column sit at 1–11, so the new card lands at the bottom
> regardless of priority. The script's own header describes exactly this failure and says it was
> fixed by scoping per-column — it still scans open specs sitting in the 1,000,000 band, so `max+1`
> reproduces the ratchet."*

> Founder framing, verbatim (2026-08-24): *"The two ways to make it green are the two the gate
> exists to prevent (delete a failing round, or edit a FAIL to PASS), so the honest outcome is a card
> parked at `qa` — and that will now recur for every long-review feature, silently, since nothing
> surfaces "shipped but never closed" except someone noticing the slot later."*

> Founder framing, verbatim (2026-08-27): *"On a shared main checkout with many concurrent sessions,
> any co-tenant's in-progress, unstaged edit anywhere in that tree fails every session's unrelated
> commit ... the lock serializes committers, not editors — a concurrent Claude session's Edit-tool
> write takes no git lock at all, so retrying under the lock does not help."*

> Founder framing, verbatim (2026-08-28): *"This has now misled at least four times ... with
> multiple decisions.md entries prescribing a manual two-command check that nobody runs, because the
> tool sounds authoritative and the manual check is not where the decision happens."*

> Founder framing, verbatim (2026-08-14): *"Identical p683 runs took 4.5m then 57.5m, and a test that
> had passed twice failed in the slow run — 8 vite servers (oldest 11 days) and 59 playwright
> processes (oldest 2 days) were alive at once. `pre-commit-checks.sh` has a "zombie Vite dev
> servers" check that reported clean during this, so it is not detecting the condition."*

What each defect is, mechanically:

1. **`next-rank.sh` still ratchets.** The script was already scoped per column, but each column
   still contains legacy ranks in the 1,000,000 band left by the old global `max+1`. `max+1` over
   that column therefore reproduces the ratchet: measured tonight, `./scripts/next-rank.sh week`
   returns `1000082` while the hand-ordered specs in the same column sit at 1-90.

2. **goal-gate CHECK 5 punishes a correct workflow.** Two halves. (a) A round records screenshot
   hashes; a later round finds a real defect, the fix regenerates the renders, and every earlier
   round is then reported as a hash mismatch. (b) The round ceiling was raised 5 -> 7 on 2026-08-29,
   and that raise silently killed the canary that proves the ceiling fires: `scripts/test-goal-gate.sh`
   case 5e builds 6 rounds and expects a refusal, so it has been RED since the raise. Measured
   tonight on `main`: `test-goal-gate: 30 passed, 1 FAILED`.

3. **`sync-agent-skills.sh --check` judges the whole working tree.** It `cmp`s every source under
   `.claude/commands/slava/**` against `.agents/skills/` in the working tree — not the index, not
   the commit.

4. **`check-deploy-manifest.sh --env prod` prints the wrong fix command.** `--env prod` reads the
   manifest from `origin/main`. An unpushed stamp therefore reads as `MIGRATION_MISSING` /
   `FUNCTION_STALE`, and the script tells the operator to migrate prod or redeploy the function. For
   functions the printed fix loops forever, because `deploy-functions.sh` stamps only the local
   manifest.

5. **Zombie vite/playwright processes are not detected.** Check 19 of `pre-commit-checks.sh` only
   flags a vite whose cwd was deleted, never an orphan whose cwd still exists, never a playwright
   process at all, and its port regex `5[1-7]00` matches only round hundreds so the default 5173 is
   outside it.

## Appetite

One night, one batch, one commit per item.

## Solution

1. **next-rank.sh** — take `max+1` over the column's *dense* ranks only, ignoring the legacy
   1,000,000 band that the script's own header documents as the artifact of the old global scheme.
   Fall back to the legacy maximum when a column has no dense rank at all, so the value can never
   collide with an existing card.

2. **goal-gate CHECK 5** —
   (a) Supersession: a round's recorded hash may differ from the working tree **iff a later round
   records the same path**. The *last* round recording a path must still match exactly. This makes
   regeneration-after-a-real-defect legal while keeping all three forgeries red: garbage written
   over a render that no later round re-judged still fails.
   (b) Ceiling: the anti-re-roll property moves from a fixed round count to a pixel test — a round
   that follows a FAIL must judge at least one render whose hash differs from the preceding round's
   record. Spinning rounds on unchanged pixels is refused directly, so the count bound only has to
   catch pathology and is raised to 20. Both changes get failure-path canaries, and 5e is repaired.

3. **sync-agent-skills.sh** — add `--staged-only`, used by `pre-commit-checks.sh`. In check mode it
   intersects the drift report with `git diff --cached --name-only`: a drift line survives only if
   its source path or its projection path is in the commit. Hard fails (D4/D8/D9) stay global —
   they are properties of the source of truth, not of one commit. Without the flag behaviour is
   byte-identical to today, so CI and manual runs are unchanged.

4. **check-deploy-manifest.sh** — when `--env prod`, also load the working-tree manifest and
   compare. An entry present locally but absent or stale on `origin/main` is
   `MIGRATION_UNPUSHED_STAMP` / `FUNCTION_UNPUSHED_STAMP`, and the fix block names committing and
   pushing main, not migrating prod or redeploying the function.

5. **`scripts/reap-e2e-zombies.sh`** — a new reaper, dry-run by default, plus a fix to pre-commit
   check 19. Kill criterion is deliberately narrow and documented in the script: a process is reaped
   only when it is a vite or playwright *test* process, its parent is gone (`ppid == 1`), and it is
   older than the age threshold; or when it is a vite server whose cwd no longer exists. Nothing
   owned by a live parent is ever touched, which specifically protects the `playwright-mcp`
   processes that live Claude sessions own and the dev servers other worktrees are running. No
   `pkill -f` anywhere.

## Risks / Non-Goals

- **Risk: the supersession rule weakens CHECK 5.** Mitigated by keeping the last-round exact-match
  requirement and by driving every existing forgery mutation to a non-zero exit.
- **Risk: `--staged-only` hides real drift.** By construction it hides drift the commit does not
  contain. That is the intent (same class as P1273). A full `--check` still exists and CI keeps it.
- **Risk: the reaper kills something alive.** Mitigated by dry-run default, the `ppid == 1`
  criterion, an age threshold, and a fixture-driven classifier test that never signals a real
  process.
- **Non-goal:** renumbering the existing legacy-band ranks. That rewrites ~25 spec files across
  live worktrees and is the founder's call.
- **Non-goal:** the `git-ops.sh ship` tracked-and-dirty preflight (same mechanism as item 3, its own
  inbox entry, not in this batch).

## Done-When

- [x] 1. `next-rank.sh` returns a rank in the hand-ordered scale for a populated column, with a
  regression test that fails on the pre-fix script.
  Evidence: `next-rank.sh week` 1000082 before, 92 after; `scripts/test-next-rank.sh` 2 passed /
  5 FAILED against the pre-fix script (exit 1), 7 passed / 0 failed after (exit 0). Commit
  `552fc0e60`.
- [x] 2. goal-gate CHECK 5 accepts a superseded earlier round, still refuses an unjudged edit, and
  refuses a re-roll on unchanged renders; `test-goal-gate.sh` fully green including a repaired 5e,
  with the non-zero exit of each new failure path pasted in the report.
  Evidence: canary was 30 passed / 1 FAILED on main (5e dead since the 5 -> 7 raise), now 33 / 0.
  Failure paths 5a, 5e, 5g each exit 1; control 5h exits 0. Five real specs re-run (gate 7c).
  Commit `1dbeeddc8`.
- [x] 3. `sync-agent-skills.sh --check --staged-only` ignores an unstaged co-tenant edit and still
  catches a staged one; `sync-agent-skills.test.sh` green, and the script's documented workflows
  re-run through the new flag (epistemic gate 7c).
  Evidence: suite 59 passed / 0 failed with new cases F1-F4; on the real tree `--check` exit 0 and
  `--check --staged-only` exit 0, both `125 skills in sync, 0 collisions, 0 drift`. Commit
  `078576134`.
- [x] 4. `check-deploy-manifest.sh --env prod` reports `MIGRATION_UNPUSHED_STAMP` /
  `FUNCTION_UNPUSHED_STAMP` and names pushing main, proven by both falsifiers from the inbox entry
  in a hermetic fixture.
  Evidence: `scripts/test-check-deploy-manifest.sh` 4 passed / 3 FAILED against the pre-fix script
  (exit 1), 7 passed / 0 failed after (exit 0), including four controls. Live manifest: `--env prod`
  exit 0, `--env test` exit 1 with its eight pre-existing FUNCTION_STALE entries. Commit
  `f319d370a`.
- [x] 5. `scripts/reap-e2e-zombies.sh` exists with a documented kill criterion, pre-commit check 19
  detects orphaned vite and browser-test processes, and a fixture test proves the classifier spares
  live-parent processes and selects orphans.
  Evidence: `scripts/test-reap-e2e-zombies.sh` 19 passed / 0 failed over an 11-row fixture process
  table, 4 reapable and 7 spared. Check 19 driven to its warning path through the fixture (pids
  9001, 9007); against the real table 3 vite seen, 0 reapable, exit 0. Commit `8b7dc55da`
  (the sha recorded here was `e3477fc7a`, an earlier copy of the same change that is not on
  this branch — corrected during code review).

- [x] 6. Independent code review of all five fixes, with every real finding either closed by a
  canary-backed fix or recorded as an accepted residual.
  Evidence: `~/.agents/bin/codex-review` returned UNSAFE with 9 findings; each was re-run by
  command before being acted on (epistemic gate 9). Six were reproduced and fixed, each with a
  canary proven RED against the pre-review code and GREEN after: next-rank returned `1000000` for
  a column holding 999999 and 1000000, colliding with an existing card; goal-gate ordered rounds
  lexicographically so a forged `review-round-10.md` read as superseded by round 2; the re-roll
  rule compared complete path sets so adding one unrelated render laundered a re-roll;
  `git diff --cached --name-only` C-quotes non-ASCII paths, so a staged source under an accented
  directory fell out of `--staged-only` scope and real drift passed; the reaper classified
  `/bin/sh -c backup job vite marker` as a reapable vite by substring; and the kill path signalled
  by pid with no re-check, so a recycled pid would have been TERMed. Suites after: next-rank 8/0,
  goal-gate 35/0, deploy-manifest 7/0, reap 22/0, sync-agent-skills 63/0. Three findings are
  recorded as accepted residuals in the review artifact (deleting a FAIL round is undetectable and
  pre-existing; `cmp` reads the working tree not the staged blobs, also pre-existing; a hand-forged
  local manifest redirects the deploy-manifest remedy, which is inherent to the fix).

## Pre-deploy Checklist

- [x] N/A — no migrations, no edge functions, no prod infra touched. Shell scripts only.
