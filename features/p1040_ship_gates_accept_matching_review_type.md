---
status: week
type: task
rank: 1000964.0
severity: low
created_date: '2026-08-10'
tags: [tooling, ship, process]
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

- [ ] A migration-only branch (no `src/`/`e2e/`/`scripts/*.ts` changes) with only a
      `migrations`-type `.finish-reviewed` entry passes gate 2.7 without a redundant `code` stamp
- [ ] A branch touching `src/` still requires a `code`-type entry exactly as before (no regression)
- [ ] The gate's failure path has been exercised (epistemic gate 7) — simulate a migration-only
      branch with no review at all, confirm gate 2.7 still fails correctly
- [ ] `docs/decisions.md` 2026-06-27 [process] (gate 2.7's original design) or this spec's
      resolution documents the change
