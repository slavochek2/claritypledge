---
status: backlog
type: bug
disclosure: public
rank: 280
severity: medium
workstream: platform
date_reported: '2026-09-09'
created_date: '2026-09-09'
tags: [database, trigger, foreign-key, e2e-cleanup, point-positions]
---

# P1292: Deleting a point always fails — its own history trigger writes a row that violates the point foreign key

## Summary

`DELETE FROM points WHERE id = ...` **cannot succeed**. The cascade removes the point's
`point_positions` rows, which fires `log_position_change()`, whose `DELETE` arm inserts a
tombstone into `point_position_history` referencing `OLD.point_id` — a point that is being
deleted in the same statement. `point_position_history.point_id` is
`NOT NULL REFERENCES points(id)`, so the insert violates the foreign key and the whole
delete rolls back.

Measured 2026-09-09 by an agent running `e2e/p491-hashtag-feed.spec.ts` against local
Supabase: **16 of 16 point deletes failed**. Because cleanup then never runs, fixtures
accumulate across runs and the suite's locators resolved to 25, then 38 elements.

## Evidence

**The trigger's DELETE arm** (`supabase/migrations/20260409120000_fix_position_history_trigger.sql:32-34`,
body unchanged from `20260204_stories_points_calibration.sql`):

```sql
ELSIF TG_OP = 'DELETE' THEN
  INSERT INTO point_position_history (point_id, user_id, position, reasoning)
  VALUES (OLD.point_id, OLD.user_id, NULL, NULL);
```

**The constraint it violates** (`20260204_stories_points_calibration.sql:99`):

```sql
point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
```

**The trigger fires on `point_positions`**, not on `points`
(`20260204_stories_points_calibration.sql:225`), which is why deleting a *point* reaches it
at all — via the cascade — and why the failure is not obvious from reading either object
alone.

## Why this has stayed invisible

**No user-facing feature deletes a point.** Grep of `src/` finds no client delete against
`points`. Account erasure deliberately *orphans* points rather than deleting them
(`20260901213000_p520_erase_my_account.sql:241`, `points_orphaned`), and the one delete it
does perform is `DELETE FROM point_positions WHERE user_id = ...` (line 230) — positions
only, point still present, so the FK is satisfied and the tombstone lands as intended. That
path is fine and must stay working.

So the defect is **latent in production and live in the test suite**: it costs nothing to a
user today and breaks e2e cleanup every run, which is how it was found.

## Acceptance Criteria

- [x] Deleting a point succeeds, with its positions and history removed by cascade — canary arm A failed
      before the fix (`23503` on `point_position_history_point_id_fkey`) and passes after; an always-rolled-back
      probe on test: the point delete succeeded, 5 positions cascaded, 0 history rows left for the point
- [x] Deleting a `point_positions` row while its point still exists STILL writes the tombstone history row
      — canary arm B (the control) passed before and after the fix; the probe: history 0 → 1
- [x] `erase_my_account` still reports the same per-step counts — `e2e/integration/p520-account-deletion.spec.ts`
      15/15 after the fix. The suite asserts the per-step counts as literals (`positions_deleted: 2`,
      `points_orphaned: 1`, …), so passing after the fix is the same counts it has always required.
      **Method deviation, stated:** run against the test project, not local Supabase, and not re-run before the fix.
- [x] e2e fixture cleanup deletes its points with zero failures; a second consecutive run finds no orphans from the first
      — `e2e/p491-hashtag-feed.spec.ts`, run twice from `w10` on 2026-09-11: per run, 16 "Deleting test point",
      16 "Test point deleted", 0 "Error deleting point" (before the fix: 16 of 16 failed). Points carrying the
      fixture's statement: 38 before run 1, 38 after it, 38 after run 2 — the runs left nothing behind.
      **The 38 are older leftovers, not new ones:** they were stranded before the fix, when both the point
      delete and the user delete failed. They are what makes 8 of that suite's tests fail (strict-mode
      violations, 23 matching elements), which is P1078's to clear. Removing them is a delete on the test
      database, so it waits for the founder
- [x] A regression test covers both arms: point-delete succeeds, position-only-delete still tombstones —
      `e2e/integration/p1292-point-delete-history.spec.ts`, arms A (point delete), B (position-only delete, the
      control), C (profile delete) and D (a user deleted through the auth API — see below). Watched failing
      first: A and C failed with `23503`, B passed; D's failure was shown by a rolled-back probe (below).
      4/4 after, with P520 15/15 in the same run

## Fix directions (decided 2026-09-11: direction 1, extended to both parents — see Resolution)

