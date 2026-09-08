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
reason, and walks past it in output order (not just presence — see hardening below).

**Adversarial review (2026-09-08):** a hostile-lens pass found the original test's
"still validates files after the malformed one" assertion checked three files that actually sort
*before* `p821` in the walk — it would have passed even against the pre-fix crashing code, so it
proved nothing about continuation. Corrected to an order-based assertion using `uat_p617.md` (the
real next entry the walk visits after `p821`), and the original three-file check kept as a
separately-labeled test for AC #4 specifically. The same review found two same-class gaps and one
unrelated pre-existing issue:
- `getMarkdownFiles()`'s directory walk (`readdirSync`/`statSync`) ran with no try/catch at all —
  a broken symlink or unreadable subdirectory under `features/` would crash discovery itself,
  before the per-file loop this fix hardened ever starts. Fixed with the same report-and-continue
  pattern.
- A missing closing `---` can make `gray-matter` return the frontmatter body as a string/array
  instead of a mapping; `Object.keys()` on those is non-empty, so it slipped past the empty-object
  guard and produced a misleading "Missing required fields" message instead of naming the real
  cause. Fixed with an explicit type guard before the emptiness check.
- A pre-existing, unrelated finding (gray-matter's language-tag engine selection can execute
  embedded code on parse — not introduced or fixed by this commit) was filed separately as P1271;
  out of scope here per the Non-Goals above.
