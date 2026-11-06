-- new function: resolve_series_alias
-- client-safe: additive only. A new table and a new function; the REVOKEs apply to those new objects only, and no
--   deployed client calls either until the redirect change ships (which must follow this migration on prod).
--
-- P1649: series short links (/hike, /night, /next, /drum, /sales, ...) resolve hidden events too.
--
-- WHAT CHANGES (additive; nothing on public.events is touched)
--   1. public.series_aliases: one row per alias key, holding the rule that key matches. CLOSED to the public key:
--      RLS on with no policy, and every privilege revoked from PUBLIC, anon and authenticated. A writable or readable
--      alias table would let a stranger add a '%' rule and walk every hidden event.
--   2. public.resolve_series_alias(p_key text) RETURNS text: alias key in, one slug out (NULL when nothing matches).
--      SECURITY DEFINER with an empty search_path, because P1603's row rule hides hidden events from anon. The caller
--      supplies ONLY the key: no pattern, no series value, no cutoff. The 5-hour grace cutoff is computed here.
--
-- PRECEDENCE (founder default 2026-11-06, see spec): across the WHOLE chain, public events first, then hidden ones.
--   Within one visibility: the alias's own rule before its fallback, then nearest datetime, then id (deterministic).
--   One fallback hop only; the fallback's own fallback is never followed, so a bad row cannot loop.
--
-- DELIBERATE RELAXATION of decisions.md 2026-11-03 [technical] ("A hidden event is enforced by the database"):
--   anyone who knows an alias word on this list learns the slug of that series' next hidden event. Nothing else leaves.

CREATE TABLE IF NOT EXISTS public.series_aliases (
  key            text PRIMARY KEY CHECK (key ~ '^[a-z0-9-]{1,40}$'),
  title_pattern  text,
  series_slug    text,
  topic_unset    boolean NOT NULL DEFAULT false,
  fallback_key   text REFERENCES public.series_aliases(key),
  CONSTRAINT series_aliases_one_rule CHECK ((title_pattern IS NULL) <> (series_slug IS NULL)),
  CONSTRAINT series_aliases_no_self_fallback CHECK (fallback_key IS NULL OR fallback_key <> key)
);

COMMENT ON TABLE public.series_aliases IS
  'P1649: the rule behind each series short link. Closed to anon/authenticated; read only by resolve_series_alias.';

ALTER TABLE public.series_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.series_aliases FROM PUBLIC;
REVOKE ALL ON TABLE public.series_aliases FROM anon, authenticated;

-- Seed: today's rules from api/series-redirect.ts, unchanged, plus sales and drum. Fallback targets first.
INSERT INTO public.series_aliases (key, title_pattern, series_slug, topic_unset, fallback_key) VALUES
  ('ai-run',               'AI Running Club%',       NULL,           false, NULL),
  ('hike',                 '%Hike%',                 NULL,           false, NULL),
  ('aisafety',             '%AI Safety%',            NULL,           false, NULL),
  ('night',                'Clarity Night%',         NULL,           false, NULL),
  ('spiritual-revolution', 'A Spiritual Revolution%', NULL,          false, NULL),
  ('sales',                'Sales Mastermind%',      NULL,           false, NULL),
  ('drum',                 NULL,                     'drum-circle',  false, NULL),
  ('next',                 NULL,                     'clarity-night', true, 'night')
ON CONFLICT (key) DO NOTHING;  -- a re-apply never overwrites a rule changed later as a reviewed data change

CREATE OR REPLACE FUNCTION public.resolve_series_alias(p_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH steps AS (
    SELECT a.title_pattern, a.series_slug, a.topic_unset, 1 AS ord
      FROM public.series_aliases a
     WHERE a.key = p_key
    UNION ALL
    SELECT f.title_pattern, f.series_slug, f.topic_unset, 2 AS ord
      FROM public.series_aliases a
      JOIN public.series_aliases f ON f.key = a.fallback_key
     WHERE a.key = p_key
  )
  SELECT e.slug
    FROM steps s
    JOIN public.events e
      ON (s.title_pattern IS NULL OR e.title ILIKE s.title_pattern)
     AND (s.series_slug  IS NULL OR e.series_slug = s.series_slug)
     AND (NOT s.topic_unset OR e.statement_tag IS NULL)
   WHERE e.status = 'upcoming'
     AND e.datetime > now() - interval '5 hours'
     AND e.slug IS NOT NULL
   ORDER BY e.is_hidden, s.ord, e.datetime, e.id
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_series_alias(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_series_alias(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_series_alias(text) TO anon, authenticated, service_role;

-- Fail the apply if the grants are not exactly what the boundary needs.
DO $$
DECLARE
  r text;
  p text;
BEGIN
  IF NOT has_function_privilege('anon', 'public.resolve_series_alias(text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.resolve_series_alias(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1649: resolve_series_alias must be executable by anon and authenticated';
  END IF;
  IF has_function_privilege('public', 'public.resolve_series_alias(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1649: resolve_series_alias must not be executable through PUBLIC';
  END IF;
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.resolve_series_alias(text)'::regprocedure) THEN
    RAISE EXCEPTION 'P1649: resolve_series_alias must be SECURITY DEFINER';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.series_aliases'::regclass) THEN
    RAISE EXCEPTION 'P1649: series_aliases must have row level security enabled';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(r, 'public.series_aliases', p) THEN
        RAISE EXCEPTION 'P1649: % must not hold % on series_aliases', r, p;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
