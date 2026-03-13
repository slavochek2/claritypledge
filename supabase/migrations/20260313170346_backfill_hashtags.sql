-- P506: Backfill hashtags from story content and point statements
-- Extracts #word patterns, deduplicates, lowercases, and stores in tags array.
-- Only updates rows with empty tags (preserves existing manually-set tags).
-- Idempotent: safe to run multiple times.

-- Backfill stories
UPDATE stories
SET tags = (
  SELECT COALESCE(
    array_agg(DISTINCT lower(m[1])) FILTER (WHERE m[1] IS NOT NULL),
    '{}'
  )
  FROM regexp_matches(content, '#(\w+)', 'g') AS m
)
WHERE tags = '{}' OR tags IS NULL;

-- Backfill points
UPDATE points
SET tags = (
  SELECT COALESCE(
    array_agg(DISTINCT lower(m[1])) FILTER (WHERE m[1] IS NOT NULL),
    '{}'
  )
  FROM regexp_matches(statement, '#(\w+)', 'g') AS m
)
WHERE tags = '{}' OR tags IS NULL;
