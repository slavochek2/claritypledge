-- P1259 change 3: an agent profile needs a real description and the SUBJECT's own links.
--
-- client-safe: nothing a deployed client reads changes shape or disappears. `bio`'s CHECK is
--   WIDENED (160 -> 2000), so every string that validated before still validates. `links` is a
--   new NOT NULL DEFAULT '[]' column — additive, invisible to a client that does not select it.
--   `get_profile_by_id` keeps its signature and every key it already returned, and gains one.
--   The REVOKE/GRANT pair on that function is a no-op in net terms: `CREATE OR REPLACE` resets
--   the ACL to Supabase's default (EXECUTE to anon + authenticated), and the pair immediately
--   re-establishes exactly the ACL P877 set — revoke from PUBLIC/anon/authenticated, grant back
--   to anon + authenticated. Both statements are in this one file, which the Management API
--   applies as a single query, so no window exists where a live client loses EXECUTE. Written
--   out rather than assumed: the same shape without the re-grant would silently 403 every
--   profile page.
--
-- diffed against: 20260602160000_p877_profiles_pii_column_grants.sql (get_profile_by_id), which
--   is the function's only prior definition — confirmed by
--   `grep -rln "FUNCTION public.get_profile_by_id" supabase/migrations`.
--   diff: ONE key added to the jsonb_build_object — 'links' -> p.links, between 'bio' and
--   'banner_url'. The email / linkedin_url / reason branches below it, the v_is_self and
--   v_public_optin conditions, `SET search_path = ''`, STABLE and SECURITY DEFINER are all
--   byte-identical to P877. `links` is deliberately NOT routed through the sensitive branches:
--   it is public display data on a public profile page, which is why it belongs in the plain
--   key list and in the column GRANT rather than behind an accessor condition.
--
-- Two additive changes, no rollback needed (spec: Appetite — "the migration is additive
-- and needs no rollback"). A code revert leaves both columns inert.
--
-- 1. `bio` was capped at 160 characters by P414 (20260223_p414_profile_bio.sql), which is
--    why all four filed agent bios are a single sentence. The profile is now the PRIMARY
--    disclosure route for agent accounts — the two-sentence footer comes off every story
--    card and the byline name routes here instead — so the page a reader lands on has to
--    be worth landing on. 2000 is a display cap, not a content target: it is the point
--    where a "description" would stop being one and start being an article.
--
-- 2. `links` carries the SUBJECT's public profiles (Wikipedia, personal site, YouTube, X,
--    Instagram) — never ClarityPledge's own channels, which would read as the operator's
--    links on a page about someone else.
--
--    Shape follows the repo precedent for a links list on a row,
--    20260828120000_p1179_event_links.sql: a JSONB ARRAY of {url, label?} objects,
--    NOT NULL DEFAULT '[]' so every pre-existing row reads as "no links" with no backfill
--    and no null branch in the render path.
--
--    P1179 stores a TAG rather than a URL precisely so an open redirect is impossible by
--    construction. That trick is not available here: these are third-party URLs and there
--    is no tag namespace to resolve them through. The scheme allowlist is therefore an
--    INVARIANT ENFORCED AT RENDER (src/lib/profile-links.ts) rather than by the schema —
--    the CHECK below only guarantees the column is an array, which is the malformed-write
--    half of the problem, not the javascript:/data: half.

-- ============================================================================
-- 1. Widen the description
-- ============================================================================
-- P414 added the CHECK inline and unnamed, so Postgres auto-named it. Drop by the
-- auto-name, then sweep for any other CHECK on the table whose expression mentions bio —
-- an unnamed constraint added by a later migration would otherwise survive and the widen
-- would silently do nothing.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_bio_check;

DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'profiles'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%bio%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_name);
  END LOOP;
END
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length_check
  CHECK (bio IS NULL OR length(bio) <= 2000);

COMMENT ON COLUMN public.profiles.bio IS
  'P414 self-description, widened to 2000 chars by P1259 so an agent profile can carry a real description (it is now the primary disclosure route for agent accounts).';

-- ============================================================================
-- 2. The subject's own links
-- ============================================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.profiles SET links = '[]'::jsonb WHERE links IS NULL;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_links_is_array;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_links_is_array CHECK (jsonb_typeof(links) = 'array');

COMMENT ON COLUMN public.profiles.links IS
  'P1259: the SUBJECT''s own public profiles, [{url, label?}]. https: only, enforced at render (src/lib/profile-links.ts) — never ClarityPledge''s own channels. Operator-written; no UI form.';

-- ============================================================================
-- 3. Make it readable
-- ============================================================================
-- P877 dropped the table-level SELECT and re-granted column by column, with the standing
-- note: "a NEW profiles column is NOT readable by anon/authenticated until it is added to
-- this GRANT." `links` is display data on a public page, so it belongs in the grant
-- alongside `bio`, not behind an accessor.
GRANT SELECT (links) ON public.profiles TO anon, authenticated;

-- The profile page reads through get_profile_by_slug -> get_profile_by_id, which builds
-- its output from an explicit key list. A column absent from that list is invisible to the
-- page no matter what the grant says, so both halves are required.
CREATE OR REPLACE FUNCTION public.get_profile_by_id(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_is_self boolean;
  v_public_optin boolean;
BEGIN
  SELECT
    auth.uid() = p.id,
    (COALESCE(p.is_verified, false) AND COALESCE(p.has_pledged, false)) OR (auth.uid() = p.id),
    jsonb_build_object(
      'id',                           p.id,
      'slug',                         p.slug,
      'name',                         p.name,
      'role',                         p.role,
      'created_at',                   p.created_at,
      'is_verified',                  p.is_verified,
      'avatar_color',                 p.avatar_color,
      'avatar_url',                   p.avatar_url,
      'avatar_provider',              p.avatar_provider,
      'pledge_version',               p.pledge_version,
      'has_pledged',                  p.has_pledged,
      'bio',                          p.bio,
      'links',                        p.links,
      'banner_url',                   p.banner_url,
      'banner_generation_attempted',  p.banner_generation_attempted,
      'is_test_account',              p.is_test_account
    )
  INTO v_is_self, v_public_optin, v_result
  FROM public.profiles p
  WHERE p.id = p_id;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  -- email: own row only
  v_result := v_result || jsonb_build_object(
    'email',
    CASE WHEN v_is_self THEN (SELECT email FROM public.profiles WHERE id = p_id) ELSE NULL END
  );

  -- linkedin_url / reason: public-by-design for verified+pledged, else own row only
  v_result := v_result || jsonb_build_object(
    'linkedin_url',
    CASE WHEN v_public_optin THEN (SELECT linkedin_url FROM public.profiles WHERE id = p_id) ELSE NULL END,
    'reason',
    CASE WHEN v_public_optin THEN (SELECT reason FROM public.profiles WHERE id = p_id) ELSE NULL END
  );

  RETURN v_result;
END;
$$;

-- CREATE OR REPLACE resets the function's ACL to the default, which on Supabase grants
-- EXECUTE to anon AND authenticated. Re-apply P877's lock explicitly rather than relying
-- on that default happening to match.
REVOKE EXECUTE ON FUNCTION public.get_profile_by_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_id(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_profile_by_id(uuid) IS
  'P877: profile by id. email→owner only; linkedin_url/reason→verified+pledged or owner. P1259: carries links. Replaces direct profiles.select(*).';

-- `links` is deliberately NOT added to upsert_my_profile: it is operator-written, has no
-- UI form, and leaving it out of that accessor's column list means a member''s own profile
-- save can neither set it nor clear it.
