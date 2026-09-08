---
status: qa
type: bug
disclosure: public
rank: 100
severity: medium
date_reported: '2026-09-09'
created_date: '2026-09-09'
tags: [kanban, tests, test-debt, security]
delivery_stage: ship
pipeline_ran: [create-bug, fix, ship]
---

# P1277: the kanban tool's test suite is red on `main` — 12 failures across 3 files, three unrelated causes

## Summary

`cd tools/kanban && npx vitest run` exits 1 on `main` (measured at `e44e46ae4`, after P1238 shipped):
3 test files failed, 6 passed. 12 of 120 tests fail. They look like one problem and are three, with three
different correct remedies — one is a real security regression in the server, one is a real product
bug in the server, and one is a set of tests for a feature that was deliberately deleted 6 months ago.

P1238 fixed the `validate-features.test.ts` failures that were in the earlier measurement; that file
now passes and is out of scope here.

## Root Cause

### (a) `security.test.ts` — CORS: a shipped hardening was silently reverted by a parallel branch

`tools/kanban/server/api.ts:13` reads `app.use(cors())` — the wildcard. Three tests assert an
origin allowlist and fail.

The allowlist was **implemented deliberately**. Commit `963da65f8` ("fix(kanban): security fixes,
silent failure logging, and full test coverage") wrote
``app.use(cors({ origin: `http://localhost:${KANBAN_CONFIG.ports.frontend}` }))`` and its own
message says "Restrict CORS from wildcard to http://localhost:9050 only".

It was then lost, not reverted on purpose. Walking every revision of the file:

| revision | value |
|---|---|
| `2d74170dd` and older | `cors()` |
| `9c71060d6` | `cors({ origin: ... })` |
| `e0a0d6eaf` (p449 content-kanban) onward | `cors()` |

`e0a0d6eaf`'s parent is `5d25a9409`, not `9c71060d6` — the p449 branch was cut from a base that
predated the hardening and its copy of `api.ts` overwrote it. The commit shows no `cors` line in its
own diff-vs-parent, which is exactly why nobody saw it go.

**The tests encode real security intent the server no longer implements. The fix belongs in the
server.**

### (b) `security.test.ts` — path traversal: the server answers 404 where the test expects 403

`api.ts:858-861` calls `realpathSync(filePath)` and returns **404 File not found** before the
allowlist is ever consulted. The test constructs `<worktree>/features-evil/bad.sh`, which does not
exist on disk, so it gets 404 instead of the 403 the allowlist would give.

This is not merely a test/server disagreement. Checking existence before authorisation makes
`/api/open` an **existence oracle for the entire filesystem**: 404 means "absent", 403 means
"present but not allowed", for any absolute path the caller sends. The remedy is to authorise first
and answer 403 uniformly for anything outside the allowlist, then `realpath` and re-check so a
symlink still cannot escape. That both closes the oracle and makes the test's original intent
(the `+ sep` boundary: `features-evil` must not match `features`) actually testable.

### (c) `api.test.ts` — two worktrees named `main`

The reported diagnosis (a prunable worktree leaking through) is **wrong**. `api.ts:82` already
skips prunable blocks, and I confirmed the live prunable entry is filtered.

The real cause is `api.ts:96` — `path.match(/\/worktrees\/(w\d+)$/)`, else `'main'`. Any checkout
that is not in the `.claude/worktrees/wN` slot layout is labelled `main`. Live `git worktree list
--porcelain` contains `/private/tmp/claude-501/p1271-baseline` (detached, not prunable), so the
endpoint returns two entries named `main`. The name should be `main` only for the actual project
root.

### (d) `goals.test.ts` — 7 tests for a feature deleted in March

Commit `88f5769b6` (2026-03-21, "refactor: remove milestones/workstreams — hypotheses.md is single
source of truth") deleted `docs/milestones/` and the milestone-based goals API. `api.ts:908-916` now
returns an empty shape from `GET /api/goals` and 404s `PATCH /api/goals/:index`. That commit's
message claims it removed the tests; it did not remove these.

Three tests ENOENT on `docs/milestones/test-fixture-milestone.md` because they write a fixture into
a directory the same commit deleted. Four more assert milestone parsing and step toggling that no
longer exists. These are not testing anything — they are the residue of the deletion.

**This one is the exception to "tests are specs — fix the code, not the test."** The spec changed by
an explicit founder-approved refactor; the tests are what went stale. They are deleted, not
weakened, and the tests in the same file that cover the surviving `/api/goals` fallback shape,
`/api/goals-strategic` and `/api/weekly` are untouched.

## Invariants

- The CORS allowlist is restored to what `963da65f8` intended — bound to `KANBAN_CONFIG.ports.frontend`,
  never re-hardcoded to a literal port.
- `/api/open` must not become more permissive. Every path that was allowed before must still be
  allowed, and the symlink-escape check (`realpathSync` on both the target and the worktree base)
  stays.
- Deleting the goals tests removes coverage of nothing: the endpoints they exercised do not exist.

## Reproduction Steps

1. `cd tools/kanban && npx vitest run`
2. Exit 1. `Test Files 3 failed | 6 passed (9)` / `Tests 12 failed | 108 passed (120)`, across
   `security.test.ts` (4), `goals.test.ts` (7), `api.test.ts` (1).

Deterministic. (c) depends on a non-slot worktree being registered, which is the current state of
this machine.

## Affected Files

- `tools/kanban/server/api.ts` — CORS at `:13`, `/api/open` ordering at `:856-878`, worktree naming at `:96`
- `tools/kanban/server/__tests__/goals.test.ts` — obsolete milestone blocks

## Severity

**Medium.** The kanban server binds localhost and is a local dev tool, so the CORS hole needs an
attacker to already have the founder loading a hostile page while the server runs — real but not
urgent. The larger cost is the one a red suite always carries: 12 known-red tests mean nobody reads
the result, so the next genuine regression in this tool lands unnoticed.

## Acceptance Criteria

- [x] `cd tools/kanban && npx vitest run` exits 0 with 0 failing tests — **exit 0**,
      `Test Files 9 passed (9)` / `Tests 114 passed (114)`. Before: exit 1, 12 failed / 108 passed
      (120). 120 → 114 is the six obsolete milestone tests removed; the seventh was rewritten.
- [x] CORS is restored to an origin allowlist derived from `KANBAN_CONFIG.ports.frontend`; the three
      CORS tests pass unmodified — no test file was touched for this; `security.test.ts` is
      byte-unchanged and all 4 of its previously-failing tests now pass.
- [x] `/api/open` authorises before it checks existence; the path-traversal test passes unmodified,
      and every previously-allowed path is still allowed — `security.test.ts`'s
      "allows opening files inside a real features/ directory" still passes, which is the
      no-false-positive control for the new stage-1 refusal.
- [x] `/api/worktrees` returns exactly one entry named `main`; the prunable filter is unchanged —
      the prunable `continue` at the top of the loop is untouched; only the naming expression changed.
- [x] The obsolete milestone tests are deleted, and every surviving test in `goals.test.ts` passes —
      8 passed, 0 failed.
- [x] `npm run lint` and `./scripts/typecheck-gate.sh` pass — both exit 0.

## Out of scope — found by adversarial review, verified, NOT fixed here

Codex review raised two real defects in `/api/goals-strategic`, which this spec does not touch and
which are not part of the red suite. Both confirmed by reading the code, not taken on the reviewer's
word:

- `GET /api/goals-strategic` builds `steps` only from `sections['Next Steps']` (`api.ts:995-999`),
  while `PATCH /api/goals-strategic/:index` applies its index across a document-wide
  `/^(\d+\. )\[([ x])\] (.+)$/gm` replace over the whole of `docs/goals.md` (`api.ts:1063-1067`).
  A numbered checkbox anywhere above the Next Steps section shifts every index, so a toggle writes to
  the wrong line. **Latent, not live:** `docs/goals.md` currently contains no numbered checkbox and no
  `## Next Steps` heading at all, so GET returns zero steps today.
- The same handler returns `{ success: true }` unconditionally, without checking that the counter ever
  reached `stepIndex`, so an out-of-range index reports success having changed nothing.

Neither is filed as a P-number by this run. They need a founder decision on whether `/api/goals-strategic`
is still wanted at all, given the section it reads no longer exists in `docs/goals.md`.
