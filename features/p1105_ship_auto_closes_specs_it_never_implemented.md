---
status: qa
type: bug
rank: 37
severity: high
date_reported: '2026-08-18'
created_date: '2026-08-18'
date_resolved: '2026-08-18'
tags: [git-ops, ship, worktrees, spec-lifecycle]
delivery_stage: ship
pipeline_ran: [create-bug, reproduce, fix, ship]
root_cause: "detect_cospecs() had no --diff-filter add-set exclusion — it could not distinguish a spec the branch CREATED from one it merely EDITED, so Phase 2b auto-closed both."
resolution: "detect_cospecs() now subtracts the branch's own add-set (git log --diff-filter=A) from the touched set before returning; a new detect_filed_cospecs() companion reports the excluded (filed-only) set for ship's log output; both fail closed via _cospec_range_ok() if the commit range can't be resolved."
reproduce_artifact:
  test_file: scripts/test-git-ops-ship.sh (canary Z3)
  root_cause: "detect_cospecs() (scripts/git-ops.sh ~L1283) resolves co-located specs from `git log --name-only main..branch` with zero --diff-filter — it cannot distinguish a spec the branch CREATED from one it merely EDITED. Phase 2b (~L2646) then auto-closes every hit. Verified this session by direct read of detect_cospecs() and the Phase 2b loop: no diff-filter=A or equivalent add-set exclusion exists anywhere in the co-spec path (grep for 'diff-filter' in git-ops.sh finds only two unrelated call sites: a staged-delete check at L1079, and ship_spec_creation_blob at L1939, which computes the branch's OWN pn seed blob for cherry-pick purposes — not the co-spec set)."
  confidence: high
  surfaces_in_scope: [ship-phase-2b-colocated-close]
  surfaces_deferred: []
  reproduced_at: 2026-08-18
---

# P1105: /ship marks specs all-done that its branch only FILED, never implemented

## Summary

`git-ops.sh ship pN` closes every spec whose file was touched by the branch's commits, with no
exclusion for specs the branch merely *created* — so follow-up work filed mid-branch is stamped
`all-done`, given a `completed_at`, and moved to `features/done/` without a line of it being built.

## Root Cause

`detect_cospecs()` (`scripts/git-ops.sh` ~L1227) resolves co-located specs with:

```
git log --format= --name-only "main..${branch}"
  | grep -E '^features/p[0-9]+_.*\.md$'
  | grep -vE '^features/(done|archive|uat)/'
  | grep -oE 'p[0-9]+' | sort -u | grep -v "^${pn}$"
```

`--name-only` reports every path the range touched. There is no `--diff-filter` to exclude
additions, so a spec **created** on the branch is indistinguishable from one **co-delivered** on it.
Phase 2b then closes each hit.

