-- P751 backfill: populate imageUrl in existing letter_story_snapshots.
--
-- IMMUTABILITY CAVEAT: Uses CURRENT stories.image_url — if author changed
-- the image post-seal, recipient will see the new one (violates sealed=frozen
-- contract). Mitigated because prod sealed-letter count ~0 at time of P751.
--
-- ALWAYS: state env + confirm dry-run count before running the UPDATE.
-- Per .claude/rules/db-access.md: destructive ops require env + intent confirmation.

-- 1. Dry run — count rows that would be updated
SELECT COUNT(*) AS rows_to_update
FROM letter_story_snapshots lss
JOIN stories s ON s.id = lss.story_id
WHERE s.image_url IS NOT NULL
  AND (lss.point_config->>'imageUrl') IS NULL;

-- 2. Apply (confirm count above first; state env explicitly)
-- UPDATE letter_story_snapshots lss
-- SET point_config = lss.point_config || jsonb_build_object('imageUrl', s.image_url)
-- FROM stories s
-- WHERE lss.story_id = s.id
--   AND s.image_url IS NOT NULL
--   AND (lss.point_config->>'imageUrl') IS NULL;
