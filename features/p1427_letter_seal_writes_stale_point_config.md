---
status: qa
type: bug
rank: 317
severity: low
workstream: letters
date_reported: 2026-10-06
created_date: 2026-10-06
drafted_by: opus
exec_model: sonnet
exec_effort: medium
tags: [letters, lost-update, jsonb]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-bug, dev, ship]
---

# P1427: Sealing a letter can write back a stale `point_config` from page load

## Summary

On seal, `src/app/pages/letter-compose-page.tsx` (~line 204) writes
`{ ...existing, order }` where `existing` is the story's `point_config` **as loaded when the
composer opened**. If the author changed `hidden` or `lead_count` elsewhere in the meantime (e.g. the
doc detail page, `src/app/pages/doc-detail-page.tsx` ~line 107, in another tab), the seal restores
the old values, and the sealed snapshot copies them — a point the author hid could reach
recipients. Same bug class as P1425 (stale snapshot written back whole); found by the P1425
bug-class sweep, not by a user report.

## Root Cause

Client-side read-modify-write of a whole jsonb (`point_config`) from a read taken at page load.
UNVERIFIED end to end: the snapshot step's exact copy of `point_config` should be confirmed by
`/reproduce`.

## Invariants

- A writer of a shared JSON column changes only the keys it owns (P1425, generalised): the seal
  owns `order`, never `hidden` / `lead_count`.

## Reproduction Steps

1. Open a doc's letter composer (tab 1).
2. In tab 2, hide a point on the same doc.
3. Seal the letter in tab 1.
4. Observe: `point_config.hidden` is back to the tab-1 value; the hidden point is in the sealed letter.

**Reproduction rate:** 100% when the two-tab sequence is followed.

## Expected Behavior

Sealing writes only `order`; `hidden` / `lead_count` keep their current values.

## Actual Behavior

Sealing restores the page-load `hidden` / `lead_count`.

## Affected Files

- `src/app/pages/letter-compose-page.tsx` — seal handler (~lines 195–210)
- `src/app/pages/doc-detail-page.tsx` — the other writer (~line 107)

## Severity

**Low** — needs two tabs, but the consequence (a hidden point published to recipients) is a
content-exposure one, so worth fixing.

## Fix Approach

Write only `order` atomically (jsonb `||` / `jsonb_set` in an RPC or a single-key update), or
re-read `point_config` immediately before the seal and abort on a change.

## Acceptance Criteria

- [x] Hiding a point in another tab before sealing keeps it hidden in the sealed letter
- [x] Seal still persists the chosen `order`
- [x] Regression test covers the two-writer sequence

### Dev evidence

**Fix taken (no migration):** `persistDefaultPointOrders` in
`src/app/utils/compose-default-point-order.ts` re-reads every story's current `point_config`
(new `docsService.getPointConfigs`) right before the seal and writes `{ ...current, order }`.
It skips a story whose current `order` is already non-empty or whose row is gone, and it fails
closed: a failed read rejects, so the seal never runs. `letter-compose-page.tsx` `handleSeal` now
calls it in place of the inline page-load spread.

**Snapshot path (Root Cause UNVERIFIED item):** confirmed from the source, and now also at runtime
by the AC1 integration test below. The current seal RPC
(`supabase/migrations/20260904120000_p1212_seal_rpc_story_author_name.sql` L132, L141–145) copies
`ds.point_config` `hidden` / `order` / `lead_count` from the `doc_stories` row at seal time. So
whatever the pre-seal write leaves in the row is what recipients get.

**Regression test** `src/tests/p1427-seal-fresh-point-config.test.ts` uses an in-memory
`doc_stories` store. A second writer (the "other tab") changes the row between page load and seal.
- Failing first, against the extracted pre-fix behaviour: `Tests 6 failed | 2 passed (8)`. The
  failures include "AC1: a point hidden in another tab after load stays hidden after seal" and
  "AC1: a lead_count changed in another tab after load survives the seal".
- After the fix: `Tests 14 passed (14)` (P1427 + P837 suites). Full unit suite:
  `Test Files 562 passed | 2 skipped (564)`, `Tests 6216 passed | 19 skipped (6235)`.

**AC1: real seal against the TEST project.** The test is
`src/tests/integration/p1427-seal-keeps-concurrent-hidden.test.ts`. It runs in the live vitest
lane because it needs the app's own `docsService` and `lettersService`; Playwright
`e2e/integration` can't load those (see `src/tests/integration/vitest.config.ts`).

The test:
1. Seeds one story with 3 points and `point_config: { order: [] }`.
2. Loads it with `docsService.getDoc`, which is the composer's page-load view.
3. Acts as a second writer and hides point 2 with `updatePointConfig`.
4. Runs `persistDefaultPointOrders`, then `lettersService.createLetter` and `sealLetter`.
5. Reads `letter_story_snapshots.point_config` from the sealed letter.

Run with
`npx vitest run --config src/tests/integration/vitest.config.ts src/tests/integration/p1427-seal-keeps-concurrent-hidden.test.ts`.
- Control (pre-fix behaviour, with `getPointConfigs` temporarily returning the page-load configs):
  the run fails with `AssertionError: the second writer's hide was reverted by the seal: expected []
  to deeply equal [ Array(1) ]`, and `Tests 1 failed (1)`. So the sealed snapshot published the
  hidden point.
- With the fix: `✓ AC1: hidden survives the seal into the snapshot, and the order is persisted`,
  `Tests 1 passed (1)`. The snapshot's `hidden` is `[point2]`, `points[point2].hidden` is `true`,
  and `order` equals the displayed order.
- Cleanup was checked after the runs. The P1427 doc, story, points, profile and delivery each
  return `[]` from the TEST REST API, and a known-good control on the same columns returns rows.

**Residual race (deferred):** the fix is read-then-write, not atomic. A `hidden` / `lead_count`
change that lands between the fresh read and the write (one round trip, milliseconds) is still
overwritten. Closing that needs a server-side single-key write (`jsonb_set` / `||` in an RPC),
which means a migration and is out of scope for this run.