The exclusion logic already exists one step narrower — the final `grep -v "^${pn}$"` drops the
feature's own P-number. [docs/decisions.md](../docs/decisions.md) 2026-08-17 states the required fix
verbatim: *"The co-located-spec heuristic needs to exclude specs created by the branch's own commits
(it already excludes the feature's own pN — the same exclusion logic, one step wider)."*

**This is a known, twice-recorded defect that was never fixed** — see decisions.md 2026-08-13
[process] item 1 and the 2026-08-17 entry.

### Reproduction (2026-08-18)

Confirmed by direct source read this session (not spec prose alone — epistemic gate 3): grepped
`git-ops.sh` for `diff-filter` and found exactly two call sites, neither an add-set exclusion for
co-specs — a staged-delete check (~L1079, unrelated) and `ship_spec_creation_blob` (~L1939, which
seeds the branch's own `pn` spec for cherry-pick purposes, not the co-spec set). `detect_cospecs()`
itself has zero add/edit distinction.

Canary `Z3` added to `scripts/test-git-ops-ship.sh` (immediately after `Z2`): ships a branch with a
primary spec (edited-on-main analog) plus a spec filed fresh on the branch (`status: backlog`,
never on main). Run against current code: **FAILS** — `p123` is moved to `features/done/` and its
status rewritten, exactly the bug.

**Z2/Z3 overlap — flagging for `/fix`:** Z2's own `p121` fixture is shaped exactly like the bug
(created fresh on the branch, never on main) even though Z2's surrounding prose implies it's pinning
the "co-delivered" case. AC 2 below ("canary Z2 still passes — the existing behaviour is not
regressed") is only true once Z2 is rewritten to use a spec that pre-exists on `main` before the
branch is cut — as currently written, a correct fix will make Z2 fail (correctly), not pass
unmodified. `/fix` should split Z2 into an edited-on-main case (still closes) and confirm Z3 is the
add-set-exclusion case (never closes), rather than trying to make current-Z2 pass as-is.

## Invariants

- A spec may only be auto-closed by a ship that **delivered** it. Being edited, or being created, on
  the branch is not delivery.
- The heuristic must fail **closed**: when it cannot tell delivery from filing, leave the spec open.
  A spec wrongly left open costs one manual close; a spec wrongly closed silently deletes tracking
  for work nobody knows is outstanding.

## Reproduction Steps

1. Claim a worktree for any feature: `./scripts/git-ops.sh claim p900 demo`
2. In that worktree, commit the feature's own work as normal.
3. Mid-branch, file a follow-up spec — the routine case is a gate or review flagging deferred work:
   create `features/p901_followup.md` with `status: backlog`, and commit it on the same branch.
4. Return to the main checkout and run `./scripts/git-ops.sh ship p900`
5. Observe the announcement: `ship: co-located specs on branch feature/p900-demo: p901 → auto-closing alongside p900.`
6. Observe `features/p901_followup.md` is gone, now at `features/done/<sprint>/p901_followup.md`
   with `status: all-done` and today's `completed_at`.

**Reproduction rate:** 100%

## Expected Behavior

P901 stays in `features/` at `status: backlog`. Only P900 closes. Ship may warn that P901 was filed
on this branch, but must not close it.

## Actual Behavior

P901 is stamped `all-done` with a `completed_at` and filed into `features/done/`. Nothing failed,
nothing warned — the commit message reads as routine housekeeping (`chore: close p901 (co-located
with p900)`), so the loss is invisible unless someone happens to re-read the ship output.

Recurrence in the log, each needing a manual reopen or revert:

- `fix: reopen p1057 — auto-closed by /ship without being implemented` (2026-08-13)
- `fix: reopen P1045/P1047/P1048 — auto-closed as co-located with P1038`
- `fix: reopen P1044 — auto-closed as co-located with P1038`
- `Revert "chore: close p929 (co-located with p928)"`

The P1038 instance is the worst case on record: it closed five specs, **two belonging to concurrent
sessions**. One of those was a `severity: critical` security spec whose fix had not yet shipped at
the time — so the close removed the only thing tracking it (decisions.md 2026-08-08).

## Affected Files

- `scripts/git-ops.sh` — `detect_cospecs()` ~L1227, the missing add-exclusion. This is the fix site.
- `scripts/git-ops.sh` — Phase 2b co-located close loop ~L2646-2680, the consumer.
- `scripts/test-git-ops-ship.sh` — canary `Z2` pins the co-located close as *desired* behaviour and
  will need a sibling asserting the branch-created case is NOT closed.

## Severity

**High** — silently marks unbuilt work as delivered, has already erased tracking for a live critical
security vulnerability, and recurs on any branch that files a follow-up spec, which the deferral
gates actively encourage.

## Fix Approach

Add an add-exclusion to `detect_cospecs()`: resolve the set of spec paths **added** by the branch's
own commits (`git log --diff-filter=A --format= --name-only "main..${branch}"`) and subtract it from
the touched set. Specs that existed on main before the branch and were merely edited still close, as
today; specs born on the branch never do.

Fail-closed check: if the add-set cannot be computed, close nothing co-located and warn — do not
fall through to the current behaviour.

Two things to verify while in here, both from the P1057 review:

1. `a70f9e18` widened the blast radius slightly. Phase 2b's loop now `continue`s past a failed
   co-spec instead of aborting the script, so later co-specs that a crash used to spare are now
   closed too. That change was correct for the stranding bug it fixed and should stay.
2. The frontmatter guard added in `a70f9e18` does **not** mitigate this. The two follow-up specs from
   the P1057 incident have perfectly valid frontmatter and pass straight through into `all-done` —
   the guard's success path is the dangerous one, not its failure path.

Rejected-alternatives check run against `docs/decisions.md`: no entry rejects the add-exclusion; the
2026-08-17 entry prescribes it. Nothing to override.

## Acceptance Criteria

- [x] Shipping a branch that FILED a new spec leaves that spec in `features/` at its original status —
      verified by a canary that fails against current `main` (canary `Z3`, `scripts/test-git-ops-ship.sh`)
- [x] Shipping a branch that EDITED a spec already on main still closes it (canary `Z2` still passes —
      the existing behaviour is not regressed). `Z2`'s original fixture created its co-located spec
      only on the branch (the P1105 bug shape, not "edited"); split per the reproduce commit note —
      `Z2` now seeds the co-located spec on main and edits it on the branch, so it actually exercises
      the delivered case its name claims. `UU`'s fixture had the same defect and was split the same way.
- [x] When the add-set cannot be computed, ship closes no co-located spec and says so — `detect_cospecs`/
      `detect_filed_cospecs` fail closed (exit 1, empty output) via `_cospec_range_ok`, and the Phase 1
      caller prints "co-located spec detection ... could not resolve the commit range — closing no
      co-located specs (fail-closed)". Verified by direct function-level test (bad branch ref → rc=1,
      empty close-set) — no automated canary added for this arm: triggering it inside a full `ship`
      integration run requires corrupting the branch's git history, which risks a flaky canary for a
      defensive arm that earlier ship guards already prevent from being reachable in normal operation.
- [x] The ship output names which co-located specs it closed and which it deliberately skipped, so
      the decision is auditable from the log alone — Phase 1 prints both "co-located specs on branch
      ...: — auto-closing alongside" and "specs filed (not delivered) on branch ...: — left untouched,
      not auto-closed", each populated from a distinct function (`detect_cospecs` / `detect_filed_cospecs`)
      so the two lists can never silently drift into one another.
- [x] Both canaries watched failing against code without the fix before being kept (epistemic gate 7) —
      confirmed by reverting `scripts/git-ops.sh` to the pre-fix `HEAD` copy and re-running the suite:
      `Z3` FAILed exactly as at `/reproduce` time; `Z2` (new fixture) PASSed pre-fix too, confirming it
      is a non-regression canary (the bug over-closed, never under-closed the edited case) rather than
      one that needed the fix to pass.
