-- P1104 continuation: the NAME channel is defended, the URL channel is not.
--
-- client-safe: adds a rejection for profile slugs whose FIRST TOKEN is "machine". No
-- existing profile in any environment uses that form (verified below), so every slug a
-- client can submit today still succeeds.
--
-- Function-redefinition provenance (pre-commit gate):
--   is_reserved_machine_slug      -- new function
--   guard_profile_trust_columns   -- diffed against: 20260819160000_p1104_reserve_agent_name_at_the_table.sql
--   upsert_my_profile             -- diffed against: 20260819160000_p1104_reserve_agent_name_at_the_table.sql
--   create_or_reuse_agent_account -- diffed against: 20260819160000_p1104_reserve_agent_name_at_the_table.sql
--
-- ============================================================================
-- WHY.
-- ============================================================================
-- 20260819160000 closed the display-name channel in both directions: a human may not take
-- the reserved "Agent ·" marker, and an agent may not be created without it. Its own
-- rationale states the reason plainly — the name "is the ONLY channel that reaches
-- off-platform surfaces and the only one that survives a pending or failed registry read".
--
-- That is true of the name and it is equally true of the SLUG, which was left free-text.
-- `create_or_reuse_agent_account` takes p_slug and stores it unchecked, and the client-side
-- guard trigger pins only `name`. Measured against the test database, 2026-08-24 — three
-- agent accounts for real, living public figures already hold the bare-name URL:
--
--     Agent · Sam Harris        -> /p/sam-harris
--     Agent · Will MacAskill    -> /p/william-macaskill
--     Agent · JohntheDuncan     -> /p/johntheduncan
--
-- A pasted link is the one surface where NONE of the other markers travel: no chip, no
-- drained card, no footer, no "Operated by" line — none of it renders until someone clicks.
-- Until then the address itself is the whole claim, and it reads as that person's own page.
--
-- "machine", not "agent", is the word. It is what every reader already sees (the chip, the
-- /machines explainer, "A machine account operated by ClarityPledge"). "agent" is internal
-- vocabulary and, worse, reads in English as *representative of* — the one implication an
-- account bearing a real person's name must never carry.
--
-- WHAT THIS DOES NOT DO: it does not rewrite the three slugs above. Changing a live slug
-- breaks every link already shared to it, which is a decision about published URLs, not a
-- schema decision. The guard binds new creations from here; the backfill is separate and
-- deliberate.

BEGIN;

-- ============================================================================
-- 1. The predicate.
-- ============================================================================
-- Deliberately simpler than is_reserved_agent_name, and the difference is the point.
-- That predicate needed a second clause because "Agent Smith" is a legitimate human name
-- whose first token is "agent". There is no equivalent here: a slug whose first token is
-- "machine" is EXACTLY what is being reserved, so first-token equality is the whole test.
--
-- The token/normalize approach is inherited wholesale, because its lesson transfers:
-- enumerating separators is a blacklist wearing an allowlist's clothes. A token ends at the
-- first non-alphanumeric, whatever that character is, so machine-x / machine_x / machine.x
-- / machine~x are all one rule rather than four.
CREATE OR REPLACE FUNCTION public.is_reserved_machine_slug(p_slug text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_norm text;
BEGIN
  IF p_slug IS NULL THEN
    RETURN false;
  END IF;

  v_norm := lower(normalize(p_slug, NFKC));

  -- Zero-width, bidi and invisible fillers do not end a token and render as nothing, so
  -- they must not be able to split "machine". Same set as is_reserved_agent_name.
  v_norm := translate(
    v_norm,
    U&'\00AD\034F\061C\180E\115F\1160\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\2066\2067\2068\2069\202A\202B\202C\202D\202E\3164\17B4\17B5\FEFF',
    ''
  );

  -- Letters that LOOK like the ASCII spelling of "machine" but are distinct codepoints,
  -- which NFKC leaves alone. Cyrillic / Greek / Armenian / IPA / small-capital forms.
  v_norm := translate(
    v_norm,
    U&'\043C\0430\0441\04BB\0456\0435\0578\03B1\03F2\03B9\1D0D\0251\026A\1D07\0274',
    'machienacimaien'
  );

  v_norm := regexp_replace(v_norm, '^[[:space:]­͏؜᠎ᅟᅠ]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  RETURN (regexp_split_to_array(v_norm, '[^[:alnum:]]+'))[1] = 'machine';
END;
$$;

COMMENT ON FUNCTION public.is_reserved_machine_slug(text) IS
  'P1104: true when a profile slug claims the reserved "machine-" URL namespace. Decides on the FIRST TOKEN after NFKC + confusables folding, so the separator set is closed rather than enumerated. Called by the profiles guard trigger, upsert_my_profile, and create_or_reuse_agent_account.';

-- ============================================================================
-- 2. The trigger — the boundary every CLIENT write actually crosses.
-- ============================================================================
-- Extends 20260819160000's definition by one check. Everything else is carried forward
-- verbatim; re-read that migration's header before touching this body.
--
-- SECURITY INVOKER (the default) is LOAD-BEARING and must not be changed. p880:57 states
-- it, and an earlier draft of the 20260819160000 migration added SECURITY DEFINER and
-- thereby disabled the ENTIRE guard — not just the name check but the is_verified /
-- has_pledged / is_admin / is_certifier pinning P880 and P878 rely on.
CREATE OR REPLACE FUNCTION public.guard_profile_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified   := false;
      NEW.has_pledged   := false;
      NEW.is_admin      := false;
      NEW.is_certifier  := false;
    ELSE
      NEW.is_verified   := OLD.is_verified;
      NEW.has_pledged   := OLD.has_pledged;
      NEW.is_admin      := OLD.is_admin;
      NEW.is_certifier  := OLD.is_certifier;
    END IF;

    IF NEW.name IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.name END)
       AND public.is_reserved_agent_name(NEW.name) THEN
      RAISE EXCEPTION 'display name may not use the reserved "Agent ·" marker prefix';
    END IF;

    -- P1104 continuation: the same reservation, on the URL. Only re-checked when the slug
    -- actually changes, so an unrelated UPDATE on a legacy row cannot be blocked by it.
    IF NEW.slug IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.slug END)
       AND public.is_reserved_machine_slug(NEW.slug) THEN
      RAISE EXCEPTION 'profile slug may not use the reserved "machine-" prefix';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. upsert_my_profile — SECURITY DEFINER, so the trigger's client-role branch never
