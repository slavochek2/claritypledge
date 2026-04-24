-- P800: Backfill points.superseded_by from v<N> + misunderstanding system_tags.
--
-- For each (st-tag, misunderstanding-presence) partition, chain points in
-- version order: v1.superseded_by = v2.id, v2.superseded_by = v3.id, …
-- The highest version keeps superseded_by = NULL (the head).
--
-- Points without BOTH an st-tag AND a v-tag are skipped — they are not part
-- of any version chain. v<N> and misunderstanding system_tags are preserved
-- (decorative; the rendering layer still shows them as pills).
--
-- Idempotent via `points.superseded_by IS NULL` guard — re-running leaves
-- already-wired rows untouched.

BEGIN;

-- ============================================================================
-- 1. Disable the invariant trigger during bulk backfill
-- ============================================================================
-- Each individual UPDATE we emit is valid in isolation, but Postgres does
-- not guarantee row-processing order within a single UPDATE ... FROM
-- statement. If the trigger fires on v2's update (setting v2→v3) before
-- v1's update (setting v1→v2), it spuriously rejects v1's write because
-- v2 is no longer a head at that instant. We disable the trigger for this
-- one bulk write, then re-enable and validate invariants hold post-write.

ALTER TABLE points DISABLE TRIGGER trg_enforce_supersede_invariants;

-- ============================================================================
-- 2. Backfill chains via LEAD over versioned partitions
-- ============================================================================

WITH versioned AS (
  SELECT
    p.id,
    (SELECT t
       FROM unnest(p.system_tags) t
       WHERE t ~ '^st\d+$'
       LIMIT 1)                                  AS st_tag,
    'misunderstanding' = ANY(p.system_tags)      AS has_misunderstanding,
    (SELECT (substring(t FROM 2))::INTEGER
       FROM unnest(p.system_tags) t
       WHERE t ~ '^v\d+$'
       ORDER BY t
       LIMIT 1)                                  AS version
  FROM points p
  WHERE EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^v\d+$')
    AND EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^st\d+$')
),
ordered AS (
  SELECT
    id, st_tag, has_misunderstanding, version,
    LEAD(id) OVER (
      PARTITION BY st_tag, has_misunderstanding
      ORDER BY version NULLS LAST
    ) AS next_id
  FROM versioned
)
UPDATE points
SET    superseded_by = ordered.next_id
FROM   ordered
WHERE  points.id = ordered.id
  AND  ordered.next_id IS NOT NULL
  AND  points.superseded_by IS NULL;

-- ============================================================================
-- 3. Re-enable the invariant trigger
-- ============================================================================

ALTER TABLE points ENABLE TRIGGER trg_enforce_supersede_invariants;

-- ============================================================================
-- 4. Validate: exactly one head per (st-tag, variant)
-- ============================================================================

DO $$
DECLARE
  bad_groups INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_groups
  FROM (
    SELECT
      (SELECT t FROM unnest(p.system_tags) t WHERE t ~ '^st\d+$' LIMIT 1) AS st_tag,
      'misunderstanding' = ANY(p.system_tags)                             AS has_mu
    FROM points p
    WHERE p.superseded_by IS NULL
      AND EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^st\d+$')
      AND EXISTS (SELECT 1 FROM unnest(p.system_tags) t WHERE t ~ '^v\d+$')
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) dup;

  IF bad_groups > 0 THEN
    RAISE EXCEPTION
      'P800 backfill validation failed: % (st-tag, variant) groups have > 1 head after backfill',
      bad_groups;
  END IF;
END $$;

COMMIT;
