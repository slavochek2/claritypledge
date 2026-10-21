---
status: qa
type: bug
rank: 49
severity: medium
workstream: infrastructure
date_reported: '2026-10-21'
created_date: '2026-10-21'
drafted_by: opus
exec_model: opus
exec_effort: medium
tags: [e2e, test-users, cleanup, egress]
disclosure: public
delivery_stage: ship
date_resolved: '2026-10-21'
root_cause: stories pre-clean bypassed FK-blocker resolution, which could not clear blockers of rows the user owns; sweeper order let stuck users fill every batch
resolution: deleteClearingReferences resolves blockers through row ids; stories pre-clean uses it; sweeper shuffles a 3x pool
pipeline_ran: [create-bug, fix, ship]
reproduce_artifact:
  reproduced_at: '2026-10-21'
  test_file: scripts/sweep-e2e-test-users.ts --apply --limit 5 (command canary against real stranded users on the test project)
  result: 'deleted 0, failed 5 — all at stories pre-clean, letter_story_snapshots_story_id_fkey'
  root_cause: stories pre-clean is a plain delete; deleteClearingReferences cannot clear blockers of rows the user owns; sweeper order starves
  confidence: high
  fix_shape: decided
---

# P1523: e2e cleanup still strands users whose stories are in a sealed letter

## Summary

P1522's e2e user cleanup still fails for any test user whose story is referenced by a sealed
letter, and those failing users sit at the front of every sweep batch, so the purge of leftover
e2e users on the test project stalls.

## Root Cause

Two defects, both in P1522's own work:

1. **Stories pre-clean bypasses the blocker logic.** `deleteTestUser` deletes the user's stories
   with a plain delete (`e2e/helpers/test-user.ts:500`, "stories pre-clean"). A story referenced
   by `letter_story_snapshots` fails with `letter_story_snapshots_story_id_fkey` (23503). P1522's
   `deleteClearingReferences` is not used there, and it could not resolve this anyway: it only
   clears rows that point at the profile itself, and stops at `test-user.ts:457`
   (`if (column !== 'id') return error`) when a blocker points at a row that belongs to the user
   (here, the user's story) rather than at the user.
2. **The sweeper takes candidates in listing order.** `scripts/sweep-e2e-test-users.ts:75`
   (`ids.slice(0, opts.limit)`) so users that fail every time stay first in every run. Flagged by
   P1522's criteria reviewer in round 1 ("users whose delete always fails can starve the rest")
   and not fixed.

## Invariants

- Cleanup touches the **test** project only; the sweeper's exact-hostname guard stays.
- A blocker that cannot be resolved fails closed (reported, user kept), never guessed at.

## Reproduction Steps

1. Main checkout, `.env.test.local` pointing at the test project.
2. `npx tsx scripts/sweep-e2e-test-users.ts --apply --limit 5`
3. Observe: `deleted 0, failed 5`, each `failed at stories pre-clean: ... violates foreign key
   constraint "letter_story_snapshots_story_id_fkey"`.

**Reproduction rate:** 100% for the users at the front of the list (2026-10-21).

## Expected Behavior

A test user whose stories are referenced by sealed-letter snapshots is deleted, with the snapshot
rows that point at those stories. One unresolvable user never blocks the rest of a batch.

## Actual Behavior

The detached purge deleted 0 users across 12 batches; 17,556 e2e users older than 24h remain on
the test project (from 19,387; ~1,830 were deleted before the stalled run).

## Affected Files

- `e2e/helpers/test-user.ts:500` — stories pre-clean is a plain delete
- `e2e/helpers/test-user.ts:457` — `deleteClearingReferences` cannot resolve blockers of rows the user owns
- `scripts/sweep-e2e-test-users.ts:75` — candidates in fixed listing order

## Severity

**Medium** — test project only; the purge stalls and the teardown sweep can starve, but no user
data and no production path is affected.

## Fix Approach

1. Route the stories pre-clean through `deleteClearingReferences`, and let it resolve one more
   level: when a blocker sits on rows selected by a non-key column, select those rows' `id`s and
   clear their blockers by `id`, bounded, failing closed as now.
2. Shuffle sweeper candidates before taking the batch, so permanent failures cannot occupy every
   batch.

## Acceptance Criteria

- [x] `--apply --limit 5` on the same front-of-list users deletes 5 of 5 (was 0 of 5). Verified
      by calling the cleanup on the same 5 IDs: 5 deleted, 0 failed.
- [x] A batch that contains failing users still deletes the others (no starvation). A random
      200-user batch: 198 deleted, 2 failed on network errors (`fetch failed`), the rest went on.
- [x] The purge makes progress again (213 users deleted across these checks, 0 FK failures).
      `[post-deploy]` The full run (~17,500 users, about 5 hours) and the before/after count are
      INBOX-204; it is started from `main` once this lands.
- [x] No regression in P1522's `e2e/p1522-idle-request-budget.spec.ts` (uses `deleteTestUser`): 5/5.

## Review

Gemini (2 rounds, final CLEAN) and Codex (3 findings). Fixed: a unit test for FK-blocker
resolution (`src/tests/p1523-delete-test-user-fk-blockers.test.ts`, red when the P1523 branch is
removed). Known limits, recorded rather than fixed (simulated shapes this test project does not
produce; 0 permanently stuck users across 213 real deletes):
- The sweeper shuffles a pool of three batches from the first pages; over 3x the batch limit of
  permanently stuck users at the front would still starve later pages.
- A test user with more than 1,000 stories (the API row limit) would not have every story's
  blockers cleared.

## Related

- P1522 (shipped the cleanup this fixes) · INBOX-204 (purge follow-up)
