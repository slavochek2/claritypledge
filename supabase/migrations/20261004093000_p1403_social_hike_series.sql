-- P1403: Social Hike event layout — series key, structured hike stats, route geometry,
-- and series-level reviews + photos.
-- client-safe: additive only — new nullable columns on events and two new tables. Deployed
-- clients select `events.*` and ignore unknown keys; the REVOKEs below apply to brand-new
-- tables no deployed client reads.
--
-- Shape decisions (Resolved Decisions 1 and 2 in features/p1403_social_hike_event_layout.md):
--
-- * series_slug — a stored key, never the title prefix. Layout selection and the
--   reviews/photos join both read it. The prefix drifted once already (2026-08-24).
--
-- * hike_details jsonb, NOT seven typed columns. The stats strip is a hike-only display
--   snapshot (distance, climb, route type, walk time, difficulty, cafe-to-trailhead walk),
--   written once by /slava:events:publish-run and never queried, filtered or aggregated.
--   Seven nullable columns would sit empty on every non-hike event of a generic table and
--   each future stat would need another migration. The client validates every key it reads
--   (src/app/prototypes/events/hike/hike-utils.ts) so a malformed value hides, never crashes.
--   Keys: distance_km (number), elevation_gain_m (number), route_type (text),
--   walk_time_text (text), difficulty (text), meet_walk_minutes (number), meet_walk_url (text).
--
-- * route_geojson jsonb — separate from hike_details because it is a different kind of
--   thing (geometry, potentially kilobytes) with its own provenance rule: snapshotted from
--   OpenStreetMap ways only, never AllTrails geometry. Rendered client-side as an SVG; no
--   map tiles, no CSP change.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS series_slug text,
  ADD COLUMN IF NOT EXISTS hike_details jsonb,
  ADD COLUMN IF NOT EXISTS route_geojson jsonb;

-- Re-runnable: drop-then-add (review 2026-10-04).
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_hike_details_is_object,
  DROP CONSTRAINT IF EXISTS events_route_geojson_is_object;
ALTER TABLE public.events
  ADD CONSTRAINT events_hike_details_is_object
    CHECK (hike_details IS NULL OR jsonb_typeof(hike_details) = 'object'),
  ADD CONSTRAINT events_route_geojson_is_object
    CHECK (route_geojson IS NULL OR jsonb_typeof(route_geojson) = 'object');

CREATE INDEX IF NOT EXISTS events_series_slug_idx
  ON public.events (series_slug) WHERE series_slug IS NOT NULL;

-- Backfill: every existing Social Hike (and its pre-rename "Clarity Hike" title).
UPDATE public.events
   SET series_slug = 'social-hike'
 WHERE series_slug IS NULL
   AND (title ILIKE 'Social Hike%' OR title ILIKE 'Clarity Hike%');

-- ---------------------------------------------------------------------------
-- series_reviews — attach to the series, so they appear on every future hike.
-- Writes are service-role only (no upload/moderation UI — spec Non-Goals).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.series_reviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_slug         text NOT NULL,
  quote               text NOT NULL CHECK (char_length(btrim(quote)) BETWEEN 1 AND 2000),
  author_name         text NOT NULL CHECK (char_length(btrim(author_name)) BETWEEN 1 AND 120),
  -- Link only when the reviewer agreed to it (Resolved Decision 6). An in-app path
  -- like /p/<slug>; the client renders it only when it starts with a single "/".
  author_profile_path text,
  sort_order          integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS series_reviews_series_idx
  ON public.series_reviews (series_slug, sort_order);

ALTER TABLE public.series_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.series_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.series_reviews TO anon, authenticated;

DROP POLICY IF EXISTS "Series reviews are public" ON public.series_reviews;
CREATE POLICY "Series reviews are public"
  ON public.series_reviews FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- series_photos — public media lives on GCS (P1385); storage_url is a full
-- https://storage.googleapis.com/... URL, the only image host prod CSP allows for it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.series_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_slug  text NOT NULL,
  storage_url  text NOT NULL CHECK (storage_url ~ '^https://'),
  alt          text NOT NULL CHECK (char_length(btrim(alt)) BETWEEN 1 AND 300),
  credit       text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS series_photos_series_idx
  ON public.series_photos (series_slug, sort_order);

ALTER TABLE public.series_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.series_photos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.series_photos TO anon, authenticated;

DROP POLICY IF EXISTS "Series photos are public" ON public.series_photos;
CREATE POLICY "Series photos are public"
  ON public.series_photos FOR SELECT
  TO anon, authenticated
  USING (true);
