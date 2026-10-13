---
status: week
type: task
rank: 30
workstream: infrastructure
created_date: '2026-10-13'
tags: [kanban, typescript, pre-commit, test-hygiene]
disclosure: public
intent: cold-start
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: low
driver: anomaly
---

# P1474: The kanban typecheck fails on main (16 errors), and a stray console.log fires the pre-commit warning on every kanban commit

## Problem

Filed cold from two agent-written task-inbox notes. There was no founder conversation to quote.

`npx tsc --noEmit -p .` in `tools/kanban` **exits 2 with 16 errors** on main. Re-measured 2026-10-13;
it was 12 errors on 2026-10-09, so the count is growing because nothing runs this check:

- **12 × TS2339** in `lib/scanner-rules.ts:188-220` (`Property 'status'|'rank'|'type'|'size'|'tags'
  does not exist on type '{}'`). `validateFrontmatter(frontmatter: unknown)` narrows `unknown` to
  `{}` with `if (!frontmatter)` and then reads fields off it.
- **4 × TS2783** (`'role'`/`'tabIndex' is specified more than once, so this usage will be
  overwritten`). These are at `src/components/Card.tsx:100-101` and `src/components/FocusPage.tsx:150-151`:
  explicit `role="button" tabIndex={0}` appear before `{...attributes}` (dnd-kit) at `Card.tsx:114` /
  `FocusPage.tsx:162`, which overwrites them.

No gate typechecks `tools/kanban`. `scripts/typecheck-gate.sh` runs `tsc -p tsconfig.app.json` (the
root app) only, and `.github/workflows/test.yml` does not reference `tools/kanban`. Verified by grep
2026-10-13.

Separately, `tools/kanban/e2e-day/day-page.spec.ts:2974` has
`console.log('THEME-PARITY ' + JSON.stringify({ board, cp: ref }))`, which landed with P1449. It
triggers pre-commit's console.log warning on every commit that stages that file.

## Appetite

- **Blast radius:** the kanban dev tool only. No product surface.
- **Reversibility:** `git revert`.
- **Decision density:** zero founder decisions.

## Invariants

- **Runtime behaviour of the board is unchanged.** Today dnd-kit's `attributes` win over the
  explicit `role`/`tabIndex`, so the fix keeps exactly that outcome. Remove the explicit duplicates;
  do not reorder them after the spread.
- **`validateFrontmatter` accepts and rejects exactly the same inputs as before.** This is a type
  fix, not a validation change.

## Solution

1. Type the narrowed value in `validateFrontmatter` (for example, check it is a non-null object and
   treat it as `Record<string, unknown>`) so the field reads typecheck. Make no behaviour change.
2. Remove the duplicated `role`/`tabIndex` props in `Card.tsx` and `FocusPage.tsx` that dnd-kit's
   `attributes` already supply.
3. Delete the `THEME-PARITY` `console.log`. If the logged values are needed for debugging a failure,
   pass them as the `expect(...)` failure message or a `testInfo.attach` instead.
4. **Stop it rotting again:** in `scripts/pre-commit-checks.sh`, when any staged file matches
   `^tools/kanban/.*\.(ts|tsx)$`, run `npx tsc --noEmit -p tools/kanban` and fail the commit on a
   non-zero exit. Commits that stage no kanban TypeScript must not pay this cost.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The new pre-commit step slows kanban commits | ACCEPT | Runs only when kanban TS is staged. Duration not measured; record it in the ship notes |
| New kanban type errors land between filing and implementation | MITIGATE | The Done-When requires a clean run at implementation time, whatever the count is then |
| The gate is never seen to fail | MITIGATE | Done-When requires a deliberate type error to block a commit (gate 7) |

**Non-Goals**
- Do NOT add a CI job for the kanban typecheck. Pre-commit only.
- Do NOT enable stricter compiler options or fix lint warnings.
- Do NOT refactor `scanner-rules.ts` beyond the typing fix, and do NOT change the drag-and-drop
  behaviour of cards.
- Do NOT touch the root app's `scripts/typecheck-gate.sh`.

## Done-When

- [ ] `cd tools/kanban && npx tsc --noEmit -p .` exits 0 (paste the output).
- [ ] `grep -n "console.log('THEME-PARITY" tools/kanban/e2e-day/day-page.spec.ts` returns nothing,
      and the theme-parity test still passes.
- [ ] Gate 7 proof: in a worktree, add a deliberate type error to a kanban `.ts` file and stage it.
      `bash scripts/pre-commit-checks.sh` exits non-zero and names the kanban typecheck. Revert, and
      it passes. Paste both exit codes.
- [ ] A commit staging no `tools/kanban` TypeScript does not run the kanban typecheck (the output
      shows it skipped).
- [ ] The kanban unit tests (`cd tools/kanban && npm test`) pass.

## Related

- P1449: the theme-parity test that added the console.log.
- P861: the root app's typecheck gate, whose no-op history is the reason for the gate-7 proof above.

Promoted from the task inbox, 2026-10-13 (two notes merged into this spec).
