-- P1104 round 3: the name reservation was guarding a door the application does not use.
--
-- client-safe: adds a rejection for display names whose FIRST TOKEN is "agent" followed by
-- a non-alphanumeric separator. No existing profile uses that form and no deployed UI
-- produces it; every other name a client can submit today still succeeds. Verified below.
--
-- Function-redefinition provenance (pre-commit gate):
--   is_reserved_agent_name        -- new function
--   upsert_my_profile             -- diffed against: 20260819140000_p1104_harden_agent_prefix_guard.sql
--   guard_profile_trust_columns   -- diffed against: 20260605150000_p878_search_profiles_rpc.sql
--   create_or_reuse_agent_account -- diffed against: 20260819120000_p1104_agent_accounts.sql
--
-- ============================================================================
-- WHY. Two findings from adversarial review, both verified live against the test DB.
-- ============================================================================
--
-- 1. THE GUARD WAS IN THE WRONG PLACE. profiles.name is not written through
--    upsert_my_profile in the running product. settings-page.tsx -> updateProfile ->
--    api.ts does `.from('profiles').update({...})` directly, and `authenticated` holds a
--    TABLE-LEVEL UPDATE grant on profiles (20250101_initial_schema.sql:2). P877/P886
--    revoked only SELECT; the P571 UPDATE policy pins only is_test_account; the P880/P878
--    guard trigger pins only is_verified/has_pledged/is_admin/is_certifier. `name` was
--    unconstrained. Measured, as a real authenticated user, with BOTH prior migrations
--    applied:
--
--        upsert_my_profile('Agent · Real Public Figure')  -> REJECTED
--        profiles.update({name:'Agent · Real Public Figure'}) -> ACCEPTED, stored verbatim
--
--    So two rounds of regex hardening protected a path nobody takes. The predicate has to
--    live where every client write passes: a trigger on the table.
--
-- 2. ENUMERATING SEPARATORS IS A BLACKLIST WEARING AN ALLOWLIST'S CLOTHES. The previous
--    class listed confusable middle dots. Measured as accepted afterwards:
--
--        "Agent . Real Public Figure"   <- pure ASCII full stop, no Unicode at all
--        "Agent - Real Public Figure"
--        "Agent : Real Public Figure"
--        NBSP / tab / ideographic-space PREFIXES (btrim only strips ASCII space)
--
--    plus a long tail of lookalike letters (U+0261 script g, U+0251 latin alpha, the whole
--    U+1D400 mathematical block, Armenian, Cherokee) that no fold table will finish.
--
--    The fix inverts the test. Instead of asking "is the separator one of these?", it asks
--    "is the FIRST TOKEN the word agent?" — where a token ends at the first non-alphanumeric
--    character, whatever that character is. That set is closed: every separator, present and
--    future, visible and invisible, ends the token. NFKC normalization folds the fullwidth
--    and mathematical-alphanumeric families wholesale rather than codepoint by codepoint,
--    and a confusables fold handles the Cyrillic/Greek/Armenian/Cherokee letters NFKC leaves
--    alone (they are distinct letters, not compatibility variants).
--
--    "Agent Smith" is still fine: the first token is "agent" but the next character is a
--    space and the name that follows is not preceded by a separator — see the predicate's
--    second clause, which requires a non-alphanumeric, non-space separator.

BEGIN;

