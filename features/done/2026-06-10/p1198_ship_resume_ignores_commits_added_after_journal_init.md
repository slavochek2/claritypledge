---
status: all-done
type: task
disclosure: public
rank: 99
workstream: infra
created_date: '2026-08-31'
tags: [ship, git-ops, tooling]
drafted_by: sonnet
exec_model: sonnet
exec_effort: medium
driver: anomaly
pipeline_ran: [dev, ship]
completed_at: 2026-10-14
---

# P1198: `git-ops.sh ship --resume` should re-diff the branch for commits added mid-ship

## Problem

`ship_init_journal` (`scripts/git-ops.sh:1399`) builds the cherry-pick journal once, from
`git log main..branch` at the moment `/ship` first runs, and writes it to
`.claude/worktrees/.ship-journal/<pn>.json`. `--resume` only replays that frozen list — it never
re-diffs the branch for `source_sha`s added after the journal was created.

This is a real gap, not hypothetical: P1179 hit it directly (2026-08-31). Ship had already
cherry-picked 8 commits and reached the spec-close step when `goal-gate.sh` CHECK 5 failed (a
blind-reviewer requirement, unrelated to ship itself). Fixing CHECK 5 meant capturing screenshots
and running review rounds, which produced a 9th commit on the feature branch. `--resume` did not
pick it up — spec-close kept failing with "review-round-*.md is empty" until the commit was
cherry-picked by hand and the journal's `commits` array hand-patched with a matching entry, bypassing
the journal's own atomic-write helpers (`ship_mark_landed`).

## Appetite

**Blast radius: low-medium.** Touches `ship_init_journal` and the `--resume` entry path in
`scripts/git-ops.sh`, a shared tool every `/ship` invocation runs.

**Reversibility: high.** Pure tooling change; a bad version can be reverted without touching any
shipped commit history.

**Decision density: low.** The fix shape is clear (re-diff, append, preserve order) — see Solution.

## Solution

**Refuse-on-drift (founder decision 2026-10-14).** A ship lands only the commits its journal planned.
`ship_branch_drift` compares `main..branch` with the journal; any commit on the branch that is not in
the journal (`new`), or a journaled unlanded commit no longer on the branch (`gone`, a rewrite), stops
the ship with exit 1, nothing picked by that step, branch and journal kept, the commits named, and the
next step printed: nothing landed yet -> delete the journal and re-run a fresh `ship pN`; something
landed -> move the new work to its own branch, point the branch back at its last journaled commit,
finish with `--resume`, then ship the new work fresh. The journal is never appended to or rebuilt.
The check runs under `main.lock` before anything reads the pending list, on `--resume` AND on a fresh
ship (whose journal is written before the closure gates), again before the spec close, and before the
branch delete, which is compare-and-swap (`git update-ref -d` against the checked tip).

The original Solution (append new commits on `--resume`) was implemented and reviewed four times;
every round found new HIGH defects in the append, re-plan and journal-rebuild paths (see Overnight
status below), so the founder chose refusal instead.

## Risks / Non-Goals

- **MITIGATE** — a commit added to the branch out of the original order (e.g. a rebase) could produce
  a `source_sha` diff that isn't simply "new commits at the end." Scope the fix to the common case
  (new commits appended, no rebase) and detect/refuse the rebase case explicitly rather than silently
  reordering or duplicating journal entries.
- **Non-goal:** rewriting the journal format. This adds one re-diff step, not a new persistence model.

## Done-When

