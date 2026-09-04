-- P1212 §2, fourth pass: the `agent-` namespace is PREDICATED but not ENFORCED.
--
-- client-safe: adds a rejection for profile slugs whose FIRST TOKEN is "agent". Verified
-- 2026-09-04 against both databases before writing this file — prod holds 107 profiles,
-- of which 0 have an "agent" or "machine" first token and 0 carry the "Agent ·" name
-- marker; test's only "agent-*" slugs belong to agent accounts minted through
-- create_or_reuse_agent_account (service_role), which the client branch of the trigger
-- never covers. So no slug a client can submit today starts failing.
--
-- Function-redefinition provenance (pre-commit gate). All three were diffed against the
-- LIVE definitions dumped from the test database with pg_get_functiondef on 2026-09-04 —
-- NOT against the first migration a grep turned up. That distinction is the whole lesson of
-- 20260904160000, which cloned a superseded body and reintroduced a fixed hole. The live
-- dumps came back byte-identical to the file named below, which is what makes it safe to
-- cite it:
--   guard_profile_trust_columns   -- diffed against: 20260824120000_p1104_reserve_machine_slug.sql (one condition widened; body otherwise verbatim)
--   upsert_my_profile             -- diffed against: 20260824120000_p1104_reserve_machine_slug.sql (one condition widened; body otherwise verbatim)
--   create_or_reuse_agent_account -- diffed against: 20260824120000_p1104_reserve_machine_slug.sql (one check swapped machine->agent; body otherwise verbatim)
--
-- ============================================================================
-- WHY.
-- ============================================================================
-- 20260904140000 introduced is_reserved_agent_slug and 20260904150000/160000 hardened it
-- against a Cyrillic confusable and a combining-mark bypass. All three are tested. NONE of
-- them is called by anything: the profiles guard trigger, upsert_my_profile and
-- create_or_reuse_agent_account still reference is_reserved_machine_slug alone.
--
-- A predicate with no call site is a spec marked done whose mechanism is absent from the
-- code — the exact failure docs/process-learnings.md records going unnoticed for five
-- months. This migration is the call sites.
--
-- ============================================================================
-- WHAT CHANGES, precisely.
-- ============================================================================
--   Client writes (trigger + upsert_my_profile): were refused "machine-", now refused
--     "machine-" OR "agent-". The retired namespace stays shut. Closing one prefix while
--     opening the other would hand an impersonator the newer, more legible spelling.
--   Agent creation (create_or_reuse_agent_account): REQUIRED "machine-", now REQUIRES
--     "agent-". The two are not symmetric on purpose. Reserving both against clients costs
--     nothing; requiring both of an agent is impossible, and requiring the retired one
--     would freeze the rename this spec exists to perform.
--
-- The five test-env agent accounts still on "machine-*" are renamed below. That is a
-- rewrite of live slugs, which 20260824120000 explicitly declined to do — and the reason
-- it declined does not hold here. Its three cases were accounts for real public figures
-- whose URLs had been shareable for days. These five were minted 2026-09-01 by one
-- pipeline run, on the TEST database, and have never been published anywhere. On prod the
-- UPDATE matches zero rows (verified above), so it is a no-op there by construction.
--
-- KNOWN GAP, NOT CLOSED HERE and not introduced here: "machine~sam-harris" (and the same
-- with + < = > | $ ^ `) is still mintable by any authenticated user. The combining-mark
-- strip both predicates inherit from 20260824140000 keeps [:alnum:], [:space:] and
-- [:punct:] — and Unicode classes "~" as Sm (Math Symbol), not punctuation, so it is
-- stripped rather than treated as a separator, and "machine~x" tokenises as one word that
-- is not "machine". Live since 20260824140000.
-- e2e/integration/p1212-agent-slug-reservation.spec.ts asserts the CURRENT wrong behaviour
-- so the day it is fixed the test fails loudly rather than silently passing. Filed for the
-- founder as its own bug; folding a character-class fix into a namespace rename would make
-- a security change ride an unrelated migration.

BEGIN;

-- ============================================================================
-- 1. The trigger — the boundary every CLIENT write crosses.
-- ============================================================================
-- SECURITY INVOKER (the default) is LOAD-BEARING and must not be changed. p880:57 states
-- it, and an earlier draft of 20260819160000 added SECURITY DEFINER and thereby disabled
-- the ENTIRE guard — not just the name check but the is_verified / has_pledged / is_admin
-- / is_certifier pinning P880 and P878 rely on.
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

    -- P1212: BOTH namespaces. Only re-checked when the slug actually changes, so an
    -- unrelated UPDATE on a legacy row cannot be blocked by it.
    IF NEW.slug IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.slug END)
       AND (public.is_reserved_agent_slug(NEW.slug)
            OR public.is_reserved_machine_slug(NEW.slug)) THEN
      RAISE EXCEPTION 'profile slug may not use the reserved "agent-" or "machine-" prefix';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 2. upsert_my_profile — SECURITY DEFINER, so the trigger's client-role branch never
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

  IF public.is_reserved_agent_slug(p_data->>'slug')
     OR public.is_reserved_machine_slug(p_data->>'slug') THEN
    RAISE EXCEPTION 'profile slug may not use the reserved "agent-" or "machine-" prefix';
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
-- 3. create_or_reuse_agent_account — an agent MUST hold the reserved slug, now "agent-".
-- ============================================================================
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
  IF NOT public.is_reserved_agent_slug(p_slug) THEN
    RAISE EXCEPTION 'an agent account slug must carry the reserved "agent-" prefix; got %', p_slug;
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

COMMENT ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'P1104/P1212: the only sanctioned path that creates a pipeline agent account. Profile row and registry row commit together, and both reserved channels — the "Agent ·" name and the "agent-" slug — are required. Caller mints the auth.users row first and passes its id. On a lost response the caller MUST check agent_accounts for the proposed id before deleting the auth user — otherwise its cleanup destroys a committed account.';

-- ============================================================================
-- 4. Rename the surviving "machine-*" agent slugs.
-- ============================================================================
-- Scoped by the registry, not by the string: only rows that ARE agent accounts move. A
-- human profile that somehow held such a slug is a different problem and is not silently
-- rewritten here. Guarded against collision with an existing "agent-*" slug.
UPDATE public.profiles p
SET slug = 'agent-' || substring(p.slug from 9),
    updated_at = timezone('utc', now())
WHERE p.slug LIKE 'machine-%'
  AND EXISTS (SELECT 1 FROM public.agent_accounts a WHERE a.profile_id = p.id)
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles q
    WHERE q.slug = 'agent-' || substring(p.slug from 9)
  );

COMMIT;
