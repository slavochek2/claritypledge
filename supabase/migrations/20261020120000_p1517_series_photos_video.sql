-- P1517: a series_photos row may be a short video served from the public media bucket (GCS).
-- Additive: existing rows default to 'photo' and are untouched. A video row needs a poster, and
-- both URLs must sit in the bucket (mirrors the P1402 story-video CHECK and isPublicMediaVideo()).
ALTER TABLE public.series_photos
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'photo'
    CHECK (media_type IN ('photo', 'video')),
  ADD COLUMN IF NOT EXISTS poster_url text;

ALTER TABLE public.series_photos
  DROP CONSTRAINT IF EXISTS series_photos_video_requires_poster_and_bucket;
ALTER TABLE public.series_photos
  ADD CONSTRAINT series_photos_video_requires_poster_and_bucket CHECK (
    media_type = 'photo'
    OR (
      poster_url IS NOT NULL
      AND storage_url ~ '^https://storage\.googleapis\.com/claritypledge-story-images/[A-Za-z0-9_./-]+\.mp4$'
      AND storage_url !~ '\.\.'
      AND poster_url ~ '^https://storage\.googleapis\.com/claritypledge-story-images/[A-Za-z0-9_./-]+\.(jpe?g|png|webp)$'
      AND poster_url !~ '\.\.'
    )
  );
