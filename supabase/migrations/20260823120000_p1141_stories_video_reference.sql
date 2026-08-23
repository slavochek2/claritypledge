-- P1141: a story carries a video instead of a picture.
--
-- One stored field: the canonical watch URL. Player, thumbnail and the
-- open-at-timestamp fallback are all re-derived from it (src/lib/video.ts), so
-- no two stored fields can drift apart.
--
-- The two existing image columns are deliberately untouched — one feeds the
-- sealed-letter path, and retiring either is separate work.

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS video_url TEXT;

-- The stories INSERT policy is row-scoped and constrains no column's *value*:
-- any authenticated, verified profile can set this column to an arbitrary
-- string through a raw REST insert. The UI not exposing an input is not an
-- enforcement boundary, so the host allowlist is enforced here as well as in
-- parseVideoUrl(). A format constraint is agnostic to who sets the value — it
-- is required *because* the door to a user-facing paste-a-URL field is meant to
-- open later, not despite it.
ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_video_url_allowlisted_host;

ALTER TABLE public.stories
  ADD CONSTRAINT stories_video_url_allowlisted_host
  CHECK (
    video_url IS NULL
    OR video_url ~ '^https://(www\.|m\.)?youtube\.com/(watch\?v=|embed/|shorts/|live/)[A-Za-z0-9_-]{11}([&?#/].*)?$'
    OR video_url ~ '^https://youtu\.be/[A-Za-z0-9_-]{11}([&?#/].*)?$'
  );

-- Quotes, their per-quote timecodes, and the video's duration travel together.
-- The empty shape is the default so every read path sees the same object
-- whether or not a story has quotes.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS video_quotes JSONB NOT NULL
  DEFAULT '{"quotes": [], "durationSeconds": null}'::jsonb;

COMMENT ON COLUMN public.stories.video_url IS
  'P1141: canonical watch URL of the story''s source video, or NULL. Host-allowlisted by CHECK constraint.';
COMMENT ON COLUMN public.stories.video_quotes IS
  'P1141: {quotes: {text, seconds}[], durationSeconds: number|null}. Timecodes resolve from the retained raw .vtt (P1140), never the cleaned ~30s transcript.';