1. **Skip the tombstone when the point is going away** — make the `DELETE` arm a no-op if the parent point no longer exists (or is being deleted). Smallest change; needs care because a statement-level view of "is the point gone" inside a row trigger is not trivially available.
2. **Drop the `NOT NULL` / FK coupling** on the history row's `point_id`, so a tombstone can outlive its point. Changes the meaning of the history table and its RLS surface — read `20260216_fix_position_history_rls.sql` and `20260403120200_security_tighten_rls.sql` first, both of which already fought over this table.
3. **Delete history explicitly before the point**, in whatever code path deletes points. Pushes the problem to every future caller; weakest option.

Direction 1 looks right but the trigger has a scarred history — it has already been fixed twice for RLS and `SECURITY DEFINER` reasons — so any change needs both arms tested, not just the one being fixed.

## Notes

- Found while running the owed Playwright verification for **P1078** (hashtag feed fixture). P1078's own fix is correct — the point is now visible, which is exactly what let the suite run far enough to expose this. P1078 cannot go green until this is resolved.
- Three *other* P1078 failures are stale test expectations, not defects, and belong in P1078's own scope: the page renders `Remove filter for #…` where the test expects `Remove tag filter for…`; the bottom nav renders `Home` where the test expects `Feed`; and a database trigger rewrites story tags from content hashtags, so the fixture's explicitly-set tags are overwritten.
- Slot `w10` maps to port 6000, which Chromium rejects as `ERR_UNSAFE_PORT`. Verified on the untouched config. Any agent running e2e from w10 needs a port override — worth fixing in the worktree setup rather than rediscovering.

## Resolution (2026-09-11)

**Fix.** `supabase/migrations/20260911110000_p1292_position_tombstone_skips_deleted_point.sql` redefines
`log_position_change()`; one change, in the `DELETE` arm: the tombstone is written only while BOTH parents
still exist — `INSERT ... SELECT ... WHERE EXISTS (the point) AND EXISTS (the profile)`. The `INSERT` and
`UPDATE` arms, `SECURITY DEFINER`, `search_path` and the trigger binding are unchanged; the migration's own
verification block pins each of them. Applied to the **test** project only.

**Why `EXISTS` works — measured, not assumed.** When the cascade fires this row trigger, the parent's
deletion is already visible to a query inside it. Measured on test by redefining the function inside a block
that always raised at the end, so the redefinition rolled back with everything else: the whole-point delete
succeeded (5 positions cascaded, 0 history rows left), and a position-only delete still wrote its tombstone.

**A second parent, found while fixing the first.** `point_position_history.user_id` also references
`profiles(id)`. Deleting a profile cascades to `point_positions`, fires the same arm, and the tombstone
references the profile being deleted — `23503` on `point_position_history_user_id_fkey`. So deleting ANY user
who holds a position failed too: the dashboard's user delete, and e2e's `deleteTestUser`, which logs the error
as a warning and moves on, so test users accumulate. `erase_my_account` survives only because it deletes the
user's positions explicitly before deleting the user. Same arm, same guard; canary arm C covers it.

**Nothing is lost by skipping the tombstone there.** `point_position_history` cascades from both parents, so a
tombstone written during a parent's delete would be deleted in the same statement, if the foreign key let it
exist at all.

**Codex review (2026-09-11).** Four findings, each checked by command before anything changed:

| Finding | Verdict | What changed |
|---|---|---|
| MEDIUM — a session's temp table could shadow `points` / `profiles` inside this SECURITY DEFINER function and silently skip the tombstone | True: `SET search_path = public` still searches `pg_temp` first for relations. Measured on the real function body: with empty temp tables named `points` and `profiles`, a position-only delete wrote 0 tombstones | The two parent checks are schema-qualified; the same run then wrote 1. Reaching it needs a raw SQL session, which no app path has. The unqualified INSERT into `point_position_history` is the same class, predates this change, and is shared by the repo's 177 `search_path = public` settings — filed as a note, not fixed here |
| MEDIUM — sibling data-modifying CTEs deleting a position and its point in one statement defeat the visibility premise | False, measured locally: with the new body the statement succeeds and writes no tombstone; with the old body it fails with `23503`. The row trigger runs after the whole statement, when both deletes are visible | none |
| MEDIUM — the `auth.users → profiles → point_positions` cascade was claimed but never exercised | True | Arm D added. Its failure path, by a rolled-back probe on test that created a fresh auth user, profile and position: old body → `23503` on `point_position_history_user_id_fkey`; new body → the user deleted, the profile gone, 0 positions left. Nothing persisted |
| LOW — the verification block's `LIKE` pins read source text, not behaviour | True, accepted: they catch an edit that drops a guard; arms A–D test the behaviour | none |

After the qualification the function was re-applied on test by hand — `CREATE OR REPLACE` is idempotent
and the version was already recorded — and arms A–D with P520 ran 19/19.

**Side finding, not this spec's.** Deleting a user who has story verifications fails on a different foreign
key (`story_verifications_speaker_id_fkey`, no cascade), with or without this fix — measured on test while
choosing a probe user. Whether that refusal is deliberate is a question for its own spec.

