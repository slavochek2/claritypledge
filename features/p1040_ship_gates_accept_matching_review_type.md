---
status: qa
type: task
disclosure: public
rank: 205
severity: low
created_date: '2026-08-10'
tags: [tooling, ship, process]
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
driver: anomaly
---

# P1040: `ship-gates.sh` gate 2.7 should accept the review type matching what changed

## Problem

`ship-gates.sh` gate 2.7 (`scripts/ship-gates.sh:98-108`) hard-requires a `.finish-reviewed` entry
with literal `"type":"code"`, regardless of what files the branch actually touched. `/finish`'s own
classification table (`.claude/commands/slava/build/finish/SKILL.md`) routes different file types
to different review types — `supabase/migrations/**` → `migrations`, `features/p*.md` → `specs`,
`src/**`/`e2e/**`/`scripts/*.ts` → `code`. A branch that touches only `supabase/migrations/` and
`features/` (P1035 — a migration-only prod security fix, zero `src/`/`e2e/` changes) correctly gets
a `migrations`-type review under `/finish`'s own design, then fails gate 2.7 anyway because no
`code`-type entry exists. The workaround this session: write an additional `code`-type stamp
reusing the same review's findings — mechanically satisfies the gate but is redundant bookkeeping,
and a future session hitting this cold will burn time rediscovering the same workaround.

## Appetite

Low blast radius (one script, `ship-gates.sh`, used only by `/ship`). Fully reversible (revert the
script change). Low decision density — the fix is a direct mapping from "what changed" to "what
review type is required," which `/finish`'s classification table already defines.

## Solution

Update gate 2.7 to determine the required review type(s) from the actual files changed on the
branch (`git diff main...HEAD --name-only`, same classification logic `/finish` already uses:
`supabase/migrations/**` → `migrations`, `features/p*.md` (not in `done/`) → `specs`,
`src/**`/`e2e/**`/`scripts/*.ts` → `code`), then check for a matching-type entry per category
present, instead of unconditionally requiring `type:"code"`. A branch touching multiple categories
(e.g. both `src/` and `supabase/migrations/`) should require entries for each category actually
present — not just one of them.

## Risks / Non-Goals

