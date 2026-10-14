---
status: qa
type: task
rank: 36
workstream: infrastructure
created_date: '2026-10-13'
tags: [worktrees, e2e, dev-server, ports]
disclosure: public
intent: cold-start
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: low
driver: anomaly
---

# P1480: Worktree slot w10 gets dev/e2e port 6000, which Chrome refuses, so every Playwright run from w10 fails at the first page load

## Problem

Filed cold from an agent-written task-inbox note. There was no founder conversation to quote.

A worktree slot's dev and e2e port is `5000 + N * 100`. Slot `w10` therefore gets **6000**, which
Chromium refuses as a restricted port (`net::ERR_UNSAFE_PORT`, X11). Every Playwright test in that slot
dies before the app loads, which reads as "the page never rendered" rather than as infrastructure.
This was recorded in decisions.md 2026-09-15 [technical] (P1078): "Any slot that lands on a restricted
port is silently without e2e coverage."

The slot range is real, not hypothetical: `git-ops.sh claim` hands out slots `w1..w99` (`:441`,
`no free slot in w1..w99`). Slot w10 is used whenever nine slots are busy.

The same formula is written out **three times**, verified by grep 2026-10-13:

- `playwright.config.ts:27-35` (`5000 + slot*100`, including the `legacyN` form)
- `vite.config.ts:32-38` (same, plus the `5800 + hash % 100` fallback for non-numeric slots)
- `scripts/check-worktree-env.sh:44-48` (inline `node -e`, same two branches)

Among `5000 + N*100` for N = 1..99, the only port on Chromium's restricted list is 6000 (w10). The
hash fallback range 5800-5899 and the main checkout's 5001 contain none.

## Appetite

- **Blast radius:** dev server and e2e port selection for every worktree. A mismatch between the
  three copies would point Playwright at a port Vite is not serving.
- **Reversibility:** `git revert`.
- **Decision density:** zero founder decisions.

## Invariants

- **The three implementations must agree for every slot.** Playwright's `baseURL`/`webServer`
  port, Vite's `server.port` and the env checker must compute the same number.
- **No other slot's port changes.** Only a slot whose formula result is restricted is remapped.
  Everyone else's bookmarks, running servers and caches stay valid.
- **The remapped port is unique.** It must not collide with any other slot's port, the hash range
  5800-5899, or 5001.

## Solution

When the computed port is on Chromium's restricted-port list, remap it to a deterministic,
non-restricted port that satisfies the invariants (for example, 6000 → 6050). Apply this in all three
places. Keep the list as data, as a small constant with a source comment pointing to the Fetch
standard's "bad port" list, so that a future Chrome addition is a one-line change.

Consolidating the three copies into one shared module is **allowed but not required**. If done, the
bash checker must still be able to call it without a build step (e.g. a plain `.mjs` that `node`
imports).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The three copies drift again | MITIGATE | Done-When adds a test asserting all three agree for w1..w99 |
| A remapped port collides with something local to the machine | ACCEPT | Same exposure as any other slot port today |

**Non-Goals**
- Do NOT change the formula for any slot whose port is not restricted, or the main checkout's 5001.
- Do NOT change the slot allocator in `git-ops.sh` (e.g. skipping w10). Slots and ports stay
  independent.
- Do NOT change other derived ports (kanban, Supabase, etc.).

## Done-When

- [x] A unit test computes the port for `w1..w99` and `legacy1..legacy9` through each of the three
      implementations (or the shared module plus each call site) and asserts: all three agree; none
      is in Chromium's restricted list; all are unique; `w10` ≠ 6000; and every slot other than
      the remapped one keeps its current `5000 + N*100` value.
- [x] From a worktree directory named `w10`, `node -e` evaluation of `playwright.config.ts`'s port
      function and `vite.config.ts`'s port function both return the remapped port, and
      `bash scripts/check-worktree-env.sh` reports the same port.
- [x] A Playwright smoke test run from a `w10` worktree loads the first page (no
      `ERR_UNSAFE_PORT`). If no w10 slot can be claimed at implementation time, the unit test above
      plus a curl to the remapped port on a Vite server started with that slot's config is
      acceptable, stated as such.

**Evidence (/dev, 2026-10-13):**
- AC1: `src/tests/p1480-worktree-ports.test.ts`, 19/19 pass. Shared module checked for w1..w99 and
  legacy1..9 against an independent oracle (`5000 + N*100`, 6000 moved to 6050); call sites checked by
  loading the real `vite.config.ts` / `playwright.config.ts` and running `check-worktree-env.sh` from
  checkouts named w1, w9, w10, w11, w99, claritypledge-3, a named worktree and main. Red before the
  change (w10 vite = 6000). Two mutations (shift 100; vite back to an inline formula) each failed it.
- AC2: from a real directory named `w10`, `vite.config.ts server.port = 6050`, `playwright.config.ts
  baseURL = http://localhost:6050`, `webServer = npm run dev -- --port 6050`,
  `CHECK_WORKTREE_ENV_PRINT_PORT=1 bash scripts/check-worktree-env.sh` = 6050.
- AC3: the live w10 slot belongs to another session, so a throwaway directory named `w10` was used,
  with the real `npm run dev` (predev checker included) started by Playwright. HEAD configs:
  `page.goto: net::ERR_UNSAFE_PORT at http://localhost:6000/`. New configs: 1 passed, loaded
  `http://localhost:6050/feed`.
- The restricted list is the Fetch standard's 83 ports. Measured against Playwright's Chromium
  156.0.8078.4 for ports 1..15000: it refuses that list minus 4190 and 6679.

## Related

- P1078: where the restricted port was diagnosed (decisions.md 2026-09-15 [technical]).
- decisions.md (slot allocation): the `5000 + N * 100` formula's origin.

Promoted from the task inbox, 2026-10-13.
