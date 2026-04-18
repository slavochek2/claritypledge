---
status: week
type: task
rank: 1000758.0
workstream: Process
date_reported: '2026-04-18'
created_date: '2026-04-18'
tags: [process, retrospective, p752, rules]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P758: Process Improvements from P752 Retrospective

## Summary

Four friction points surfaced from the P752 meta-reflection: missing git rule for cherry-pick --abort mid-sequence, unverified ACs in the P752 done spec, /fix pipeline stamp skipped (separate bug P759), and missing render-branch coverage rule in tests.md.

## Items

1. `.claude/rules/git.md` — ban `git cherry-pick --abort` mid-sequence (reverts all prior commits; use `--skip` instead)
2. `features/done/22_mar_26/p752_session_audio_upload_progress_stuck.md` — add `## Deferred Verification` section with 3 unchecked items
3. File P759 bug spec for `/fix` Phase 0.3 pipeline stamp skipped
4. `.claude/rules/tests.md` — add UI Conditional Branch Coverage rule

## Acceptance Criteria

- [x] `git.md` banned-commands table has cherry-pick --abort entry with callout prose
- [x] P752 done spec has `## Deferred Verification` section with 3 unchecked items
- [ ] P759 bug spec created and visible in kanban backlog
- [x] `tests.md` has `## UI Conditional Branch Coverage` section
- [ ] `./scripts/pre-commit-checks.sh` passes
