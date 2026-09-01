-- new function: get_pledgers_page (no prior version to diff against)
-- P1229: paginated accessor for /pledgers.
--
-- Root cause (P1229 D1/D2): getVerifiedProfiles() called get_featured_profiles(p_limit := NULL)
-- — the FULL verified+pledged set (~5.2k rows in prod) — then issued
-- `witnesses?profile_id=in.(<every id>)`, a URL the gateway refuses
-- (net::ERR_HTTP2_PROTOCOL_ERROR), and rendered every row into one grid.
--
-- This function returns ONE page plus the total, ordered exactly as the client used to
-- sort (profiles with a non-empty reason first, then newest first), with the same row
-- shape and the same eligibility filters as get_featured_profiles (P877). Same PII
-- posture: every row is verified+pledged, so linkedin_url/reason are public by design;
-- email is never returned. SECURITY DEFINER + `SET search_path = ''` per decisions.md
-- 2026-05-31.
--
-- p_limit is clamped to 1..100 server-side so a client can never re-create the
-- unbounded fetch by passing NULL or a huge number.
--
-- client-safe: additive — new function only; get_featured_profiles is untouched, so
-- deployed clients keep working.

CREATE OR REPLACE FUNCTION public.get_pledgers_page(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT p.*
    FROM public.profiles p
    WHERE p.is_verified = true
      AND p.has_pledged = true
      AND COALESCE(p.is_test_account, false) = false
  ),
  page AS (
    SELECT *
    FROM eligible e
    -- id tiebreaker: rows share created_at (bulk imports, test fixtures); without it
    -- consecutive pages overlap and skip rows.
    ORDER BY (COALESCE(btrim(e.reason), '') <> '') DESC, e.created_at DESC, e.id DESC
    LIMIT GREATEST(LEAST(COALESCE(p_limit, 30), 100), 1)
    OFFSET GREATEST(COALESCE(p_offset, 0), 0)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM eligible),
    'profiles', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',               pg.id,
            'slug',             pg.slug,
            'name',             pg.name,
            'role',             pg.role,
            'linkedin_url',     pg.linkedin_url,
            'reason',           pg.reason,
            'created_at',       pg.created_at,
            'is_verified',      pg.is_verified,
            'avatar_color',     pg.avatar_color,
            'avatar_url',       pg.avatar_url,
            'avatar_provider',  pg.avatar_provider
          )
          ORDER BY (COALESCE(btrim(pg.reason), '') <> '') DESC, pg.created_at DESC, pg.id DESC
        )
        FROM page pg
      ),
      '[]'::jsonb
    )
  );
$$;

-- Same grant shape as P877's accessors: explicit EXECUTE for the two client roles.
REVOKE ALL ON FUNCTION public.get_pledgers_page(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_pledgers_page(integer, integer) TO anon, authenticated;
