-- P1104: A machine's reading of a person must never render as that person.
--
-- client-safe: agent_accounts is a NEW table — no deployed client bundle references it,
-- so the REVOKE below cannot break a running client. The upsert_my_profile redefinition
-- only ADDS a rejection for a display-name prefix ("Agent ·") that no existing profile
-- uses and no deployed UI produces; every name a deployed client can currently submit
-- still succeeds. The zero-existing-rows precondition is asserted by the P1104 migration
-- integration test, not assumed here.
--
-- Function-redefinition provenance (pre-commit gate):
--   create_or_reuse_agent_account -- new function
--   upsert_my_profile             -- diffed against: 20260605120000_p880_trust_column_guard.sql
--     (the live definition, lines 175-235; body reproduced byte-identical below except for
--      the added "Agent ·" prefix rejection — diffed before writing, not from memory)
--
-- What this adds:
--   1. agent_accounts — the registry. Row EXISTENCE answers "is this profile an agent?"
--      (Decision 1). subject_key answers P1096's "do we already have an agent for this
--      speaker?" — the reuse lookup and the marker lookup are the same query surface.
--   2. create_or_reuse_agent_account — the ONLY sanctioned path that creates one.
--      profiles row + agent_accounts row land in ONE transaction, so "the pipeline
--      forgot to register the account" is not a reachable state (Decision 2).
--   3. upsert_my_profile redefined to reserve the "Agent ·" display-name prefix, closing
--      the inversion where a human self-names as a machine while keeping a pledge ring,
--      a coloured card and an ear count (Decision 4).

BEGIN;

