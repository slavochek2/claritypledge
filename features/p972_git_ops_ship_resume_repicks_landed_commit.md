---
status: qa
type: bug
rank: 1000939.0
severity: medium
workstream: infra
date_reported: '2026-06-28'
created_date: '2026-06-28'
tags: [git-ops, ship, cherry-pick, journal, tooling]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: scripts/test-p972-resume-cherry-pick-head.sh
  root_cause: "Resume loop suppresses the foreign-pick die when CHERRY_PICK_HEAD == pending sha but then issues a FRESH `git cherry-pick <sha>` (L1959) instead of `git cherry-pick --continue` — git rejects the re-pick mid-sequencer ('your local changes would be overwritten' / 'cherry-pick is already in progress'), the conflict path fires, exit 1, commit stays pending → --resume loops."
  confidence: high
  reproduced_at: '2026-06-28'
  wiring_note: "WIRED — canary runs in pre-commit-checks.sh git-ops canary block (P972 entry, after P924) and triggers when scripts/git-ops.sh or the canary itself is staged."
date_resolved: '2026-06-28'
root_cause: "Phase 1 resume loop declined to die on its own paused pick (CHERRY_PICK_HEAD == pending sha) but then unconditionally issued a FRESH `git cherry-pick <sha>`, which git rejects mid-sequencer → conflict path → exit 1 → journal stays pending → --resume loops."
resolution: "Added an `elif CHERRY_PICK_HEAD == sha` branch that sets _resume_continue=1; the cherry-pick step then runs `git cherry-pick --continue --no-edit` instead of a fresh pick. Net-empty resolutions fall through to the existing benign-empty arm (--skip); genuinely-unresolved conflicts fall through to the diagnostic. No new escape from the --abort/--quit ban."
---

# P972: `git-ops ship --resume` re-picks an already-landed commit and loops after a manual `--continue`

## Summary

When a `git-ops.sh ship` cherry-pick conflicts and the operator resolves it with a manual `git cherry-pick --continue`, the subsequent `git-ops.sh ship pN --resume` runs a *fresh* `git cherry-pick <sha>` for that same commit instead of `git cherry-pick --continue` — producing a "your local changes would be overwritten" / re-conflict loop. The journal still lists the commit as pending, so recovery requires hand-editing `.claude/worktrees/.ship-journal/pN.json`. This footgun has recurred ~8 times across sessions.

## Root Cause

In the Phase 1 cherry-pick loop of `cmd_ship` (`scripts/git-ops.sh`, ~L1925-2036), the conflict-resume arm (~L1946-1966) does not distinguish two states of `.git/CHERRY_PICK_HEAD`:

1. **A foreign in-progress pick** (some other cherry-pick) — fresh `git cherry-pick <sha>` is appropriate.
2. **Our own in-progress pick of the pending sha** — here `CHERRY_PICK_HEAD == pending source sha`, meaning the operator already ran `git cherry-pick --continue` to resolve the conflict. The loop should call `git cherry-pick --continue` and record `landed_sha`, NOT start a fresh pick.

Because the loop always issues a fresh `git cherry-pick <sha>`, in state 2 git refuses ("your local changes would be overwritten by merge") or re-creates the conflict. The benign-already-applied arm (~L1966) only fires when the re-pick produces an *empty* result; a conflict-causing re-pick after a manual `--continue` falls through to the error path with no journal update, so the commit stays `pending` and the next `--resume` repeats the loop.

**Confirmed (2026-06-28) via `scripts/test-p972-resume-cherry-pick-head.sh`.** Precise trigger: at `--resume` time `.git/CHERRY_PICK_HEAD` is present and equals the pending commit's sha (the prior run's conflict-paused pick, whether or not the operator staged a resolution). The per-iteration guard at L1946-1957 correctly *declines to die* (not a foreign pick) but the only follow-on is the fresh `git cherry-pick "$sha"` at L1959 — there is no `--continue` branch. Observed error from the canary: `error: your local changes would be overwritten by cherry-pick. / fatal: cherry-pick failed`, exit 1, c2 still `pending`. The fix is to add the missing branch: when `CHERRY_PICK_HEAD == pending sha`, run `git cherry-pick --continue` (or `--skip` if the continue is net-empty), record `landed_sha`, advance.

## Invariants

