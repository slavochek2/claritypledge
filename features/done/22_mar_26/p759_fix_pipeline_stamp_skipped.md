---
status: all-done
completed_at: '2026-04-20'
type: bug
rank: 1000759
severity: medium
workstream: Process
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags:
  - process
  - fix-skill
  - pipeline-stamp
  - p659
pipeline_ran:
  - create-bug
  - fix
date_resolved: '2026-04-18'
root_cause: >-
  Phase 0.3 lacked verification after writing frontmatter — silent failure when
  spec path resolved to wrong copy (worktree vs main). Also Phase 0.pre created
  circular spec for execution-ready plan files.
resolution: >-
  Added self-check step 7 to Phase 0.3 (re-reads spec, asserts stamp landed,
  stops with actionable error + path note if not). Added execution-ready plan
  classification to Phase 0.pre to skip auto-/create-bug for checklist-style
  plans.
locked_at: '2026-04-20T09:57:27.448Z'
---

# P759: /fix Phase 0.3 pipeline stamp skipped

## Summary

`/fix` Phase 0.3 failed to stamp `delivery_stage: fix` and append `fix` to `pipeline_ran` during the P752 session. The spec's `delivery_stage` stayed at `reproduce` and `pipeline_ran` remained `[create-bug, reproduce]` after `/fix` completed.

## Root Cause

Under investigation. Two hypotheses:
- Phase 0.3 was never reached (skill execution stopped early or the phase was skipped by a guard condition)
- The spec was read from the wrong location — worktree copy vs main — causing the stamp to land in the wrong file or not persist

## Reproduction Steps

1. Open a spec with `delivery_stage: reproduce` and `pipeline_ran: [create-bug, reproduce]`
2. Invoke `/fix pN` from a worktree (w3 in P752 session)
3. Observe after fix completion: check spec frontmatter
4. **Expected:** `delivery_stage: fix`, `pipeline_ran: [create-bug, reproduce, fix]`
5. **Actual:** `delivery_stage: reproduce`, `pipeline_ran: [create-bug, reproduce]` — stamp not applied

**Reproduction rate:** Confirmed once (P752 session, worktree w3). Rate unknown.

## Expected Behavior

After `/fix` runs Phase 0.3, the spec frontmatter is updated: `delivery_stage: fix`, `fix` appended to `pipeline_ran`.

## Actual Behavior

Spec frontmatter unchanged after `/fix` completes. P752 shipped with stale `delivery_stage: reproduce`.

## Affected Files

- `.claude/commands/slava/build/fix.md` — Phase 0.3 stamp logic
- Possibly: spec read path in worktree context (worktree copy vs main copy)

## Severity

**Medium** — pipeline stamps are audit trail. A missing stamp doesn't break the feature but hides which skills ran, making `/ship` gate checks and `/kdd` less reliable.

## Fix Approach

1. Add a self-check at the end of Phase 0.3: read back the spec and assert `delivery_stage == 'fix'` and `fix in pipeline_ran`. If assertion fails, report "Pipeline stamp failed — check spec path and re-stamp manually."
2. Verify whether the spec path resolution differs between worktree and main when `/fix` reads the file.

## Acceptance Criteria

- [x] Root cause identified: was Phase 0.3 reached? Was the spec path resolved correctly from worktree context?
- [x] `/fix` stamps `delivery_stage: fix` and appends `fix` to `pipeline_ran` when run from a worktree
- [x] Regression test or self-check added so stamp failure is surfaced, not silent
