-- P1104 hardening: the "Agent ·" name reservation was defeatable by invisible characters.
--
-- client-safe: this only WIDENS an existing rejection inside upsert_my_profile. Every name
-- a deployed client could legitimately submit before still succeeds; the additional
-- rejections all target strings that render pixel-identical to the reserved marker.
--
-- Function-redefinition provenance (pre-commit gate):
--   upsert_my_profile -- diffed against: 20260819120000_p1104_agent_accounts.sql
--     (body reproduced byte-identical below except for the normalization block; diffed
--      before writing, not from memory)
--
-- WHY. The guard shipped in 20260819120000 matched
--   lower(btrim(name)) ~ '^agent\s*[·•∙⋅‧・]'
-- Verified against the live test DB on 2026-08-19 by calling upsert_my_profile as a real
-- authenticated user with 24 candidate names, the following were ACCEPTED — every one of
-- them rendering visually identical to the reserved form, because the inserted character
-- has zero width or is a homoglyph:
--
--   U+200B zero-width space          "Agent<ZWSP>· Real Person"
--   U+200D zero-width joiner
--   U+200F right-to-left mark
--   U+2060 word joiner
--   a leading zero-width before "Agent"
--   Cyrillic А U+0410 in "Agent"
--   Fullwidth Ａ U+FF21
--   U+2024 one-dot leader          (.)
--   U+FF65 halfwidth katakana dot  (･)
--
-- Any of those produces an account that READS as a machine-generated reading while keeping
-- a circular avatar, a real pledge ring, a coloured card and an ear count — the exact
-- inversion the reservation exists to prevent, and the one the spec calls "actively
-- deceptive". A reservation a single invisible codepoint defeats is not a reservation.
--
-- Correctly rejected already, and still rejected: the plain form, no-space, double-space,
-- tab, U+2022, U+30FB, U+00A0, U+202F, U+2219, and uppercase.
--
-- The fix normalizes BEFORE matching rather than extending the blacklist in place:
--   1. delete format / zero-width / bidi characters outright, so they cannot split the
--      token at all (this is the class that mattered — invisible by construction);
--   2. fold the Cyrillic and fullwidth letters that can spell "agent" down to ASCII;
--   3. match against a separator class widened to every confusable middle-dot.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_my_profile(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id   uuid := auth.uid();
  v_name text;
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'upsert_my_profile requires an authenticated caller';
  END IF;

  -- P1104: the "Agent ·" prefix is reserved for registry-backed agent accounts, which are
  -- created by create_or_reuse_agent_account and never reach this function.
  --
  -- translate() with a shorter `to` than `from` DELETES the surplus characters, which is
  -- what strips the invisibles in step 1.
  v_name := lower(coalesce(p_data->>'name', ''));
  -- 1. delete soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM, word joiner, invisible operators,
  --    bidi overrides and BOM.
  v_name := translate(
    v_name,
    U&'\00AD\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\202A\202B\202C\202D\202E\FEFF',
    ''
  );
  -- 2. fold Cyrillic and fullwidth lookalikes down to the ASCII they imitate.
  v_name := translate(
    v_name,
    U&'\0430\0435\043E\0440\0441\FF21\FF41\FF47\FF45\FF4E\FF54',
    'aeopcaagent'
  );
  v_name := btrim(v_name);

  IF v_name ~ U&'^agent[[:space:]]*[\00B7\0387\2022\2024\2027\2219\22C5\2E31\30FB\FF65]' THEN
    RAISE EXCEPTION 'display name may not use the reserved "Agent ·" marker prefix';
  END IF;

  -- id is always the caller's own — any id in p_data is ignored.
  -- is_verified / has_pledged are intentionally NOT taken from p_data (P880). New rows
  -- start unverified / un-pledged; mark_self_verified() and set_my_pledge() set them.
  INSERT INTO public.profiles (
    id, email, name, slug, role, linkedin_url, reason,
    avatar_color, avatar_url, avatar_provider, is_verified,
    pledge_version, has_pledged, accepted_terms_version,
    bio, banner_url, banner_generation_attempted
  ) VALUES (
    v_id,
    p_data->>'email',
    p_data->>'name',
    p_data->>'slug',
    p_data->>'role',
    p_data->>'linkedin_url',
    p_data->>'reason',
    p_data->>'avatar_color',
    p_data->>'avatar_url',
    p_data->>'avatar_provider',
    false,  -- P880: never from caller; set via mark_self_verified()
    COALESCE((p_data->>'pledge_version')::integer, 2),
    false,  -- P880: never from caller; set via set_my_pledge()
    p_data->>'accepted_terms_version',
    p_data->>'bio',
    p_data->>'banner_url',
    COALESCE((p_data->>'banner_generation_attempted')::boolean, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    email                       = EXCLUDED.email,
    name                        = EXCLUDED.name,
    slug                        = EXCLUDED.slug,
    role                        = EXCLUDED.role,
    linkedin_url                = EXCLUDED.linkedin_url,
    reason                      = EXCLUDED.reason,
    avatar_color                = EXCLUDED.avatar_color,
    avatar_url                  = EXCLUDED.avatar_url,
    avatar_provider             = EXCLUDED.avatar_provider,
    -- is_verified / has_pledged intentionally omitted (P880): preserved across upsert.
    pledge_version              = EXCLUDED.pledge_version,
    accepted_terms_version      = EXCLUDED.accepted_terms_version,
    bio                         = EXCLUDED.bio,
    banner_url                  = EXCLUDED.banner_url,
    banner_generation_attempted = EXCLUDED.banner_generation_attempted,
    updated_at                  = timezone('utc', now());

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- CREATE OR REPLACE does not reset grants; upsert_my_profile keeps its P877
-- authenticated-only EXECUTE grant.

COMMIT;