-- ============================================================================
-- 1. agent_accounts — the registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_accounts (
  profile_id    UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_key   TEXT NOT NULL UNIQUE,   -- P1096's operator-supplied canonical person reference
  operator_name TEXT NOT NULL,          -- rendered as "Published by {operator_name}"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_accounts ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges (20250101_initial_schema.sql:1 —
-- `alter default privileges in schema public grant all on tables to ... anon,
-- authenticated ...`) grant ALL on every new public table to both client roles.
-- Column-level grants do NOT subtract from a table-level grant (the P877 lesson), so
-- the table-level grant must be dropped FIRST and re-granted at column level.
REVOKE ALL ON TABLE public.agent_accounts FROM PUBLIC, anon, authenticated;

-- Read is deliberately public: unlike search_rate_limits (p878 — REVOKE ALL, no client
-- read at all), this table's whole purpose IS public disclosure. Decision 3's client-side
-- isAgentAccountId() depends on anon+authenticated being able to fetch the id set.
-- Column-scoped (not a bare table GRANT) so a future sensitive column added here
-- defaults to unreadable, matching the P877/P886 default-deny convention.
--
-- subject_key is deliberately NOT granted: no render site reads it; it is the pipeline's
-- reuse key, not display content. Consequence for callers: select('profile_id') is
-- required — a select('*') returns 42501, which is the intended loud failure.
GRANT SELECT (profile_id, operator_name) ON public.agent_accounts TO anon, authenticated;

CREATE POLICY "agent_accounts are publicly readable"
  ON public.agent_accounts FOR SELECT
  USING (true);

-- Write: service_role only. No INSERT/UPDATE/DELETE policy is granted to anon or
-- authenticated, and the REVOKE ALL above already stripped table-level DML from both —
-- the search_rate_limits (p878) pattern. No authenticated user can self-register as an
-- agent; the only sanctioned write path is create_or_reuse_agent_account below.
GRANT SELECT, INSERT, UPDATE ON public.agent_accounts TO service_role;

COMMENT ON TABLE public.agent_accounts IS
  'P1104: registry of accounts that are a machine reading of a person. Row existence — not a column value — answers "is this profile an agent?". Written only by create_or_reuse_agent_account.';

-- ============================================================================
-- 2. create_or_reuse_agent_account — the only sanctioned creation path
-- ============================================================================
-- DEVIATION FROM SPEC DECISION 2, and why. The spec's body was:
--     INSERT INTO public.profiles (name, slug, avatar_url, avatar_color, is_verified)
--     VALUES (...) RETURNING id INTO v_profile_id;
-- Verified against 20250101_initial_schema.sql:5-19, that statement cannot execute:
--   * profiles.id is `uuid references auth.users on delete cascade primary key` — it has
--     NO default, so the insert raises 23502; supplying gen_random_uuid() instead raises
--     23503 on the auth.users FK. Postgres cannot mint a GoTrue user, so this function
--     cannot create the auth row itself.
--   * profiles.email is `text unique not null` — the spec's column list omits it (23502).
--   * profiles.has_pledged is `boolean not null DEFAULT TRUE`. Omitting it, as the spec
--     does, would create every agent account already holding a pledge — violating the
--     Non-Goal "Do NOT let one of these accounts hold a pledge, an oath, or a reputation
--     count" at the data layer and lighting the pledger ring before any UI is involved.
--     It is therefore set to false EXPLICITLY below. This is the first of two layers; the
--     second is GravatarAvatar forcing the ring off for isAgent rows.
--
-- Consequence for the caller (P1096's filer, holding SUPABASE_SERVICE_ROLE_KEY): mint the
-- auth.users row first via the admin API — the scripts/bootstrap-align-agent.mjs pattern —
-- then pass its id here. The fail-closed property the spec asks for is preserved exactly:
-- the harm named is "a profiles row with no agent_accounts row", and profile + registry
-- still land in ONE transaction with no second step to skip. The new residue is an
-- orphaned auth.users row with no profile, which renders nothing on any surface.
--
-- Reuse: when p_subject_key is already registered this returns the EXISTING profile_id,
-- which will differ from p_profile_id. The caller must compare the returned id against
-- the one it passed and delete its freshly-minted auth user when they differ.
CREATE OR REPLACE FUNCTION public.create_or_reuse_agent_account(
  p_profile_id    UUID,
  p_subject_key   TEXT,
  p_email         TEXT,
  p_name          TEXT,   -- already formatted "Agent · {subject}" by the caller
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
BEGIN
  IF p_subject_key IS NULL OR btrim(p_subject_key) = '' THEN
    RAISE EXCEPTION 'create_or_reuse_agent_account requires a non-empty subject_key';
  END IF;
  IF p_operator_name IS NULL OR btrim(p_operator_name) = '' THEN
    -- The public-figure policy approval is conditional on a named operator. An agent with
    -- no answerable human is the artifact the spec refuses to ship, so it is refused here
    -- rather than left to the caller's discipline.
    RAISE EXCEPTION 'create_or_reuse_agent_account requires a non-empty operator_name';
  END IF;

  SELECT a.profile_id INTO v_profile_id
  FROM public.agent_accounts a WHERE a.subject_key = p_subject_key;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;  -- reuse; caller must drop the auth user it minted for p_profile_id
  END IF;

  INSERT INTO public.profiles (
    id, email, name, slug, avatar_url, avatar_color,
    is_verified, has_pledged, ears_count, verification_session_count
  ) VALUES (
    p_profile_id, p_email, p_name, p_slug, p_avatar_url, p_avatar_color,
    false,   -- never verified
    false,   -- explicit: the column DEFAULT is true (see deviation note above)
    0,       -- no reputation
    0
  );

  INSERT INTO public.agent_accounts (profile_id, subject_key, operator_name)
  VALUES (p_profile_id, p_subject_key, p_operator_name);

  RETURN p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.create_or_reuse_agent_account(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'P1104 Decision 2: the only sanctioned path that creates a pipeline agent account. Profile row and agent_accounts row commit together, so an unregistered agent profile cannot be produced by this path. Caller mints the auth.users row first and passes its id.';

-- ============================================================================
-- 3. upsert_my_profile — reserve the "Agent ·" display-name prefix (Decision 4)
-- ============================================================================
-- The finding this closes: upsert_my_profile writes p_data->>'name' verbatim, is callable
-- by any authenticated user via .rpc(), and no CHECK or UNIQUE constraint exists on
-- profiles.name. A human could self-name "Agent · {Real Public Figure}" and — because
-- detection is keyed to the agent_accounts registry, not to the name string — keep a real
-- circular avatar, a pledge ring and an ear count, producing an account that reads as MORE
-- credibly machine-disclosed than a genuine agent. That is the inversion of this spec.
--
-- Guarded HERE and not in guard_profile_trust_columns: that trigger constrains only
-- `current_user IN ('anon','authenticated')`, and upsert_my_profile is itself SECURITY
-- DEFINER, so its own INSERT/UPDATE runs as the function owner and falls through the
-- trigger untouched. Guarding in the trigger would protect a hypothetical raw-table write
-- path while leaving the actual exploitable one open. The repo's own pattern for
-- protecting a field THROUGH this RPC is "guard inside the RPC body" (P880 does exactly
-- this for is_verified/has_pledged).
--
-- DEVIATION FROM SPEC DECISION 4, and why. The spec proposed two LIKE patterns:
--     lower(trim(name)) LIKE 'agent ·%' OR lower(trim(name)) LIKE 'agent·%'
-- Those admit a trivial bypass: "Agent  · X" (two spaces) matches neither pattern, and
-- HTML collapses consecutive whitespace in normal flow, so it RENDERS identically to the
-- reserved form in every row this spec touches. The regex below covers any run of
-- whitespace, and additionally covers separators that are visually confusable with U+00B7
-- at the 12-14px the name renders at (bullet, dot operator, hyphenation point, katakana
-- middle dot). A weaker guard is not a smaller version of this reservation — it is a
-- reservation that does not hold, which the spec's own Risks section rules out
-- ("a marker that is present but weak is worse than none").
--
-- Body is otherwise byte-identical to the live definition in
-- 20260605120000_p880_trust_column_guard.sql:175-235 — diffed before writing. Functions
-- are replaced whole, never patched in place.
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

  -- P1104: the "Agent ·" prefix is reserved for registry-backed agent accounts, which are
  -- created by create_or_reuse_agent_account and never reach this function.
  IF lower(btrim(p_data->>'name')) ~ '^agent\s*[·•∙⋅‧・]' THEN
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

-- upsert_my_profile keeps its P877 grant (authenticated-only); CREATE OR REPLACE does not
-- reset grants, so no re-grant is needed here.

COMMIT;
