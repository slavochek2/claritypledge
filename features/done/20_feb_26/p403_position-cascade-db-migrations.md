---
status: done
completed_at: "2026-02-20"
type: task
rank: 403
workstream: C1
created_date: 2026-02-20
tags: []
---

# TASK: DB Migrations — Position Cascade Trigger + Story Point History

## Goal

Lay the DB foundation for P401 (position-story integrity). Two migrations:

1. `story_point_history` table — audit log of all story-point link changes
2. Cascade trigger — when a position is deleted, auto-remove matching story-point links and record in history

Must be done before P401 UX work.

## Steps

**Migration 1: `story_point_history` table**
```sql
CREATE TABLE story_point_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  point_id UUID NOT NULL REFERENCES points(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL,
  unlinked_at TIMESTAMPTZ DEFAULT now(),
  unlink_reason TEXT  -- 'position_removed' | 'manual'
);
```
With RLS: public read, system insert via trigger.

**Migration 2: cascade trigger on `point_positions` DELETE**
```sql
-- When position is deleted:
-- 1. Find story_points where story.author_id = OLD.user_id AND point_id = OLD.point_id
-- 2. Insert into story_point_history (linked_at from story_points.created_at, unlink_reason = 'position_removed')
-- 3. Delete those story_points rows
```

Also: add trigger on `story_points` INSERT to record in `story_point_history` (linked_at = now, unlinked_at = null).

Run `./scripts/migrate.sh` after creating migration files.

## Done When

- [ ] `story_point_history` table exists in DB
- [ ] INSERT on `story_points` → history entry created
- [ ] DELETE on `point_positions` → matching `story_points` removed + history entries created with `unlink_reason = 'position_removed'`
- [ ] Manual unlink (story author removes point) → history entry with `unlink_reason = 'manual'`
- [ ] RLS policies in place
- [ ] Migrations applied to production

## Architecture

### Migration file count: one file

The spec frames the work as "two migrations" conceptually, but one file is the right call:

- The cascade trigger function references `story_point_history` directly. If that table does not exist when the trigger is compiled, `CREATE FUNCTION` fails.
- Supabase's `db push` applies files in filename order. Two files with the same date prefix are fine with `YYYYMMDDHHMMSS` timestamps, but there is zero benefit to splitting here — these two objects have a hard dependency and no reason to deploy independently.
- One atomic file: either the whole thing applies or it does not. No partial-applied state where the table exists but the trigger does not (or vice versa).

**File name:** `supabase/migrations/20260220120000_story_point_history_cascade.sql`

---

### Migration SQL

