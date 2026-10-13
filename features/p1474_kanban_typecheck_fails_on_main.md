---
status: in-progress
type: task
rank: 30
workstream: infrastructure
created_date: '2026-10-13'
tags: [kanban, typescript, pre-commit, test-hygiene]
disclosure: public
intent: cold-start
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

- [x] `cd tools/kanban && npx tsc --noEmit -p .` exits 0 (paste the output).
      Evidence (2026-10-13, w9): before, 16 errors and exit 2 (12 TS2339, 4 TS2783). After, no
      output and `npx tsc rc=0` (tsc 5.9.3).
- [x] `grep -n "console.log('THEME-PARITY" tools/kanban/e2e-day/day-page.spec.ts` returns nothing,
      and the theme-parity test still passes.
      Evidence: the grep printed nothing (rc=1). `playwright test --config=playwright.day.config.ts -g "theme parity"`
      with `DAY_E2E_PORT_BASE=9170` reported `1 passed (52.5s)`.
- [x] Gate 7 proof: a deliberate type error in a staged kanban `.ts` file is refused, and passes once reverted.
      Evidence (section level — the full script cannot prove this before ship): section 4.5b was
      extracted verbatim and run against the real w9 index. With `'not a number'` assigned to a
      `number` in `lib/scanner-rules.ts` and staged it printed `>>> Kanban typecheck... ✗`, `TS2322`,
      `ERRORS=1 rc=1`; after revert and restage `✓`, `ERRORS=0 rc=0`.
      Why not the full script / a real commit here: every worktree commit runs the **main checkout's**
      `pre-commit-checks.sh` (`.git/hooks/pre-commit` is a symlink into main —
      `docs/technical/worktree-setup.md` "The commit hook is main's"), so 4.5b cannot fire on this
      branch's own commits until it is on main. Confirmed by observation 2026-10-14: a probe commit on
      this branch staging the same type error was accepted (main's hook has no 4.5b; probe commit
      removed). The real-commit proof is a post-ship check, tracked in the task inbox.
- [x] A commit staging no `tools/kanban` TypeScript does not run the kanban typecheck (the output
      shows it skipped).
      Evidence (same section harness): with an empty index, and again with only the spec and
      `scripts/pre-commit-checks.sh` staged, it printed
      `>>> Kanban typecheck skipped (no tools/kanban TypeScript staged)` with rc=0. With only
      `tools/kanban/package.json` staged (temp index) it also skipped.
- [x] The kanban unit tests (`cd tools/kanban && npm test`) pass.
      Evidence: `vitest run`. Before: 25 files and 503 tests passed. After: 25 files and 503 tests passed.

## Dev Notes

- **Gate duration:** section 4.5b took about 3.1s wall on a clean tree (`time`, w9, 2026-10-13).
- **This differs from Solution step 4 in three ways:**
  - The trigger also matches `tools/kanban/tsconfig.json`, and it includes staged deletions.
  - It runs the board's own `tools/kanban/node_modules/.bin/tsc` (5.9.3), not `npx tsc` from the
    root (5.7.3). Without the board's install, the root compiler reported missing modules that are
    not real errors.
  - If that install is missing, the commit is blocked rather than skipped. Section 4.5 already
    fails without the same install (measured: `Cannot find package 'gray-matter'`), so no kanban
    commit that passes today starts failing here. Worktrees do not get `tools/kanban/node_modules`
    from `git-ops.sh claim`; w9 used a symlink to the main checkout's copy.
- **`validateFrontmatter` stays the same:** there is deliberately no `typeof === 'object'` check.
  A differential run compared the old and new function on 1,469 inputs: every `features/**`
  frontmatter, primitives, arrays, and a function carrying `status`/`rank`. It found 0 differences.
  A mutant with the object check that Solution step 1 suggested produced 4 differences, so
  that check would have changed both an error message and an accept/reject result.
- **TS2783 differs from Solution step 2.** Deleting the literal `role`/`tabIndex` broke ESLint:
  `jsx-a11y/no-static-element-interactions` needs a literal `role`, so pre-commit section 2 would
  have blocked every commit. HEAD passed ESLint, and a dynamic `role={role}` also failed. The fix
  is the reverse: keep the literals where they were, and take `role`/`tabIndex` out of dnd-kit's
  spread (`const { role: _dndRole, tabIndex: _dndTabIndex, ...dragAttributes } = attributes`).
  dnd-kit's values are its defaults, `'button'` and `0`, because neither call passes the
  `attributes` option. A temporary `renderToStaticMarkup` diff compared HEAD and the new `Card`
  (2 features) and `FocusPage`. After normalizing dnd-kit's global `DndDescribedBy-N` counter, the
  markup was byte-identical. The same diff failed on that counter before normalizing, which shows it
  can detect a difference. The test files were deleted afterwards.

## Related

- P1449: the theme-parity test that added the console.log.
- P861: the root app's typecheck gate, whose no-op history is the reason for the gate-7 proof above.

Promoted from the task inbox, 2026-10-13 (two notes merged into this spec).
