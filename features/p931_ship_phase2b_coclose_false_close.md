---
status: backlog
type: bug
rank: 72
severity: low
date_reported: '2026-06-11'
created_date: '2026-06-11'
tags:
  - infrastructure
  - tooling
  - ship
  - git-ops
delivery_stage: create-bug
pipeline_ran:
  - create-bug
---

# P931: `git-ops.sh ship` Phase 2b co-located auto-close can close the WRONG spec

> **RE-TRIAGED 2026-09-08 (P1246), severity medium -> low. Read this before the body:
> the mechanism described below no longer exists.**
>
> P1246 was filed expecting to raise this to `high` — "a defect that silently marks
> security specs complete at an 83% wrong rate is not medium." That reasoning was
> written 2026-09-04. [P1250](done/2026-06-10/p1250_colocated_autoclose_closes_specs_nobody_did.md)
> shipped on 2026-09-07 and **deleted Phase 2b's auto-close entirely**: it now
> prints a list and closes nothing.
>
> Re-derived by command rather than from either spec's prose. `detect_cospecs`
> survives, but every remaining caller is a REPORT:
>
> ```
> $ grep -n 'cospecs' scripts/git-ops.sh
> 2662:  if ! cospecs="$(detect_cospecs "$pn" "$branch")"     # compute
> 2673:    echo "ship: specs edited by ${branch}, none will be auto-closed: ..."   # report
> 3095:  if [[ -n "$cospecs" ]]; then                          # report
> ```
>
> Nothing moves a file, rewrites frontmatter, or commits. Every acceptance
> criterion below ("does NOT close a different spec") is therefore satisfied
> structurally — not by a guard that could regress, but because the closing code
> is gone.
>
> **The residual, which is what `low` now scores:** the set arithmetic can still
> name the wrong P-number in that printed list, and the list ends with "if one of
> these is genuinely done, close it by name". A wrong entry can therefore still
> mislead a human into a manual close — but a human decides, and since P1246 that
> manual close runs `ship-gates.sh` first. Two layers stand between this bug and a
> false close where previously there were none.
>
> **Not closed**, because the arithmetic is genuinely still wrong and the report is
> still consumed. Re-scored to match what it can now cost.


## Summary

`git-ops.sh ship` Phase 2b ("co-located spec auto-close") closes a spec by **P-number string match** derived from changed file paths and/or commit references on the branch — not from verifying that a `features/pN_*.md` spec file is actually added/renamed-onto the branch. When a P-number appears in a path or commit but a *different* spec with that number exists, the wrong spec is silently closed.

## Root Cause

Documented latent bug (decisions.md 2026-06-10 [technical], from P899): "Phase 2b derives P-numbers from changed file PATHS — a test file named after another spec triggers a false close." The decision states the fix direction: **Phase 2b detection must scope to changed `features/pN*.md` SPEC files only — never P-numbers parsed from arbitrary changed paths** (test files, e2e specs, helpers, commit messages). This fix is **not** owned by P920: P920's primary concern is the no-branch close path and it **explicitly skips Phase 2b** (`features/p920_…md` line 228: "Phase 2b co-spec auto-close … Skipped"). So no active spec fixes the detection.

**New variant (this session, P928/P930 ship):** a spec renamed mid-ship (`p929_repledge` → `p930_repledge`) left the OLD path `features/p929_repledge…` in the branch diff. Phase 2b extracted "p929" and closed the unrelated, **active parked** spec `features/p929_move_transcription_sweeper_off_gpu.md` — moving it to `features/done/2026-06-10/` and flipping `status: backlog → all-done`, `delivery_stage: park → completed_at`. Caught and reverted (`git revert c01031df` → `af43a651`); spec hand-restored to `features/` with original frontmatter. So the documented "scope to changed `features/pN*.md`" fix is necessary but **not sufficient** — a rename's *old* path is a changed `features/pN*.md` path yet points at a now-different spec.

## Reproduction Steps

1. Have an active/parked spec `features/pN_aaa.md` on main (e.g., a concurrent session's backlog task).
2. On a feature branch, ship work that either (a) renames `features/pN_bbb.md → features/pM_bbb.md` (a different spec that once shared number `pN`), or (b) edits a test file `e2e/pN-*.spec.ts`, or (c) carries commits whose messages reference `pN`.
3. Run `./scripts/git-ops.sh ship pX` (where the branch is bundled / co-located).
4. Observe: Phase 2b announces "co-located … pN → auto-closing" and moves `features/pN_aaa.md` to `features/done/`, rewriting its frontmatter — even though that spec was never part of the shipped work.

**Reproduction rate:** deterministic given the trigger conditions (bundled specs, mid-ship renumber, or a `pN`-named test file on the branch).

## Expected Behavior

Phase 2b closes only specs whose `features/pN_*.md` file is genuinely **added or renamed onto the branch** as part of the shipped work (and resolves to a closable status). It must NOT close a spec merely because its P-number appears in a changed path (including a rename's old path), a test filename, or a commit message.

## Actual Behavior

A spec unrelated to the ship is moved to `features/done/<sprint>/` with `status: all-done` + `completed_at`, committed to main. Recoverable via `git revert`, but the revert bakes the wrong frontmatter back in (must hand-restore `status`/`completed_at` — see P920 line 275).

## Affected Files

- `scripts/git-ops.sh` — `cmd_ship` Phase 2b co-located auto-close (~line 1712) and `detect_cospecs` (the P-number derivation)

## Severity

**Medium** — can silently mark an *active* spec `all-done` and move it to `done/`, corrupting kanban + spec-tracking state. Dev-tooling only (no prod/user impact), recoverable by revert, narrow triggers (bundled specs / mid-ship renumber / `pN`-named test file).

## Fix Approach

Scope `detect_cospecs` to spec files that are **added or present-on-branch** in the diff, not string-matched P-numbers:

```bash
git diff --name-only --diff-filter=AR main..HEAD -- 'features/p*_*.md'   # added/renamed-TO spec files only
```

Exclude rename **old paths** (diff-filter `D`/the from-side of `R`), test/e2e/helper paths, and commit-message references. Additionally guard: a co-spec only closes if its file currently resolves to that P-number on the branch (the renamed-TO path), AND it is at a closable status — never on P-number presence alone (cf. P920 line 275: "never close on spec-presence + status alone").

**Run `/falsify` on the fix design** before implementing — the guard must not false-NEGATIVE (skip a legitimately bundled spec that *should* close, e.g. P930 this session, which had to be closed manually after the revert).

## Acceptance Criteria

- [ ] Shipping a branch that renames `features/pN_x.md → features/pM_x.md` does NOT close a different `features/pN_y.md` that exists on main
- [ ] Shipping a branch that edits `e2e/pN-*.spec.ts` (where `pN` is an active spec) does NOT close `features/pN_*.md`
- [ ] A genuinely bundled co-located spec (its `features/pN_*.md` added/renamed onto the branch, status closable) IS still auto-closed (no false-negative)
- [ ] Guard failure path exercised against a fixture (epistemic gate 7): construct the rename-collision case, confirm the wrong spec is NOT moved
- [ ] References P899 (decisions.md 2026-06-10 [technical]) and notes P920 deliberately skipped Phase 2b
