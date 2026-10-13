---
status: week
type: task
rank: 38
workstream: infrastructure
created_date: '2026-10-13'
tags: [credentials, audit, drift, gates]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
---

# P1482: The credential drift audit skips the Location check for a whole registry file when any one of its tables lacks a Location column

## Problem

Filed cold. There was no founder conversation to quote.

**Situation:** `scripts/audit-credential-drift.sh` (P1147, extended by P1153 and P1267) compares the
credential registries against the live env files. One of its checks, `REGISTRY_LOCATION_MISMATCH`,
asserts that a registered key actually lives where its row's `Location` cell claims. A registry file
can hold several tables. When a table has no resolvable Location-like column, `parse_registry` emits a
`__NO_LOCATION_COLUMN__` sentinel **for the file** (`:489-498`). Without it, every row in that table
would get `loc=""` and produce a guaranteed false mismatch.

**Complication:** The skip is applied per **file**, not per **table**. `NO_LOC_REGFILES` (`:680`) is
a list of file paths, and the comparison loop does
`if printf '%s\n' "$NO_LOC_REGFILES" | grep -Fxq "$regfile"; then continue` (`:772`) for **every
row in that file**, including rows from tables that *do* have a Location column. One table without
the column therefore disables the location check for every other table in the same file.

Per decisions.md 2026-09-08 [technical] (P1267), both real registries are in that state, so
`REGISTRY_LOCATION_MISMATCH` is **unreachable against production data today**. P1267 accordingly
narrowed its own gate's claim, recording this per-file skip as the higher-value follow-up. Not
re-measured here: re-running the audit against the real registries is the implementer's first step.

The existing test (`scripts/audit-credential-drift.test.sh`, case I, `:360-386`) builds one registry
file with three differently shaped tables. It asserts the skip is reported and that the
no-Location key raises no false mismatch. It has **no** mislocated row in a Location-bearing table of
that same file, which is the case that exposes the defect.

**Question:** Scope the location skip to the rows of the table that lacks the column.

## Appetite

- **Blast radius:** one local audit script and its test. No product surface.
- **Reversibility:** `git revert`.
- **Decision density:** zero founder decisions.

## Invariants

- **No guaranteed false positive comes back.** A row from a table without a Location-like column
  never produces `REGISTRY_LOCATION_MISMATCH` (the P1147 /finish HIGH finding, `:489-495`).
- **A skip is always reported, never silent.** `LOCATION_CHECK_SKIPPED` still fires for each table
  that lacks the column. The `COVERAGE` summary must not read fully clean while any rows were skipped
  (`:895-903`).
- **No secret value reaches output.** All findings still go through `_safe_echo`. This spec changes
  which rows are compared, not what is printed about them.
- **`PLAINTEXT_IN_REGISTRY` still runs first and stays a hard fail.**

## Solution

Carry the "this row's table has no Location column" fact **per row** instead of per file. For example,
emit a distinct marker in the row's location field, or a per-table id, from `parse_registry`. Then skip
only those rows in the comparison loop at `:764-772`. Make `LOCATION_CHECK_SKIPPED` identify the
table (e.g. by its header line or ordinal) as well as the file, so the operator can find it.

The Value-column skip (`__NO_VALUE_COLUMN__`, `:486-488`, `PLAINTEXT_CHECK_SKIPPED`) has the same
file-level reporting shape. Check whether its *consumer* is also file-scoped. If it is, fix it the same
way in this change. If it is not, say so in the ship notes.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Enabling the check surfaces real `REGISTRY_LOCATION_MISMATCH` findings on the real registries | ACCEPT | That is the point. They are registry-content fixes for the operator, not part of this code change |
| A non-file Location (e.g. a CI secret store) now gets compared and false-fires | MITIGATE | The P1267 non-file-location predicate (`:775-804`) already handles this. Covered by re-running the full existing test file |

**Non-Goals**
- Do NOT edit the real registries or any env file. Fixing registry content is an operator task.
- Do NOT build a helper that writes registry rows. That is deliberately deferred until this check is
  enforceable, because a written Location that nothing verifies is weaker than it looks.
- Do NOT change the audit's output token names or exit-code contract beyond adding table
  identification to the skip line.
- Do NOT name any real credential in tests, fixtures, commit messages or this spec. Use the
  `FAKE_*` fixture convention already in the test file.

## Done-When

- [ ] New test case (or an extension of case I) in `scripts/audit-credential-drift.test.sh`: one
      registry file holding a table **with** a Location column whose row claims the wrong env file,
      plus a table **without** a Location column. Expected output: `REGISTRY_LOCATION_MISMATCH` for the
      first row (today: suppressed), `LOCATION_CHECK_SKIPPED` for the second table, and no mismatch
      for the second table's row. This case was seen to **fail** on the current script (gate 7: paste
      both runs).
- [ ] `bash scripts/audit-credential-drift.test.sh` passes in full, with every pre-existing case
      unchanged.
- [ ] Run against the real registries (operator-local), `LOCATION_CHECK_SKIPPED` lines name only
      the tables that lack the column. Record the count of rows now location-checked vs before
      **as numbers only**, with no key names in this spec.

## Related

- P1147: the audit. P1153: the false-clean summary fix. P1267: the gate that narrowed its claim
  because of this skip (decisions.md 2026-09-08 [technical]).

Promoted from the task inbox, 2026-10-13.
