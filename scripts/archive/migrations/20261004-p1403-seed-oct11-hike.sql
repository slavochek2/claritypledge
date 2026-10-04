-- P1403 seed — NOT APPLIED. Run by hand (service role / SQL editor) AFTER
-- supabase/migrations/20261004093000_p1403_social_hike_series.sql is live, test first.
--
-- Every <PLACEHOLDER> must be replaced before running. The review text, reviewer name and
-- profile path, and the photo object paths are private inputs (the founder holds them);
-- they are deliberately not in this public repo. Stats below are the values quoted in the
-- spec from the AllTrails page — re-read them from the trail before running.
-- Idempotent: the UPDATE targets one event; the INSERTs skip rows that already exist.

BEGIN;

-- 1. The 2026-10-11 Social Hike: series key + stats strip (+ optional OSM route).
UPDATE public.events
   SET series_slug  = 'social-hike',
       hike_details = jsonb_build_object(
         'distance_km',       11.7,
         'elevation_gain_m',  539,
         'route_type',        'Loop',
         'walk_time_text',    '4–4.5 h',
         'difficulty',        'Moderate',
         'meet_walk_minutes', <MEASURED_CAFE_TO_TRAILHEAD_MINUTES>,
         'meet_walk_url',     '<OSM_FOOT_ROUTE_URL from select-hike>'
       )
       -- , route_geojson = '<GeoJSON FeatureCollection from OSM ways — never AllTrails>'::jsonb
 WHERE title ILIKE 'Social Hike%'
   AND (datetime AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-10-11';
-- Expect exactly 1 row. If 0 or >1, ROLLBACK and target by slug instead.

-- 2. First review (founder confirmed for publishing; profile link agreed — Resolved Decision 6).
--    Linked by author_profile_id so the card shows the reviewer's avatar and links to them
--    (Codex review 2026-10-04: a path alone renders no avatar). Fails if the slug is unknown.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE slug = '<reviewer-slug>') THEN
    RAISE EXCEPTION 'reviewer profile <reviewer-slug> not found';
  END IF;
END $$;
INSERT INTO public.series_reviews (series_slug, quote, author_name, author_profile_id, sort_order)
SELECT 'social-hike', '<SHORTENED ENGLISH REVIEW>', '<REVIEWER FIRST NAME>',
       (SELECT id FROM public.profiles WHERE slug = '<reviewer-slug>'), 10
 WHERE NOT EXISTS (
   SELECT 1 FROM public.series_reviews
    WHERE series_slug = 'social-hike' AND author_name = '<REVIEWER FIRST NAME>'
 );

-- 3. Photos: mirror every row of test series_photos (15 as of 2026-10-04, social shots first, snake removed;
--    founder chose to include faces). Rows below are the original four, uploaded to
--    gs://claritypledge-story-images (P1385) — the only image host prod CSP allows for them.
INSERT INTO public.series_photos (series_slug, storage_url, alt, credit, sort_order)
SELECT v.series_slug, v.storage_url, v.alt, v.credit, v.sort_order
  FROM (VALUES
    ('social-hike', 'https://storage.googleapis.com/claritypledge-story-images/hikes/<photo-12>.jpg', '<alt text 12>', NULL, 10),
    ('social-hike', 'https://storage.googleapis.com/claritypledge-story-images/hikes/<photo-13>.jpg', '<alt text 13>', NULL, 20),
    ('social-hike', 'https://storage.googleapis.com/claritypledge-story-images/hikes/<photo-14>.jpg', '<alt text 14>', NULL, 30),
    ('social-hike', 'https://storage.googleapis.com/claritypledge-story-images/hikes/<photo-15>.jpg', '<alt text 15>', NULL, 40)
  ) AS v(series_slug, storage_url, alt, credit, sort_order)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.series_photos p WHERE p.storage_url = v.storage_url
 );

-- Verify before COMMIT:
-- SELECT slug, series_slug, hike_details FROM public.events WHERE series_slug = 'social-hike' ORDER BY datetime DESC LIMIT 3;
-- SELECT count(*) FROM public.series_reviews WHERE series_slug = 'social-hike';
-- SELECT count(*) FROM public.series_photos  WHERE series_slug = 'social-hike';

COMMIT;
