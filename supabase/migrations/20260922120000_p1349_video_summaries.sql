-- P1349: one neutral summary per source video, linked from every story drawn from it.
--
-- The per-video identity the falsify review asked for (finding 1): provider + video id,
-- unique. Before this the only identity was stories.video_url, normalised client-side.
-- The row owns the summary, its provenance and its review status.
--
-- Status is a one-way ladder, and only the last rung is public:
--   draft      written by the generator, not yet checked
--   checked    an agent that did not write it verified every timestamp and attribution
--              against the retained transcript
--   confirmed  the operator checked it against the video (same rule as machine stories)
-- Anon and signed-in readers see confirmed rows only, so the "Read video summary" link and
-- the /video/:id page can never surface an unchecked summary. Writes are service-role only:
-- no INSERT/UPDATE/DELETE policy exists.

CREATE TABLE public.video_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'youtube' CHECK (provider IN ('youtube')),
  video_id text NOT NULL CHECK (video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  title text NOT NULL,
  channel text NOT NULL,
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  tldr text,
  summary text NOT NULL,
  -- 3 short key points (founder decision); the page numbers them.
  key_points text[] NOT NULL CHECK (cardinality(key_points) BETWEEN 1 AND 3),
  -- [{ "t": seconds (int), "note": text }], ordered by t.
  moments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(moments) = 'array'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'checked', 'confirmed')),
  written_by text,
  checked_by text,
  checked_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, video_id),
  CHECK (status <> 'confirmed' OR (checked_at IS NOT NULL AND confirmed_at IS NOT NULL)),
  -- Writer and checker must differ (invariant: checked by an agent that did not write it).
  CHECK (checked_by IS NULL OR written_by IS NULL OR checked_by <> written_by)
);

COMMENT ON TABLE public.video_summaries IS
  'P1349: one AI-written, operator-confirmed summary per source video. Public reads see status=confirmed only.';

ALTER TABLE public.video_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY video_summaries_public_read_confirmed
  ON public.video_summaries
  FOR SELECT
  TO anon, authenticated
  USING (status = 'confirmed');

GRANT SELECT ON public.video_summaries TO anon, authenticated;
