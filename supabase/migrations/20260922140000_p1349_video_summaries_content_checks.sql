-- P1349 edge-case review: the table accepted rows the app can never show correctly.
--
-- 1. video_id: YouTube ids are exactly 11 characters, and that is all src/lib/video.ts parses.
--    A 6–20 char id could be confirmed, yet no player would ever link to it and the page's player
--    would reject it. NOT VALID: enforced on every new or updated row; pre-existing test-only rows
--    from the integration suite (never confirmed) are left as they are.
-- 2. Blank text: a confirmed summary could have an empty title, channel, summary or key point,
--    rendering headed sections with nothing under them.
--
-- Moment entries ({t, note}) are validated in the client (cleanMoments) — a CHECK cannot iterate
-- a jsonb array without a helper function, and the page must not crash on bad data either way.

ALTER TABLE public.video_summaries
  DROP CONSTRAINT IF EXISTS video_summaries_video_id_check;

ALTER TABLE public.video_summaries
  ADD CONSTRAINT video_summaries_video_id_youtube_shape
  CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$') NOT VALID;

ALTER TABLE public.video_summaries
  ADD CONSTRAINT video_summaries_text_not_blank
  CHECK (
    btrim(title) <> ''
    AND btrim(channel) <> ''
    AND btrim(summary) <> ''
    AND array_position(key_points, NULL) IS NULL
    AND array_position(key_points, '') IS NULL
  );