```sql
-- Migration: story_point_history table + cascade trigger + link-creation trigger
-- Created: 2026-02-20
-- Depends on: 20260204_stories_points_calibration.sql
--   (stories, points, profiles, story_points, point_positions tables)

-- ============================================================================
-- TABLE: story_point_history
-- Audit log of all story-point link changes (links created and removed).
-- ============================================================================

CREATE TABLE story_point_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id    UUID        NOT NULL REFERENCES stories(id)   ON DELETE CASCADE,
  point_id    UUID        NOT NULL REFERENCES points(id)    ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  -- user_id = story author (the person who owns the story-point link)
  linked_at   TIMESTAMPTZ NOT NULL,
  -- linked_at is populated from story_points.created_at on unlink,
  -- or from now() on the INSERT trigger path.
  unlinked_at TIMESTAMPTZ DEFAULT NULL,
  -- NULL = link is still active (INSERT trigger path).
  -- set to now() when the link is removed.
  unlink_reason TEXT DEFAULT NULL
  -- 'position_removed' | 'manual' | NULL (when still linked)
);

-- Index for looking up all history for a given story
CREATE INDEX idx_story_point_history_story
  ON story_point_history(story_id);

-- Index for looking up all history for a given point
CREATE INDEX idx_story_point_history_point
  ON story_point_history(point_id);

-- Index for looking up all history for a given user (story author)
CREATE INDEX idx_story_point_history_user
  ON story_point_history(user_id);

-- Index for time-range queries on unlinked_at (e.g. "recently removed links")
CREATE INDEX idx_story_point_history_unlinked
  ON story_point_history(unlinked_at DESC)
  WHERE unlinked_at IS NOT NULL;

-- ============================================================================
-- ROW LEVEL SECURITY: story_point_history
-- Public read. Inserts are system-only (via triggers, SECURITY DEFINER).
-- Pattern matches point_position_history in 20260216_fix_position_history_rls.sql.
-- ============================================================================

ALTER TABLE story_point_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Story point history is publicly readable"
  ON story_point_history
  FOR SELECT
  USING (true);

-- WITH CHECK (true) is safe here for the same reason as point_position_history:
-- the table is not exposed via the Supabase auto-API for inserts (only triggers write to it).
-- SECURITY DEFINER functions bypass RLS, but having this policy prevents surprises
-- if a future function runs as the calling user.
CREATE POLICY "Allow trigger to insert story point history"
  ON story_point_history
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- TRIGGER 1: Record link creation when a row is inserted into story_points
--
-- Fires AFTER INSERT on story_points.
-- Writes a history row with unlinked_at = NULL (link is active).
-- linked_at = NEW.created_at (the moment the link was made).
-- user_id   = story author (fetched via JOIN to stories).
-- ============================================================================

CREATE OR REPLACE FUNCTION record_story_point_link()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO story_point_history (
    story_id,
    point_id,
    user_id,
    linked_at,
    unlinked_at,
    unlink_reason
  )
  SELECT
    NEW.story_id,
    NEW.point_id,
    s.author_id,   -- user_id = story author
    NEW.created_at, -- linked_at = when the link was created
    NULL,           -- still active
    NULL
  FROM stories s
  WHERE s.id = NEW.story_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_story_point_link_history
AFTER INSERT ON story_points
FOR EACH ROW EXECUTE FUNCTION record_story_point_link();

-- ============================================================================
-- TRIGGER 2: Cascade on point_positions DELETE
--
-- Fires AFTER DELETE on point_positions.
-- OLD.user_id  = the person whose position was just removed
-- OLD.point_id = the point they held a position on
--
-- Find all story_points where:
--   story.author_id = OLD.user_id   (the deleted user's stories)
--   story_points.point_id = OLD.point_id  (linked to the removed point)
--
-- For each matching story_point:
--   1. Insert a history row (linked_at from story_points.created_at, unlink_reason = 'position_removed')
--   2. Delete the story_points row
--
-- Order matters: INSERT history BEFORE DELETE (so we can read story_points.created_at).
-- ============================================================================

CREATE OR REPLACE FUNCTION cascade_position_removal_to_story_points()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Step 1: Insert history entries for all affected story_points BEFORE deleting them.
  -- We need story_points.created_at, so history must be written first.
  INSERT INTO story_point_history (
    story_id,
    point_id,
    user_id,
    linked_at,
    unlinked_at,
    unlink_reason
  )
  SELECT
    sp.story_id,
    sp.point_id,
    OLD.user_id,        -- the story author whose position was removed
    sp.created_at,      -- when the story-point link was originally created
    now(),              -- unlinked now
    'position_removed'
  FROM story_points sp
  JOIN stories s ON s.id = sp.story_id
  WHERE s.author_id = OLD.user_id
    AND sp.point_id  = OLD.point_id;

  -- Step 2: Delete the matching story_points rows.
  DELETE FROM story_points sp
  USING stories s
  WHERE sp.story_id = s.id
    AND s.author_id = OLD.user_id
    AND sp.point_id = OLD.point_id;

  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_position_removal
AFTER DELETE ON point_positions
FOR EACH ROW EXECUTE FUNCTION cascade_position_removal_to_story_points();
```

---

### Design decisions

**`user_id` on `story_point_history` is the story author, not the position holder.**
`story_points` has no `user_id` column — ownership is always `stories.author_id`. The history table records who owned the link (the author), not who held the position. These are often the same person but the column semantics must be clear.

**`linked_at` sources differ by trigger path.**
- INSERT trigger: `NEW.created_at` from `story_points` (the exact moment the link was made, which equals `now()` for brand-new inserts but preserves the original timestamp if a row is ever re-inserted).
- DELETE cascade trigger: `sp.created_at` from the `story_points` row being deleted — same field, same meaning.

**`unlinked_at = NULL` means the link is currently active.**
The INSERT trigger writes `unlinked_at = NULL`. This lets the history table serve as a queryable "current links" snapshot alongside `story_points`, and makes it easy to query "when was this link active?" as a time range.

**`SECURITY DEFINER` on both functions.**
Matches the existing pattern in `20260204_stories_points_calibration.sql` (`log_position_change`, `create_initial_story_version`). The trigger runs as the function owner (postgres), bypassing RLS on both `story_point_history` and `story_points`. Without `SECURITY DEFINER`, the cascade delete would fail RLS on `story_points` since there is no authenticated user in the trigger context.

**`SET search_path = public`.**
Required alongside `SECURITY DEFINER` to prevent search-path injection attacks. Matches existing trigger functions in the codebase.

**`WITH CHECK (true)` INSERT policy.**
Matches the fix in `20260216_fix_position_history_rls.sql` for `point_position_history`. Safe because this table has no PostgREST auto-insert route (the API only reads it).

**DELETE uses `USING` join, not subquery.**
`DELETE FROM story_points sp USING stories s WHERE ...` is a single scan and is consistent with how PostgreSQL handles trigger-initiated deletes. A subquery would also work but is less idiomatic.

**No `manual` unlink trigger here.**
The spec's "manual unlink → `unlink_reason = 'manual'`" requirement is handled at the application layer (P401), not in this migration. The RLS policy `"Story authors can unlink points"` (DELETE on `story_points`) already exists. P401 will either call an RPC that sets `unlink_reason`, or the app will insert the history row directly before deleting. This migration only installs the DB primitives.