- [x] A `test-git-ops-ship.sh` canary reproduces the P1179 shape: journal created with N commits,
      then a new commit lands on the branch before `--resume` runs, and `--resume` REFUSES (exit
      non-zero, nothing picked, branch and journal kept) when the branch holds commits not in the
      journal or was rewritten, naming them and telling the operator to finish/abort and re-run a
      fresh `ship pN`. (Changed 2026-10-14 by founder decision from "--resume cherry-picks it without
      manual intervention".)
      Evidence (2026-10-14, refuse-on-drift): AD-a (P1179 shape; then the printed recipe converges),
      AD-b (P1303 shape), AD-c (rewrite after a landing), AD-d (commit added during a fresh ship:
      stopped before the spec close, then `--resume` refuses), AD-f (commit after the close), AD-g
      (compare-and-swap branch delete), AD-h (rebase before any pick; the printed fresh re-run ships
      it), AD-j/k/l (drift while `--resume` waits for main.lock), AD-m (drift after a fresh ship's
      gates, refused before any pick). `test-git-ops-ship.sh` rc=0 (76 PASS, incl. AD-n..q from the final review rounds). Reviewed: Codex gpt-6.1-sol x3 on the refuse design (5 findings fixed, each with a failing-first canary).
- [x] The canary is watched fail first (epistemic gate 7) against the current `--resume` before the
      fix lands.
      Evidence (2026-10-14): the new AD section run against the append-on-resume code (branch HEAD
      `2340e355e`) returned rc=1: `AD-a/AD-b/AD-d/AD-h: exited 0 on a branch that no longer matches
      its journal`, `AD-m: refused (exit 1) but moved main — something was picked`. AD-c/f/g/j/k/l
      (behaviour unchanged by the redesign) passed against both.
- [x] `docs/decisions.md` 2026-08-31 [process] entry ("journal is a snapshot at init") updated or
      superseded to point at the fix.
      Evidence: the "Resolved by P1198" paragraph in that entry's Consequences now describes
      refuse-on-drift (2026-10-14).


## Overnight status (2026-10-14) — superseded: founder chose refuse-on-drift the same day

Implemented on this branch and reviewed four times (Codex x3, /finish, Gemini). Each review round of the
**append-on-resume** design found new HIGH defects in the code the previous round added:

1. Round 1 (fixed): branch delete raced new commits; appended commits bypassed a skipped closure gate;
   journal append outside `main.lock`; rebase-before-landing refused.
2. Round 2 (fixed): closure state and the self-modification guard were read before `main.lock`.
3. Round 3 (OPEN, Codex 2026-10-14):
   - **HIGH** — journal rebuild on a pre-landing rebase erases crash-recovery evidence: `landed_sha: null`
     does not prove nothing landed (a pick can commit before the journal records it); reproduced
     shipping both an amended-away and a replacement implementation, exit 0.
   - **HIGH** — a recorded landing suppresses `gone`, so a rewrite after landing is treated as an append;
     reproduced shipping a superseded implementation, exit 0.

Also found during round 2 (pre-existing, not introduced by this branch): on a FRESH `ship pN` (not
`--resume`) the journal is written before the closure gates run, so a branch rewrite in that window
could have stale journaled commits picked. Refuse-on-drift at Phase 1 (re-diff after the gates, under
the lock) would close it in the same change.

**Recommendation (founder decision — it changes Done-When item 1):** switch to **refuse-on-drift**, the
design recorded in decisions.md 2026-09-11 item (c): `--resume` and Phase 3 compare the branch to the
journal and REFUSE (exit non-zero, nothing picked, branch kept) on any unjournaled or rewritten commit,
telling the operator to re-run a fresh `ship pN`. That removes the append, re-plan and journal-rebuild
paths — the source of every HIGH above — while still closing the original defect (silent drop + branch
deletion, exit 0). The canaries AD-c/AD-d and the CAS branch delete carry over unchanged.

## Second reproduction — P1303 (2026-09-11)

During P1303's ship recovery a branch commit (`47af802de`: the spec's embargo lift and prod
evidence) was made after the journal existed. `ship p1303 --resume` landed only the journal's
three commits (`ship_pending_source_shas`), closed the spec from main's older copy, deleted the
branch, and **exited 0**. `47af802de` never reached main, and the closed spec read
`disclosure: embargo` with no prod evidence until a follow-up commit repaired it (`6ed6fc172`).
Unlike P1179, nothing downstream failed to flag it — the run reported success. That is the
stronger case for refusing on an unjournaled branch commit rather than silently completing.

## References

- `scripts/git-ops.sh:1399` (`ship_init_journal`), `:1533` (`ship_pending_source_shas`)
- `docs/decisions.md` 2026-08-31 [process]
- `features/done/2026-06-10/p1179_event_room_links_menu_and_stake_surface.md`
