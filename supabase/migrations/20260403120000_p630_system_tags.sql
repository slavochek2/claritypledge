-- P630: Separate system tags from user tags.
-- Single transaction: add column, backfill, update triggers, protect, cleanup.

BEGIN;

-- ============================================================================
-- 1. Add system_tags column to stories and points
-- ============================================================================

ALTER TABLE stories ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE points  ADD COLUMN IF NOT EXISTS system_tags text[] NOT NULL DEFAULT '{}';

-- ============================================================================
-- 2. Backfill: move system-pattern tags from tags to system_tags
-- System tag patterns: st\d+, v\d+, understanding, misunderstanding
-- ============================================================================

-- Stories: extract system tags, keep only user tags in tags
UPDATE stories SET
  system_tags = COALESCE((
    SELECT array_agg(t ORDER BY t)
    FROM unnest(tags) t
    WHERE lower(t) ~ '^st\d+$' OR lower(t) ~ '^v\d+$'
       OR lower(t) = 'understanding' OR lower(t) = 'misunderstanding'
  ), '{}'),
  tags = COALESCE((
    SELECT array_agg(t ORDER BY t)
    FROM unnest(tags) t
    WHERE NOT (lower(t) ~ '^st\d+$' OR lower(t) ~ '^v\d+$'
       OR lower(t) = 'understanding' OR lower(t) = 'misunderstanding')
  ), '{}')
WHERE array_length(tags, 1) > 0;

-- Points: same separation
UPDATE points SET
  system_tags = COALESCE((
    SELECT array_agg(t ORDER BY t)
    FROM unnest(tags) t
    WHERE lower(t) ~ '^st\d+$' OR lower(t) ~ '^v\d+$'
       OR lower(t) = 'understanding' OR lower(t) = 'misunderstanding'
  ), '{}'),
  tags = COALESCE((
    SELECT array_agg(t ORDER BY t)
    FROM unnest(tags) t
    WHERE NOT (lower(t) ~ '^st\d+$' OR lower(t) ~ '^v\d+$'
       OR lower(t) = 'understanding' OR lower(t) = 'misunderstanding')
  ), '{}')
WHERE array_length(tags, 1) > 0;

-- ============================================================================
-- 3. Update extract_hashtags_from_content() to only write user tags to tags
--    Preserves system_tags untouched.
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_hashtags_from_content()
RETURNS trigger AS $$
BEGIN
  -- Extract all hashtags from content, then filter out system tag patterns
  NEW.tags := COALESCE((
    SELECT array_agg(DISTINCT tag ORDER BY tag)
    FROM (
      SELECT lower(m[1]) AS tag
      FROM regexp_matches(NEW.content, '#(\w+)', 'g') AS m
    ) extracted
    WHERE NOT (tag ~ '^st\d+$' OR tag ~ '^v\d+$'
       OR tag = 'understanding' OR tag = 'misunderstanding')
  ), '{}');
  -- system_tags is NOT touched — only triggers/migrations modify it
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. Update sync_story_st_tags_to_points() to read/write system_tags
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_story_st_tags_to_points()
RETURNS TRIGGER AS $$
DECLARE
  old_st_tags text[];
  new_st_tags text[];
  linked_point RECORD;
  point_sys_clean text[];
  point_sys_updated text[];
BEGIN
  -- Extract st-tags from OLD and NEW system_tags
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(t) INTO old_st_tags FROM unnest(OLD.system_tags) t WHERE t ~ '^st\d+$';
    SELECT array_agg(t) INTO new_st_tags FROM unnest(NEW.system_tags) t WHERE t ~ '^st\d+$';

    -- Skip if st-tags haven't changed
    IF old_st_tags IS NOT DISTINCT FROM new_st_tags THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    old_st_tags := '{}';
    SELECT array_agg(t) INTO new_st_tags FROM unnest(NEW.system_tags) t WHERE t ~ '^st\d+$';
  END IF;

  -- Nothing to sync if no st-tags
  IF new_st_tags IS NULL AND old_st_tags IS NULL THEN
    RETURN NEW;
  END IF;

  -- For each linked point, remove old st-tags and add new ones in system_tags
  FOR linked_point IN
    SELECT p.id, p.system_tags
    FROM story_points sp
    JOIN points p ON p.id = sp.point_id
    WHERE sp.story_id = NEW.id
  LOOP
    -- Remove all st-tags that came from the old story
    SELECT COALESCE(array_agg(t), '{}') INTO point_sys_clean
    FROM unnest(linked_point.system_tags) t
    WHERE NOT (t ~ '^st\d+$' AND (old_st_tags IS NOT NULL AND t = ANY(old_st_tags)));

    -- Add new st-tags (if not already present)
    IF new_st_tags IS NOT NULL THEN
      SELECT array_agg(DISTINCT t ORDER BY t) INTO point_sys_updated
      FROM (
        SELECT unnest(point_sys_clean) AS t
        UNION
        SELECT unnest(new_st_tags) AS t
      ) sub;
    ELSE
      point_sys_updated := point_sys_clean;
    END IF;

    -- Update point system_tags if changed
    IF point_sys_updated IS DISTINCT FROM linked_point.system_tags THEN
      UPDATE points SET system_tags = point_sys_updated WHERE id = linked_point.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update the trigger to fire on system_tags changes instead of tags
DROP TRIGGER IF EXISTS trg_sync_story_st_tags_to_points ON stories;
CREATE TRIGGER trg_sync_story_st_tags_to_points
  AFTER INSERT OR UPDATE OF system_tags ON stories
  FOR EACH ROW
  EXECUTE FUNCTION sync_story_st_tags_to_points();

-- ============================================================================
-- 5. Protect system_tags from direct client modification
-- ============================================================================

CREATE OR REPLACE FUNCTION protect_system_tags()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow changes from SECURITY DEFINER functions (triggers, migrations)
  -- Block direct client updates to system_tags
  IF current_setting('role', true) = 'authenticated'
     AND OLD.system_tags IS DISTINCT FROM NEW.system_tags THEN
    -- Restore system_tags to the old value — silently prevent client mutation
    NEW.system_tags := OLD.system_tags;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_system_tags_stories ON stories;
CREATE TRIGGER trg_protect_system_tags_stories
  BEFORE UPDATE ON stories
  FOR EACH ROW
  EXECUTE FUNCTION protect_system_tags();

DROP TRIGGER IF EXISTS trg_protect_system_tags_points ON points;
CREATE TRIGGER trg_protect_system_tags_points
  BEFORE UPDATE ON points
  FOR EACH ROW
  EXECUTE FUNCTION protect_system_tags();

-- ============================================================================
-- 6. Cleanup: remove motivation and deprecated from both columns on both tables
-- ============================================================================

-- Remove from tags (user tags)
UPDATE stories SET tags = array_remove(array_remove(tags, 'motivation'), 'deprecated')
WHERE tags && ARRAY['motivation', 'deprecated'];

UPDATE points SET tags = array_remove(array_remove(tags, 'motivation'), 'deprecated')
WHERE tags && ARRAY['motivation', 'deprecated'];

-- Remove from system_tags (should not be there, but belt-and-suspenders)
UPDATE stories SET system_tags = array_remove(array_remove(system_tags, 'motivation'), 'deprecated')
WHERE system_tags && ARRAY['motivation', 'deprecated'];

UPDATE points SET system_tags = array_remove(array_remove(system_tags, 'motivation'), 'deprecated')
WHERE system_tags && ARRAY['motivation', 'deprecated'];

COMMIT;
