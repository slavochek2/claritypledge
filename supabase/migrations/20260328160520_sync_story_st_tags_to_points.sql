-- Migration: Sync st-tags from stories to linked points
-- When a story's st-tag changes, cascade to all linked points via story_points.
-- Also backfill existing drift.

-- 1. Function: sync st-tags from a story to its linked points
CREATE OR REPLACE FUNCTION sync_story_st_tags_to_points()
RETURNS TRIGGER AS $$
DECLARE
  old_st_tags text[];
  new_st_tags text[];
  linked_point RECORD;
  point_tags_clean text[];
  point_tags_updated text[];
BEGIN
  -- Extract st-tags from OLD and NEW
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(t) INTO old_st_tags FROM unnest(OLD.tags) t WHERE t ~ '^st\d+$';
    SELECT array_agg(t) INTO new_st_tags FROM unnest(NEW.tags) t WHERE t ~ '^st\d+$';

    -- Skip if st-tags haven't changed
    IF old_st_tags IS NOT DISTINCT FROM new_st_tags THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    old_st_tags := '{}';
    SELECT array_agg(t) INTO new_st_tags FROM unnest(NEW.tags) t WHERE t ~ '^st\d+$';
  END IF;

  -- Nothing to sync if no st-tags
  IF new_st_tags IS NULL AND old_st_tags IS NULL THEN
    RETURN NEW;
  END IF;

  -- For each linked point, remove old st-tags and add new ones
  FOR linked_point IN
    SELECT p.id, p.tags
    FROM story_points sp
    JOIN points p ON p.id = sp.point_id
    WHERE sp.story_id = NEW.id
  LOOP
    -- Remove all st-tags that came from the old story
    SELECT COALESCE(array_agg(t), '{}') INTO point_tags_clean
    FROM unnest(linked_point.tags) t
    WHERE NOT (t ~ '^st\d+$' AND (old_st_tags IS NOT NULL AND t = ANY(old_st_tags)));

    -- Add new st-tags (if not already present)
    IF new_st_tags IS NOT NULL THEN
      SELECT array_agg(DISTINCT t ORDER BY t) INTO point_tags_updated
      FROM (
        SELECT unnest(point_tags_clean) AS t
        UNION
        SELECT unnest(new_st_tags) AS t
      ) sub;
    ELSE
      point_tags_updated := point_tags_clean;
    END IF;

    -- Update point if tags changed
    IF point_tags_updated IS DISTINCT FROM linked_point.tags THEN
      UPDATE points SET tags = point_tags_updated WHERE id = linked_point.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger: fire after story tags change
DROP TRIGGER IF EXISTS trg_sync_story_st_tags_to_points ON stories;
CREATE TRIGGER trg_sync_story_st_tags_to_points
  AFTER INSERT OR UPDATE OF tags, content ON stories
  FOR EACH ROW
  EXECUTE FUNCTION sync_story_st_tags_to_points();

-- 3. Backfill: sync all existing story st-tags to their linked points
-- For each linked point, add the story's st-tags if missing
WITH story_st AS (
  SELECT s.id AS story_id, array_agg(t) AS st_tags
  FROM stories s, unnest(s.tags) t
  WHERE t ~ '^st\d+$'
  GROUP BY s.id
),
point_needs_update AS (
  SELECT sp.point_id,
         p.tags AS current_tags,
         array_agg(DISTINCT all_tags.t ORDER BY all_tags.t) AS desired_tags
  FROM story_points sp
  JOIN story_st ss ON ss.story_id = sp.story_id
  JOIN points p ON p.id = sp.point_id
  CROSS JOIN LATERAL (
    -- existing non-st tags from point
    SELECT unnest(p.tags) AS t
    UNION
    -- st-tags from the linked story
    SELECT unnest(ss.st_tags) AS t
  ) all_tags
  GROUP BY sp.point_id, p.tags
  HAVING array_agg(DISTINCT all_tags.t ORDER BY all_tags.t) IS DISTINCT FROM p.tags
)
UPDATE points p
SET tags = pnu.desired_tags
FROM point_needs_update pnu
WHERE p.id = pnu.point_id;
