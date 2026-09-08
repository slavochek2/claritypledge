---
status: qa
type: bug
disclosure: public
rank: 1000067
severity: medium
workstream: spec-schema
date_reported: '2026-09-03'
created_date: '2026-09-03'
drafted_by: opus
exec_model: sonnet
exec_effort: low
tags: [specs, tooling, validation]
delivery_stage: fix
pipeline_ran: [create-bug, reproduce, fix]
reproduce_artifact:
  test_file: tools/kanban/scripts/__tests__/validate-features.test.ts
  root_cause: "validate-features.ts calls matter(content) with no try/catch per file; gray-matter/js-yaml throws YAMLException on features/archive/p821_letter_reading_progress_bar_disappears_on_scroll.md's duplicate status: key, killing the whole process before the summary prints"
  confidence: high
  surfaces_in_scope: [validate-features.ts]
  surfaces_deferred: []
  reproduced_at: '2026-09-08'
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

- [x] `./scripts/validate-features.sh` completes and prints a report with the duplicate key present
- [x] A file that cannot be parsed is reported as one failing row, naming the file and the reason,
      and the run continues to the next file
- [x] Exercised by a fixture with a duplicate key, observed failing before the fix (epistemic gate 7)
- [x] The three pre-existing invalid `type` values in `features/archive/` are reported, not hidden

## Non-Goals

- Do NOT fix the archived specs' content to work around the crash — the crash is the bug.

---

## Resolution

**Fixed:** 2026-09-08
**Root cause:** `validate-features.ts` called `matter(content)` with no try/catch per file;
`gray-matter`/`js-yaml` throws an unhandled `YAMLException` on a duplicate `status:` key, aborting
the whole `for` loop before the summary ever prints.
**Resolution:** Wrapped the `matter(content)` call in a per-file try/catch. On failure, the file is
reported as one failing row (`Cannot be parsed: <js-yaml message>`), `errors` is incremented, and
the loop `continue`s to the next file — matching the existing pattern used by every other check in
the loop.

**Files changed:**
- `tools/kanban/scripts/validate-features.ts`

**Regression test:** `tools/kanban/scripts/__tests__/validate-features.test.ts` — exercises the
real `features/archive/p821_letter_reading_progress_bar_disappears_on_scroll.md` fixture (the file
that surfaced this bug), asserting the run completes, reports the malformed file by name and
reason, and still validates files after it.