- Every commit recorded with a `landed_sha` in `.claude/worktrees/.ship-journal/pN.json` MUST correspond to a commit actually present on `main` — the journal is the resume source of truth and must never claim a landing that did not happen, nor omit one that did.
- The resume path MUST be idempotent: re-running `ship pN --resume` after any interruption (crash, conflict, manual resolution) must converge, never loop on an already-applied commit.
- Mid-sequence `git cherry-pick --abort` / `--quit` are banned (they discard the journal's in-flight state); `--skip` is the only sanctioned escape. Any fix must preserve this constraint.

## Reproduction Steps

1. On `main` in w0, have a feature branch `feature/pN-*` whose commit touches a file that `main` has also changed since the branch point (guarantees a cherry-pick conflict). `docs/decisions.md` is a reliable conflict surface (both sides append).
2. Run `./scripts/git-ops.sh ship pN`.
3. Observe the cherry-pick conflict; git-ops stops and prints resume instructions.
4. Resolve the conflict by hand in the main worktree, `git add` the resolved file, then run `git cherry-pick --continue` **manually** (the natural operator instinct).
5. Run `./scripts/git-ops.sh ship pN --resume`.
6. Observe: git-ops issues a fresh `git cherry-pick <sha>` for the commit just continued → "your local changes would be overwritten by merge" or a re-conflict. The journal still marks the commit `pending`; re-running `--resume` repeats the loop.

**Reproduction rate:** 100% when the operator runs a manual `git cherry-pick --continue` between the conflict and `--resume` (deterministic, not a race).

## Expected Behavior

On `--resume`, when `.git/CHERRY_PICK_HEAD` equals the pending commit's source sha, git-ops detects that our own pick is mid-resolution and runs `git cherry-pick --continue`, records the resulting `landed_sha` in the journal, and advances to the next pending commit. The resume converges with no loop and no manual journal edit.

## Actual Behavior

git-ops runs a fresh `git cherry-pick <sha>` for the already-continued commit, which git rejects ("your local changes would be overwritten by merge") or re-conflicts. The commit stays `pending` in the journal. Recovery requires manually editing `.claude/worktrees/.ship-journal/pN.json` to set the commit's `landed_sha`, then `git cherry-pick --skip`, then re-running `--resume`.

## Affected Files

- `scripts/git-ops.sh` — `cmd_ship` Phase 1 cherry-pick loop, ~L1925-2036; the conflict-resume arm at ~L1946-1966 is where the `CHERRY_PICK_HEAD == pending sha` branch is missing.
- `.claude/worktrees/.ship-journal/pN.json` — the journal whose `pending`/`landed_sha` state desyncs and currently needs manual repair.

## Severity

**Medium** — the ship still completes via a documented manual recovery (journal edit + `--skip`), so no work is lost, but the recovery is error-prone, undocumented at the point of failure, and has recurred ~8 times. Each occurrence risks an operator mis-editing the journal and landing/dropping the wrong commit.

## Fix Approach

In the Phase 1 resume arm, before issuing any cherry-pick for a `pending` commit, read `.git/CHERRY_PICK_HEAD` (if present) and compare it to the commit's source sha:

- **Match** → run `git cherry-pick --continue`, capture the new `HEAD` as `landed_sha`, write it to the journal, advance.
- **No match (foreign pick)** → preserve current behavior, but surface the foreign-pick state rather than blindly fresh-picking.
- **Absent** → fresh `git cherry-pick <sha>` as today.

Keep the existing benign-already-applied (empty re-pick) arm as a secondary safety net. Because this path is serialization-sensitive (journal is the single source of truth) and the change sits in the conflict-recovery code, run an adversarial pass on the guard (foreign-pick state, half-resolved index, race between journal write and `--continue`) before `/fix` — the target now exists as code, so `/slava:think:adversarial-review`, not `/falsify`.

**Prior art / recurrence trail (cite, do not re-document):** decisions.md 2026-06-15 [process] (P936 journal recovery + Status:proposed hardening), 2026-06-13 [process] (shared-checkout `--continue` journal desync), and the P966 entry in `features/done/INDEX.md` (Infrastructure / Process). The standing fix proposed across those entries is the one above; it remains unimplemented.

## Acceptance Criteria

- [x] After a manual `git cherry-pick --continue` on a conflicted ship commit, `./scripts/git-ops.sh ship pN --resume` completes without re-picking the continued commit — no "local changes would be overwritten" error, no re-conflict loop. *(Both variants converge: CHERRY_PICK_HEAD-still-present → new `--continue` branch (canary Z); operator-already-ran-`--continue` → existing already-applied/empty arm → `--skip`.)*
- [x] The journal `.claude/worktrees/.ship-journal/pN.json` records the correct `landed_sha` for the continued commit automatically — no manual edit required. *(Canary asserts journal deleted post-success, which requires landed_sha recorded for c2.)*
- [x] A foreign cherry-pick in progress (`CHERRY_PICK_HEAD` != pending sha) is reported clearly and does NOT get silently consumed as our own. *(`!=` die branch preserved; P788 canary JJ-a/JJ-b green.)*
- [x] Resume remains idempotent: running `--resume` twice in a row after success is a no-op, not a re-pick. *(Post-success journal/branch/CHERRY_PICK_HEAD all cleared — canary asserts; a second `--resume` finds no journal.)*
- [x] Regression test passes: `scripts/test-p972-resume-cherry-pick-head.sh` drives conflict → resolve → `--resume` and asserts convergence. Wired into `pre-commit-checks.sh` git-ops canary block.
- [x] `git cherry-pick --abort`/`--quit` remain unused in the resume path (`--skip` and `--continue` only).