### Risks
- **Under-covering a branch that touches an untyped file category** (e.g. `docs/`, which maps to
  `docs` in `/finish`'s table but may not always need a hard gate). Mitigation: keep the gate's
  hard-block scope to the categories that currently block (`code`, `migrations` at minimum) and
  treat newer/softer categories (`docs`, `privacy`) as it currently does elsewhere — this is a
  scope-matching fix, not an expansion of what gets gated.

### Non-Goals
- Do NOT change `/finish`'s own classification table — gate 2.7 should follow it, not redefine it
- Do NOT weaken gate 2.7 for branches that DO touch `src/`/`e2e/` — those still require a `code`
  entry exactly as today; this only fixes branches where no such files exist
- Do NOT touch gate 2.5, 2.7b, 3.5, or 3.65 — scoped to gate 2.7's type-matching logic only

## Done-When

- [x] A migration-only branch (no `src/`/`e2e/`/`scripts/*.ts` changes) with only a
      `migrations`-type `.finish-reviewed` entry passes gate 2.7 without a redundant `code` stamp
      — `scripts/test-pipeline-gates.sh` I1 (migrations + spec) and I1b (+ `supabase/deploy-manifest.json`,
      the real P1035 shape): `PASS: I1`, `PASS: I1b`; both FAILED before the change.
- [x] A branch touching `src/` still requires a `code`-type entry exactly as before (no regression)
      — I2 (`src/` + migration, migrations review only: `[GATE 2.7] FAIL: .finish-reviewed has no code
      review entry for feature/p3002-demo`), I3 (`src/` + code review: PASS unchanged), I7 (code +
      migrations with the single `/dev` code stamp: PASS), I8 (`scripts/*.sh`, unclassified: still FAIL
      without code), I12 (a `src/` file moved into `supabase/migrations/`: still FAIL without code).
- [x] The gate's failure path has been exercised (epistemic gate 7) — simulate a migration-only
      branch with no review at all, confirm gate 2.7 still fails correctly
      — I4: `[GATE 2.7] FAIL: .finish-reviewed has no migrations review entry for feature/p3004-demo`.
      Mutation check: removing the code fallback, the per-type "all present" check, or `--no-renames`
      each turns the suite red (I2/I8/I12, I9a, I12 respectively).
- [x] `docs/decisions.md` 2026-06-27 [process] (gate 2.7's original design) or this spec's
      resolution documents the change — see Resolution below.

## Resolution

Gate 2.7's feature-branch arm now reads `git diff --no-renames --name-only main...<branch>` and asks
for the review type(s) `/finish`'s classification table assigns
(`scripts/ship-gates.sh`, `review_types_for_branch`):

| Branch changes | Accepted entries (same `branch`) |
|---|---|
| any path outside the classes below (`src/`, `e2e/`, `scripts/`, `supabase/functions/`, anything unclassified) | `code` — unchanged |
| flat `supabase/migrations/*.sql` (plus `supabase/deploy-manifest.json` only beside one) | `migrations`, or `code` |
| `.claude/commands/slava/**/*.md` | `skills`, or `code` |
| `.claude/rules/**/*.md`, `CLAUDE.md` | `rules`, or `code` |
| two or more of the three rows above | one entry per class present, or `code` |
| only Markdown: any `features/**/*.md` | `specs`, or `code` |
| only `docs/**/*.md` | `specs` or `docs`, or `code` |
| empty or uncomputable diff | `code` (fail closed) |

Three decisions taken during `/dev`, each recorded here so they are not re-derived:

1. **A `code` entry still satisfies every branch.** `/dev` 9.5a and `/fix` 1a write one `code`
   stamp after a `/finish` dispatch that reviewed every type. Requiring a separate `migrations`
   entry next to it would have refused every `/dev`-built migration branch (epistemic gate 7c).
   So "one entry per category" applies only between the non-code classes. This follows the
   Non-Goal "exactly as today" for `src/` branches.
2. **Unclassified paths still need code.** `/finish` maps only `scripts/*.ts` to `code`, but
   gate 2.7 already gated `scripts/*.sh`, `supabase/functions/` and the rest. Leaving them
   ungated would have been a weakening (Risks). They fall through to `code`.
3. **`supabase/deploy-manifest.json` rides with migrations.** `migrate.sh` stamps and stages it
   after applying migrations, and P1035's own close carried it. Read as code, it would put the
   exact case this spec fixes back behind a code review. `/finish`'s table is unchanged
   (Non-Goal); only the gate's reading of an unlisted path is.

**Not changed:** the no-branch (direct-to-main) arm still requires a `code` entry naming the spec
(I14), because on `main` there is no branch diff to classify. P1309 absorber borrowing and the
P1444 administrative skip are untouched. Gate 2.7b reads whichever entries matched, as before.

**Codex review follow-up (I16 to I18, each red before its fix):**
- **Only Markdown is prose.** Non-Markdown files under `features/`, `docs/`,
  `.claude/commands/slava/` and `.claude/rules/` count as code. `features/verification/**/*.ts` runs
  browser automation and DB writes, and skill `assets/` carry `.sh`/`.mjs`/`.py`.
- **The branch name is compared as a fixed string.** A `.` in `feature/pN-release.1` used to match a
  stamp for `feature/pN-releaseX1`. The fix covers the new typed arm and the pre-existing code arm,
  which had the same flaw.
- **Gate 2.7b judges each review type by its own latest entry.** It warns if any type is stale and
  stays warn-only.

**Opus adversarial review follow-up (I20 to I23):**
- **Only flat `*.sql` counts as migrations.** Control files (`.schema-gate-exempt`) and subdirectories
  are code. The deploy manifest counts as migrations only beside a `.sql` migration; alone it is code.
- **A spec-only branch needs `specs`.** `goal-gate.sh` runs MECHANICAL rows with `bash -c`.
- **Symlinks and gitlinks are code**, read from `--raw` modes.
- **New cases pin** edge functions as code, case-sensitive `.md`, and the three-dot diff.
