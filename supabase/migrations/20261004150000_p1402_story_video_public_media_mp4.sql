-- P1402: a story video may also be an mp4 we host in the public media bucket.
--
-- The homepage's featured story (st1) and the preparation's story step tell the same story in two
-- recordings; the founder chose one, our own clip, served from gs://claritypledge-story-images
-- (the only media origin the production CSP allows — src/lib/public-media.ts). The P1141
-- constraint allowed YouTube only.
--
-- Still an allowlist, for the reason P1141 gave: any verified profile can write this column
-- through a raw REST insert, so the host is enforced here and not only in the client. The new arm
-- admits exactly our bucket, an https URL, path characters only, ending in .mp4 — never another
-- host, never another bucket on the same origin (no ".." segments). Mirrors isPublicMediaVideo().

ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_video_url_allowlisted_host;

ALTER TABLE public.stories
  ADD CONSTRAINT stories_video_url_allowlisted_host
  CHECK (
    video_url IS NULL
    OR video_url ~ '^https://(www\.|m\.)?youtube\.com/(watch\?v=|embed/|shorts/|live/)[A-Za-z0-9_-]{11}([&?#/].*)?$'
    OR video_url ~ '^https://youtu\.be/[A-Za-z0-9_-]{11}([&?#/].*)?$'
    OR (
      video_url ~ '^https://storage\.googleapis\.com/claritypledge-story-images/[A-Za-z0-9_./-]+\.mp4$'
      -- A browser resolves "/../" in a path, which would leave the bucket.
      AND video_url !~ '\.\.'
    )
  );

COMMENT ON COLUMN public.stories.video_url IS
  'P1141/P1402: the story''s source video, or NULL — a YouTube watch URL or an mp4 in the public media bucket. Host-allowlisted by CHECK constraint.';