--    fires inside it and it must keep its own copy of both checks.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.upsert_my_profile(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid := auth.uid();
BEGIN
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'upsert_my_profile requires an authenticated caller';
  END IF;

  IF public.is_reserved_agent_name(p_data->>'name') THEN
    RAISE EXCEPTION 'display name may not use the reserved "Agent ·" marker prefix';
  END IF;

  IF public.is_reserved_machine_slug(p_data->>'slug') THEN
    RAISE EXCEPTION 'profile slug may not use the reserved "machine-" prefix';
  END IF;

  INSERT INTO public.profiles (
    id, email, name, slug, role, linkedin_url, reason,
    avatar_color, avatar_url, avatar_provider, is_verified,
    pledge_version, has_pledged, accepted_terms_version,
    bio, banner_url, banner_generation_attempted
  ) VALUES (
    v_id,
    p_data->>'email', p_data->>'name', p_data->>'slug', p_data->>'role',
    p_data->>'linkedin_url', p_data->>'reason', p_data->>'avatar_color',
    p_data->>'avatar_url', p_data->>'avatar_provider',
    false,
    COALESCE((p_data->>'pledge_version')::integer, 2),
    false,
    p_data->>'accepted_terms_version', p_data->>'bio', p_data->>'banner_url',
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
    pledge_version              = EXCLUDED.pledge_version,
    accepted_terms_version      = EXCLUDED.accepted_terms_version,
    bio                         = EXCLUDED.bio,
    banner_url                  = EXCLUDED.banner_url,
    banner_generation_attempted = EXCLUDED.banner_generation_attempted,
    updated_at                  = timezone('utc', now());

  RETURN jsonb_build_object('id', v_id);
END;
$$;

-- ============================================================================
-- 4. The positive assertion: an agent MUST hold a reserved slug.
-- ============================================================================
-- The mirror of section 4 in 20260819160000, and it exists for the same reason that one
-- did: a rule that only FORBIDS humans the marker, without REQUIRING machines to carry it,
-- defends nothing. Before this change the URL channel was optional for agents and
-- unconstrained for humans, which is the weakest of the four possible arrangements.
--
-- Body carried forward verbatim from 20260819160000 apart from the added check.
CREATE OR REPLACE FUNCTION public.create_or_reuse_agent_account(
  p_profile_id    UUID,
  p_subject_key   TEXT,
  p_email         TEXT,
  p_name          TEXT,
  p_slug          TEXT,
  p_avatar_url    TEXT,
  p_avatar_color  TEXT,
  p_operator_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id UUID;
  v_key        TEXT := btrim(p_subject_key);
BEGIN
  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION 'create_or_reuse_agent_account requires a non-empty subject_key';
  END IF;
  IF p_operator_name IS NULL OR btrim(p_operator_name) = '' THEN
    RAISE EXCEPTION 'create_or_reuse_agent_account requires a non-empty operator_name';
  END IF;
  IF NOT public.is_reserved_agent_name(p_name) THEN
    RAISE EXCEPTION 'an agent account name must carry the reserved "Agent ·" marker; got %', p_name;
  END IF;
  IF NOT public.is_reserved_machine_slug(p_slug) THEN
    RAISE EXCEPTION 'an agent account slug must carry the reserved "machine-" prefix; got %', p_slug;
  END IF;

  SELECT a.profile_id INTO v_profile_id
  FROM public.agent_accounts a WHERE a.subject_key = v_key;

  IF v_profile_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.agent_accounts a
      WHERE a.profile_id = v_profile_id AND a.operator_name IS DISTINCT FROM p_operator_name
    ) THEN
      RAISE EXCEPTION 'subject_key % is already registered to a different operator', v_key;
    END IF;
    RETURN v_profile_id;
  END IF;

  INSERT INTO public.profiles (
    id, email, name, slug, avatar_url, avatar_color,
    is_verified, has_pledged, ears_count, verification_session_count
  ) VALUES (
    p_profile_id, p_email, p_name, p_slug, p_avatar_url, p_avatar_color,
    false, false, 0, 0
  );

  INSERT INTO public.agent_accounts (profile_id, subject_key, operator_name)
  VALUES (p_profile_id, v_key, p_operator_name);

  RETURN p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'P1104: the only sanctioned path that creates a pipeline agent account. Profile row and registry row commit together, and both reserved channels — the "Agent ·" name and the "machine-" slug — are required. Caller mints the auth.users row first and passes its id. On a lost response the caller MUST check agent_accounts for the proposed id before deleting the auth user — otherwise its cleanup destroys a committed account.';

COMMIT;
