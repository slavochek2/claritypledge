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

- [ ] Deleting a point succeeds, with its positions and history removed by cascade
- [ ] Deleting a `point_positions` row while its point still exists STILL writes the tombstone history row (the P520 erasure path depends on this — do not regress it)
- [ ] `erase_my_account` still reports the same per-step counts, verified on local Supabase before and after
- [ ] e2e fixture cleanup deletes its points with zero failures; a second consecutive run finds no orphans from the first
- [ ] A regression test covers both arms: point-delete succeeds, position-only-delete still tombstones

## Fix directions (not decided)

1. **Skip the tombstone when the point is going away** — make the `DELETE` arm a no-op if the parent point no longer exists (or is being deleted). Smallest change; needs care because a statement-level view of "is the point gone" inside a row trigger is not trivially available.
2. **Drop the `NOT NULL` / FK coupling** on the history row's `point_id`, so a tombstone can outlive its point. Changes the meaning of the history table and its RLS surface — read `20260216_fix_position_history_rls.sql` and `20260403120200_security_tighten_rls.sql` first, both of which already fought over this table.
3. **Delete history explicitly before the point**, in whatever code path deletes points. Pushes the problem to every future caller; weakest option.

Direction 1 looks right but the trigger has a scarred history — it has already been fixed twice for RLS and `SECURITY DEFINER` reasons — so any change needs both arms tested, not just the one being fixed.

## Notes

- Found while running the owed Playwright verification for **P1078** (hashtag feed fixture). P1078's own fix is correct — the point is now visible, which is exactly what let the suite run far enough to expose this. P1078 cannot go green until this is resolved.
- Three *other* P1078 failures are stale test expectations, not defects, and belong in P1078's own scope: the page renders `Remove filter for #…` where the test expects `Remove tag filter for…`; the bottom nav renders `Home` where the test expects `Feed`; and a database trigger rewrites story tags from content hashtags, so the fixture's explicitly-set tags are overwritten.
- Slot `w10` maps to port 6000, which Chromium rejects as `ERR_UNSAFE_PORT`. Verified on the untouched config. Any agent running e2e from w10 needs a port override — worth fixing in the worktree setup rather than rediscovering.