-- ============================================================================
-- 1. The shared predicate. One definition, called from three places.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_reserved_agent_name(p_name text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_norm   text;
  v_head   text;
  v_tokens text[];
BEGIN
  IF p_name IS NULL THEN
    RETURN false;
  END IF;

  -- NFKC folds fullwidth (Ａ -> a) and the mathematical alphanumeric block
  -- (U+1D400.. -> a-z) in one step, which no hand-written table finishes.
  v_norm := lower(normalize(p_name, NFKC));

  -- Delete every zero-width, bidi, and invisible-filler character. These do not end a
  -- token and they render as nothing, so they must not be able to split "agent".
  -- Includes the bidi ISOLATES (U+2066-2069) and U+061C that the previous round missed.
  v_norm := translate(
    v_norm,
    U&'\00AD\034F\061C\180E\115F\1160\200B\200C\200D\200E\200F\2060\2061\2062\2063\2064\2066\2067\2068\2069\202A\202B\202C\202D\202E\3164\17B4\17B5\FEFF',
    ''
  );

  -- Fold letters that LOOK like the ASCII used to spell "agent" but are different
  -- codepoints. NFKC does not touch these — they are distinct letters, not compatibility
  -- variants. Cyrillic / Greek / Armenian / Cherokee / IPA.
  v_norm := translate(
    v_norm,
    U&'\0430\0435\043E\0440\0441\0442\03B1\03BF\03B5\0578\13AA\AB7A\0261\0251\1D07',
    'aeopctaoenaagae'
  );

  -- Strip leading whitespace of EVERY width, not just ASCII space. btrim's default
  -- argument is ' ' alone, which is why a tab or NBSP prefix walked past the ^ anchor.
  v_norm := regexp_replace(v_norm, '^[[:space:]   -   　]+', '');

  IF v_norm = '' THEN
    RETURN false;
  END IF;

  -- Tokens, splitting on runs of non-alphanumerics.
  v_tokens := regexp_split_to_array(v_norm, '[^[:alnum:]]+');
  v_head := v_tokens[1];

  IF v_head IS DISTINCT FROM 'agent' THEN
    RETURN false;   -- "Agentina …", "Agency …", anything not led by the bare word
  END IF;

  -- Reserved when what follows the leading "agent" is a SEPARATOR rather than a name.
  -- Two shapes, because a separator need not be punctuation:
  --   (a) a non-alphanumeric follows            -> "Agent · X", "Agent . X", "Agent-X"
  --   (b) the second token is a single character -> "Agent ꞏ X", where U+A78F is Unicode
  --       category Lo (a LETTER) and therefore invisible to test (a). Real names do not
  --       have a one-character second word; marker glyphs do.
  -- "Agent Smith" passes both tests and is allowed: second token is 5 characters.
  RETURN v_norm ~ '^agent[[:space:]]*[^[:alnum:][:space:]]'
      OR (array_length(v_tokens, 1) >= 2 AND length(v_tokens[2]) = 1);
END;
$$;

COMMENT ON FUNCTION public.is_reserved_agent_name(text) IS
  'P1104: true when a display name claims the reserved "Agent ·" marker form. Decides on the FIRST TOKEN after NFKC + confusables folding, so the separator set is closed rather than enumerated. Called by the profiles guard trigger, upsert_my_profile, and create_or_reuse_agent_account.';

-- ============================================================================
-- 2. The trigger — the boundary every CLIENT write actually crosses.
-- ============================================================================
-- Extends the P878 definition, which pins is_verified/has_pledged/is_admin/is_certifier.
-- Same `current_user IN ('anon','authenticated')` gate: SECURITY DEFINER accessors run as
-- the owner and fall through untouched, which is why upsert_my_profile ALSO keeps its own
-- check below. Neither guard covers the other's path.
-- SECURITY INVOKER (the default) is LOAD-BEARING and must not be changed. p880:57 states
-- it: "do NOT add SECURITY DEFINER here, or current_user would always be the owner and the
-- client-vs-server distinction would collapse." An earlier draft of THIS migration added
-- SECURITY DEFINER and thereby disabled the entire guard — not just the new name check but
-- the is_verified / has_pledged / is_admin / is_certifier pinning P880 and P878 rely on.
-- Caught by the round-3 probe showing a direct UPDATE still accepted the reserved name.
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

    -- P1104: the reserved marker form is not settable by a client role through ANY write
    -- path, including a direct table UPDATE. Only re-checked when the name actually
    -- changes, so an unrelated UPDATE on a legacy row cannot be blocked by it.
    IF NEW.name IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.name END)
       AND public.is_reserved_agent_name(NEW.name) THEN
      RAISE EXCEPTION 'display name may not use the reserved "Agent ·" marker prefix';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. upsert_my_profile — keep its own check (it is SECURITY DEFINER, so the trigger's
--    client-role branch never fires inside it), now delegating to the shared predicate.
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
-- 4. The positive assertion: an agent MUST carry the marker.
-- ============================================================================
-- Measured before this change: create_or_reuse_agent_account accepted
-- p_name = 'A Real Public Figure' and registered it as an agent. The "already formatted by
-- the caller" comment was a comment, not a check — humans were forbidden the marker while
-- agents were not required to carry it. The name is the ONLY channel that reaches
-- off-platform surfaces and the only one that survives a pending or failed registry read,
-- so this is the channel least able to afford being optional.
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

  -- Store the TRIMMED key, and look up by it. Previously the trim was applied to the
  -- emptiness check and withheld from the data, so " key" and "key" were distinct
  -- subjects — two agents for one person, able to hold opposing positions on one point
  -- without tripping UNIQUE(point_id, user_id), because they are different users.
  SELECT a.profile_id INTO v_profile_id
  FROM public.agent_accounts a WHERE a.subject_key = v_key;

  IF v_profile_id IS NOT NULL THEN
    -- Reuse must not silently publish one operator's content under another's name: the
    -- profile page and every share card would name the stored operator, and the
    -- public-figure policy approval is conditional on the operator being the answerable
    -- one. Refuse rather than mislabel.
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

-- ============================================================================
-- 5. A registry row must not be removable while its profile lives.
-- ============================================================================
-- Measured: service_role DELETE on agent_accounts SUCCEEDED and left the profile behind,
-- rendering a machine's reading of a real public figure as an ordinary person — circle,
-- ear badge, full colour. The narrowed GRANT at 20260819120000:67 listed only
-- SELECT/INSERT/UPDATE, but it never REVOKED the schema-wide default privileges that
-- already gave service_role everything, so DELETE and TRUNCATE survived.
--
-- The REVOKE closes the PostgREST path; the trigger closes the rest (dashboard, psql, a
-- future migration, admin tooling), because Postgres deletes the parent row BEFORE firing
-- the FK cascade, so a legitimate cascade still passes while a bare delete does not.
REVOKE DELETE, TRUNCATE ON public.agent_accounts FROM service_role;

CREATE OR REPLACE FUNCTION public.guard_agent_account_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.profile_id) THEN
    RAISE EXCEPTION 'an agent_accounts row may not be deleted while its profile exists — delete the profile instead (P1104)';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_agent_account_delete ON public.agent_accounts;
CREATE TRIGGER trg_guard_agent_account_delete
  BEFORE DELETE ON public.agent_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_agent_account_delete();

COMMIT;
