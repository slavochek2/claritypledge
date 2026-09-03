---
status: week
type: bug
rank: 1000067
severity: medium
workstream: spec-schema
date_reported: '2026-09-03'
created_date: '2026-09-03'
drafted_by: opus
exec_model: sonnet
exec_effort: low
tags: [specs, tooling, validation]
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1238: `validate-features.sh` crashes on a duplicate `status:` key and validates nothing after it

## Summary

`./scripts/validate-features.sh` exits non-zero with an unhandled `YAMLException` instead of a
validation report. Found incidentally while filing P1214 on 2026-09-03.

## Root Cause

`features/archive/p821_letter_reading_progress_bar_disappears_on_scroll.md` has `status:` twice in
its frontmatter. `gray-matter`/`js-yaml` throws `duplicated mapping key at line 11` and the
script has no per-file guard, so one malformed archived spec aborts the whole run.

## Impact

The validator stops at the crash, so **every spec after it is unvalidated** — the failure is
silent in the sense that matters: it looks like a tool error, not like missing coverage. Three
real frontmatter errors printed before the crash (`features/archive/p577_uat.md`,
`p622_uat.md`, `p624_understanding_agreement_grid.md`: invalid `type`) are the ones it managed
to reach.

## Reproduction

```bash
./scripts/validate-features.sh   # -> YAMLException: duplicated mapping key at line 11
```

## Acceptance Criteria

- [ ] `./scripts/validate-features.sh` completes and prints a report with the duplicate key present
- [ ] A file that cannot be parsed is reported as one failing row, naming the file and the reason,
      and the run continues to the next file
- [ ] Exercised by a fixture with a duplicate key, observed failing before the fix (epistemic gate 7)
- [ ] The three pre-existing invalid `type` values in `features/archive/` are reported, not hidden

## Non-Goals

- Do NOT fix the archived specs' content to work around the crash — the crash is the bug.
