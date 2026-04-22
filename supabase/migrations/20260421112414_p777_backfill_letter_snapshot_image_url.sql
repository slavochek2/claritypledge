-- p777: Backfill imageUrl into pre-P751 letter_story_snapshots.point_config.
--
-- Root cause: seal_and_send_letter began writing 'imageUrl' into point_config
-- only from P751 (20260418120000). Letters sealed before that date have no
-- imageUrl key → mapper returns undefined → story image fails to render.
--
-- Scope: only rows whose source story has a real image_url AND whose snapshot
-- lacks the key. Skipping NULL/empty sources avoids writing "" placeholders,
-- keeps the migration idempotent, and lets the reader's `|| undefined`
-- fallthrough keep working for image-less stories.
--
-- Idempotency: re-running is a no-op — WHERE clause excludes rows already
-- carrying the key, and rows whose source image is still NULL stay absent.

BEGIN;

UPDATE letter_story_snapshots lss
SET point_config = jsonb_set(
  lss.point_config,
  '{imageUrl}',
  to_jsonb(s.image_url)
)
FROM stories s
WHERE s.id = lss.story_id
  AND s.image_url IS NOT NULL
  AND s.image_url <> ''
  AND NOT (lss.point_config ? 'imageUrl');

COMMIT;
