---
status: week
type: bug
rank: 37
severity: high
date_reported: '2026-08-18'
created_date: '2026-08-18'
tags: [git-ops, ship, worktrees, spec-lifecycle]
delivery_stage: create-bug
pipeline_ran: [create-bug]
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
sessions**, and one of those was a `severity: critical` spec for a vulnerability still live on
production — removing the only thing tracking it (decisions.md 2026-08-08).

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

- [ ] Shipping a branch that FILED a new spec leaves that spec in `features/` at its original status —
      verified by a canary that fails against current `main`
- [ ] Shipping a branch that EDITED a spec already on main still closes it (canary `Z2` still passes —
      the existing behaviour is not regressed)
- [ ] When the add-set cannot be computed, ship closes no co-located spec and says so
- [ ] The ship output names which co-located specs it closed and which it deliberately skipped, so
      the decision is auditable from the log alone
- [ ] Both canaries watched failing against code without the fix before being kept (epistemic gate 7)
