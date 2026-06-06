-- P878: Relationship-scoped people picker.
--
-- client-safe: all REVOKEs here target BRAND-NEW functions/tables (search_profiles,
--   p878_relationship_scope, create_agreement_with_profile, search_rate_limits) — no
--   deployed bundle references them. seal_and_send_letter keeps its (UUID, JSONB, JSONB)
--   signature (replace in place); add_recipient_to_sealed_letter gains a 4th param with
--   DEFAULT NULL — the old 3-named-param call shape still resolves (old overload dropped,
--   per the P731 overload-ambiguity lesson).
--
-- What this adds:
--   1. profiles.is_admin column (default-deny SELECT per P886 — NOT added to any GRANT)
--      + single-admin partial unique index
--      + guard trigger extension pinning is_admin AND is_certifier on client-role writes
--        (P880 pinned only is_verified/has_pledged; is_certifier had the same gap —
--        flagged in the P878 Security Review).
--   2. search_rate_limits counter table (in-DB rate limit, 30 calls/min/user).
--   3. p878_relationship_scope(uuid) — SETOF uuid helper enumerating the caller's
--      existing relationship edges (letters both directions, accepted agreements both
--      directions, witnesses both directions). Reused by search_profiles and
--      create_agreement_with_profile.
--   4. search_profiles(text) — SECURITY DEFINER, relationship-scoped prefix search.
--      Returns ONLY display-safe columns. NEVER email/linkedin_url/reason — that is the
--      load-bearing P877 invariant.
--   5. create_agreement_with_profile(...) — AD-6: address an agreement partner by
--      profile_id; partner email is resolved INSIDE the DB and never serialized to the
--      browser beyond the (pre-existing) creator-visible agreement row.
--   6. seal_and_send_letter / add_recipient_to_sealed_letter — deliveries may now carry
--      receiver_profile_id instead of receiver_email; email resolves in-DB (AD-6).

BEGIN;

-- ============================================================================
-- 1a. is_admin column (P686 is_certifier pattern)
-- ============================================================================
-- The founder's row is set true MANUALLY in the DB (documented in
-- .private/docs/founder-accounts.md) — never seeded here, never in committed code.
-- P886 default-deny: a new profiles column is NOT readable by anon/authenticated
-- until added to the column GRANT. is_admin is deliberately NOT added (mitigation 9).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Single-admin structural guard (mitigation 4): multi-admin misassignment is
-- impossible, not just procedurally discouraged.
CREATE UNIQUE INDEX IF NOT EXISTS unique_admin
  ON public.profiles (is_admin) WHERE is_admin = true;

-- ============================================================================
-- 1b. Self-promotion guard (mitigation 3) — extend the P880 trust-column trigger
-- ============================================================================
-- Postgres column-level REVOKE UPDATE (col) is a no-op while the role holds a
-- table-level UPDATE grant (P886 trap, decisions.md 2026-06-04) — so the guard is the
-- P880 trigger, not a grant. Pins is_admin AND is_certifier (same gap, flagged in the
-- P878 Security Review) alongside the P880 trust columns.
-- SECURITY INVOKER (default) — the client-vs-server distinction relies on current_user.
CREATE OR REPLACE FUNCTION public.guard_profile_trust_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Only client roles are constrained. SECURITY DEFINER accessors run as the owner;
  -- service_role is the admin/test path. Both fall through untouched.
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      NEW.is_verified  := false;
      NEW.has_pledged  := false;
      NEW.is_admin     := false;  -- P878
      NEW.is_certifier := false;  -- P878 (same gap as is_admin)
    ELSE  -- UPDATE
      NEW.is_verified  := OLD.is_verified;
      NEW.has_pledged  := OLD.has_pledged;
      NEW.is_admin     := OLD.is_admin;     -- P878
      NEW.is_certifier := OLD.is_certifier; -- P878
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- Trigger object unchanged (P880 created it BEFORE INSERT OR UPDATE FOR EACH ROW);
-- CREATE OR REPLACE of the function body is sufficient.

-- ============================================================================
-- 2. search_rate_limits — in-DB per-user rate limit (mitigation 6)
-- ============================================================================
-- One row per active searcher; stale windows are overwritten on the next call —
-- no cleanup job needed.
CREATE TABLE IF NOT EXISTS public.search_rate_limits (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  call_count   integer NOT NULL DEFAULT 1
);

-- Locked down: only the SECURITY DEFINER RPC (owner) and service_role touch it.
ALTER TABLE public.search_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.search_rate_limits FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. p878_relationship_scope — the six-arm UNION (AD-1)
-- ============================================================================
-- SECURITY INVOKER on purpose: only ever called from inside SECURITY DEFINER functions
-- (where current_user is the owner, bypassing RLS on the source tables). Not callable
-- via PostgREST after the REVOKE below.
CREATE OR REPLACE FUNCTION public.p878_relationship_scope(p_caller uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- Letters sent: I am sender, counterpart is receiver
  SELECT ld.receiver_profile_id
  FROM public.clarity_letters cl
  JOIN public.letter_deliveries ld ON ld.letter_id = cl.id
  WHERE cl.sender_id = p_caller
    AND ld.receiver_profile_id IS NOT NULL
    AND ld.receiver_profile_id != p_caller

  UNION

  -- Letters received: I am receiver, counterpart is sender
  SELECT cl.sender_id
  FROM public.letter_deliveries ld
  JOIN public.clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.receiver_profile_id = p_caller
    AND cl.sender_id != p_caller

  UNION

  -- Agreements: I am creator (accepted-at-some-point only — pending/declined excluded,
  -- mitigation 5: a fake invite must not be a scope-gaming vector)
  SELECT ca.partner_profile_id
  FROM public.clarity_agreements ca
  WHERE ca.creator_profile_id = p_caller
    AND ca.partner_profile_id IS NOT NULL
    AND ca.status IN ('active', 'terminated')

  UNION

  -- Agreements: I am partner (accepted only)
  SELECT ca.creator_profile_id
  FROM public.clarity_agreements ca
  WHERE ca.partner_profile_id = p_caller
    AND ca.status IN ('active', 'terminated')

  UNION

  -- Witnesses: I witnessed someone
  SELECT w.profile_id
  FROM public.witnesses w
  WHERE w.witness_profile_id = p_caller

  UNION

  -- Witnesses: someone witnessed me (witness_profile_id nullable — unregistered endorsers)
  SELECT w.witness_profile_id
  FROM public.witnesses w
  WHERE w.profile_id = p_caller
    AND w.witness_profile_id IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.p878_relationship_scope(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. search_profiles — the picker RPC (AD-2)
-- ============================================================================
-- VOLATILE (default): the rate-limit upsert writes.
CREATE OR REPLACE FUNCTION public.search_profiles(p_query text)
RETURNS TABLE (
  profile_id   uuid,
  name         text,
  slug         text,
  avatar_url   text,
  avatar_color text,
  has_pledged  boolean,
  is_verified  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_query    text := lower(trim(p_query));
  v_is_admin boolean;
  v_count    integer;
BEGIN
  -- Hard auth gate (precedent: upsert_my_profile)
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'search_profiles requires an authenticated caller';
  END IF;

  -- Server-side min length (mitigation 2) — client-only checks are bypassable.
  -- trim() first so whitespace padding can't satisfy the gate.
  IF v_query IS NULL OR length(v_query) < 3 THEN
    RAISE EXCEPTION 'search_profiles: query must be at least 3 characters';
  END IF;

  -- Rate limit (mitigation 6): atomic upsert-and-check, 30 calls per rolling minute.
  -- Both CASE arms read the OLD window_start (srl.*), so reset + count are consistent.
  INSERT INTO public.search_rate_limits AS srl (user_id, window_start, call_count)
  VALUES (v_caller, now(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    window_start = CASE WHEN srl.window_start < now() - interval '1 minute'
                        THEN now() ELSE srl.window_start END,
    call_count   = CASE WHEN srl.window_start < now() - interval '1 minute'
                        THEN 1 ELSE srl.call_count + 1 END
  RETURNING srl.call_count INTO v_count;

  IF v_count > 30 THEN
    RETURN;  -- graceful throttle: empty result, no error (spec: "empty/throttled")
  END IF;

  SELECT p.is_admin INTO v_is_admin FROM public.profiles p WHERE p.id = v_caller;

  -- Both branches: prefix match via starts_with (mitigation 1 — no ILIKE wildcard
  -- semantics, '%'/'_' in input are literals), self-excluded, LIMIT 8 hard literal,
  -- display-safe columns ONLY. NEVER email / linkedin_url / reason — in ANY branch.
  IF COALESCE(v_is_admin, false) THEN
    -- Founder/admin override: full-directory search (single admin row by unique index).
    RETURN QUERY
    SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color,
           COALESCE(p.has_pledged, false), COALESCE(p.is_verified, false)
    FROM public.profiles p
    WHERE p.id != v_caller
      AND (starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query))
    ORDER BY p.name
    LIMIT 8;
  ELSE
    RETURN QUERY
    SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color,
           COALESCE(p.has_pledged, false), COALESCE(p.is_verified, false)
    FROM public.profiles p
    WHERE p.id != v_caller
      -- EXISTS (not IN): IN over a set containing NULL yields NULL, silently
      -- dropping valid rows. The scope helper filters NULLs today; EXISTS makes
      -- that non-load-bearing.
      -- OR p.is_admin: the single admin row (founder, unique-index-enforced) is
      -- globally discoverable by name/slug — a deliberate one-row exception so any
      -- user can reach the operator. NOT an open directory: every other profile
      -- stays relationship-scoped.
      AND (
        EXISTS (SELECT 1 FROM public.p878_relationship_scope(v_caller) s WHERE s = p.id)
        OR p.is_admin
      )
      AND (starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query))
    ORDER BY p.name
    LIMIT 8;
  END IF;
END;
$$;

-- Triple REVOKE (mitigation 7) — Supabase default privileges grant EXECUTE to anon AND
-- authenticated on new functions (P683/P877 precedent). Then authenticated only.
REVOKE EXECUTE ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- ============================================================================
-- 5. create_agreement_with_profile — AD-6 addressing for agreements
-- ============================================================================
-- The picker yields a profile_id, never an email. This RPC resolves the partner email
-- INSIDE the DB. Scope-gated: a non-admin caller can only address profiles already in
-- their relationship scope (the only ids the picker can have given them); admin can
-- address anyone. Mirrors createAgreement's client-side guards (self-invite, duplicate).
CREATE OR REPLACE FUNCTION public.create_agreement_with_profile(
  p_partner_profile_id  uuid,
  p_partner_display_name text,
  p_terms_text           text,
  p_visibility           text,
  p_agreement_version    text
)
RETURNS SETOF public.clarity_agreements
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path = public (NOT '' / P877 convention): the INSERT fires the legacy
-- trg_set_agreement_display_id trigger, which references clarity_agreements_display_seq
-- unqualified — an empty search_path makes the trigger fail with 42P01. Table refs in
-- this body stay schema-qualified anyway.
SET search_path = public
AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_is_admin      boolean;
  v_partner_email text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'create_agreement_with_profile requires an authenticated caller';
  END IF;

  IF p_partner_profile_id = v_caller THEN
    RAISE EXCEPTION 'Cannot create an agreement with yourself';
  END IF;

  SELECT p.is_admin INTO v_is_admin FROM public.profiles p WHERE p.id = v_caller;

  -- NOT EXISTS (not NOT IN): NOT IN over a set containing NULL yields NULL,
  -- which would silently PASS this guard. EXISTS-based check is NULL-proof.
  IF NOT COALESCE(v_is_admin, false)
     AND NOT EXISTS (
       SELECT 1 FROM public.p878_relationship_scope(v_caller) s
       WHERE s = p_partner_profile_id
     ) THEN
    -- Same wording shape as the empty state: never confirm whether the id exists.
    RAISE EXCEPTION 'Partner is not in your relationship scope';
  END IF;

  SELECT p.email INTO v_partner_email FROM public.profiles p WHERE p.id = p_partner_profile_id;
  IF v_partner_email IS NULL THEN
    RAISE EXCEPTION 'Partner profile has no resolvable email';
  END IF;

  -- Duplicate guard (mirrors hasActiveAgreementWith)
  IF EXISTS (
    SELECT 1 FROM public.clarity_agreements ca
    WHERE ca.creator_profile_id = v_caller
      AND lower(ca.partner_email) = lower(v_partner_email)
      AND ca.status IN ('active', 'pending')
  ) THEN
    RAISE EXCEPTION 'duplicate_agreement: an active or pending agreement with this person already exists';
  END IF;

  RETURN QUERY
  INSERT INTO public.clarity_agreements (
    creator_profile_id, partner_profile_id, partner_email,
    partner_display_name, terms_text, visibility, agreement_version
  ) VALUES (
    v_caller, p_partner_profile_id, v_partner_email,
    p_partner_display_name, p_terms_text, p_visibility, p_agreement_version
  )
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_agreement_with_profile(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_agreement_with_profile(uuid, text, text, text, text)
  TO authenticated;

-- ============================================================================
-- 6a. seal_and_send_letter — deliveries may carry receiver_profile_id (AD-6)
-- ============================================================================
-- diffed against: 20260513000000_p833_seal_rpc_version_desync.sql
-- Identical to the P833 body EXCEPT the delivery loop: a delivery entry may now carry
-- receiver_profile_id INSTEAD of receiver_email (picker-selected recipients). Email is
-- resolved in-DB; self-send is checked on the resolved identity. Signature unchanged
-- (UUID, JSONB, JSONB) — replaces in place.
CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id UUID,
  p_predictions JSONB DEFAULT '[]'::jsonb,
  p_deliveries JSONB DEFAULT '[]'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id           UUID;
  v_sender_email        TEXT;
  v_mode                TEXT;
  v_letter_status       TEXT;
  v_source_doc_id       UUID;
  v_pred                JSONB;
  v_del                 JSONB;
  v_receiver_email      TEXT;
  v_receiver_profile_id UUID;
  v_desynced_stories    TEXT;
BEGIN
  SELECT sender_id, mode, status, source_doc_id
  INTO v_sender_id, v_mode, v_letter_status, v_source_doc_id
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'Letter not found: %', p_letter_id;
  END IF;

  IF v_sender_id != auth.uid() THEN
    RAISE EXCEPTION 'Only the letter sender can seal this letter';
  END IF;

  IF v_letter_status != 'draft' THEN
    RAISE EXCEPTION 'Letter is already sealed or expired (status: %)', v_letter_status;
  END IF;

  SELECT email INTO v_sender_email
  FROM auth.users
  WHERE id = v_sender_id;

  -- P833: pre-flight desync check.
  SELECT string_agg(s.id::text, ', ' ORDER BY s.id)
  INTO v_desynced_stories
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN story_versions sv
    ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
    AND sv.id IS NULL;

  IF v_desynced_stories IS NOT NULL THEN
    RAISE EXCEPTION
      'seal_and_send_letter: story_versions desync for story_id(s): % — run backfill before sealing',
      v_desynced_stories;
  END IF;

  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    jsonb_build_object(
      'storyText', COALESCE(sv.content, ''),
      'imageUrl', COALESCE(s.image_url, ''),
      'points', COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'id', pt.id::text,
            'text', pt.statement,
            'authorPosition', (
              SELECT pp.position::text
              FROM point_positions pp
              WHERE pp.point_id = pt.id AND pp.user_id = v_sender_id
              LIMIT 1
            ),
            'visibility', pt.visibility::text,
            'hidden', COALESCE((ds.point_config->'hidden')::jsonb ? pt.id::text, false)
          ) ORDER BY sp.created_at
        )
        FROM story_points sp
        JOIN points pt ON pt.id = sp.point_id
        WHERE sp.story_id = ds.story_id
        ), '[]'::jsonb
      ),
      'order', COALESCE(ds.point_config->'order', '[]'::jsonb),
      'hidden', COALESCE(ds.point_config->'hidden', '[]'::jsonb)
    ),
    s.visibility::text
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  JOIN story_versions sv ON sv.story_id = s.id AND sv.version_number = s.current_version
  WHERE ds.doc_id = v_source_doc_id
    AND (v_mode = 'one-to-one' OR s.visibility = 'public'::content_visibility)
  ON CONFLICT (letter_id, story_id) DO NOTHING;

  FOR v_pred IN SELECT * FROM jsonb_array_elements(p_predictions)
  LOOP
    INSERT INTO letter_predictions (letter_id, delivery_id, story_id, prediction)
    VALUES (
      p_letter_id,
      CASE WHEN v_pred->>'delivery_id' IS NOT NULL
        THEN (v_pred->>'delivery_id')::UUID
        ELSE NULL
      END,
      (v_pred->>'story_id')::UUID,
      (v_pred->>'prediction')::INTEGER
    )
    ON CONFLICT ON CONSTRAINT letter_predictions_unique DO NOTHING;
  END LOOP;

  FOR v_del IN SELECT * FROM jsonb_array_elements(p_deliveries)
  LOOP
    v_receiver_email := v_del->>'receiver_email';
    v_receiver_profile_id := NULLIF(v_del->>'receiver_profile_id', '')::UUID;

    -- P878 (AD-6): picker-selected recipients carry receiver_profile_id, no email.
    -- Resolve the email in-DB; it is never serialized back to the browser.
    IF v_receiver_email IS NULL AND v_receiver_profile_id IS NOT NULL THEN
      IF v_receiver_profile_id = v_sender_id THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver matches sender)';
      END IF;
      SELECT email INTO v_receiver_email
      FROM profiles
      WHERE id = v_receiver_profile_id;
      IF v_receiver_email IS NULL THEN
        RAISE EXCEPTION 'Recipient profile has no resolvable email';
      END IF;
    ELSIF v_receiver_email IS NOT NULL THEN
      -- P757 path: resolve profile by email (case-insensitive)
      IF v_receiver_email = v_sender_email THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver_email matches sender)';
      END IF;
      v_receiver_profile_id := NULL;
      SELECT id INTO v_receiver_profile_id
      FROM profiles
      WHERE lower(email) = lower(v_receiver_email)
      LIMIT 1;
    END IF;

    INSERT INTO letter_deliveries (
      letter_id, receiver_email, receiver_name,
      receiver_profile_id, invitation_expires_at
    )
    VALUES (
      p_letter_id,
      v_receiver_email,
      v_del->>'receiver_name',
      v_receiver_profile_id,
      now() + interval '7 days'
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB) TO authenticated;

-- ============================================================================
-- 6b. add_recipient_to_sealed_letter — optional p_receiver_profile_id (AD-6)
-- ============================================================================
-- diffed against: 20260416210000_p731_set_receiver_profile_id_on_add_recipient.sql
-- Adding a defaulted param changes the signature → drop the stale 3-param overload
-- first (P731 lesson: two overloads cause "could not choose best candidate").
DROP FUNCTION IF EXISTS add_recipient_to_sealed_letter(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION add_recipient_to_sealed_letter(
  p_letter_id UUID,
  p_email TEXT DEFAULT NULL,
  p_receiver_name TEXT DEFAULT NULL,
  p_receiver_profile_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id           UUID;
  v_status              TEXT;
  v_delivery_id         UUID;
  v_receiver_email      TEXT;
  v_receiver_profile_id UUID;
BEGIN
  SELECT sender_id, status
  INTO v_sender_id, v_status
  FROM clarity_letters
  WHERE id = p_letter_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Letter not found' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'Only the letter sender can add recipients' USING ERRCODE = '42501';
  END IF;

  IF v_status != 'sealed' THEN
    RAISE EXCEPTION 'Can only add recipients to sealed letters' USING ERRCODE = 'P0001';
  END IF;

  IF p_email IS NULL AND p_receiver_profile_id IS NULL THEN
    RAISE EXCEPTION 'Either an email or a recipient profile is required' USING ERRCODE = 'P0001';
  END IF;

  IF p_email IS NOT NULL THEN
    -- Email path (unchanged from P731)
    IF p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
      RAISE EXCEPTION 'Invalid email format' USING ERRCODE = 'P0001';
    END IF;
    v_receiver_email := p_email;
    SELECT id INTO v_receiver_profile_id
    FROM profiles
    WHERE email = p_email
    LIMIT 1;
  ELSE
    -- P878 (AD-6): picker path — resolve email in-DB from profile_id.
    IF p_receiver_profile_id = v_sender_id THEN
      RAISE EXCEPTION 'Cannot send a letter to yourself' USING ERRCODE = 'P0001';
    END IF;
    SELECT email INTO v_receiver_email
    FROM profiles
    WHERE id = p_receiver_profile_id;
    IF v_receiver_email IS NULL THEN
      RAISE EXCEPTION 'Recipient profile has no resolvable email' USING ERRCODE = 'P0001';
    END IF;
    v_receiver_profile_id := p_receiver_profile_id;
  END IF;

  INSERT INTO letter_deliveries (
    letter_id,
    receiver_email,
    receiver_name,
    receiver_profile_id,
    status,
    invitation_token,
    invitation_expires_at
  )
  VALUES (
    p_letter_id,
    v_receiver_email,
    p_receiver_name,
    v_receiver_profile_id,
    'sent',
    gen_random_uuid(),
    now() + interval '30 days'
  )
  RETURNING id INTO v_delivery_id;

  RETURN v_delivery_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.search_profiles(text) IS
  'P878: relationship-scoped prefix search for the people picker. Returns display-safe '
  'columns ONLY — never email/linkedin_url/reason (P877 invariant). Admin row searches '
  'the full directory. Rate-limited 30/min via search_rate_limits.';
COMMENT ON FUNCTION public.p878_relationship_scope(uuid) IS
  'P878: SETOF profile ids the caller shares a letter/agreement/witness relationship with. '
  'Internal helper — not executable by client roles.';
COMMENT ON FUNCTION public.create_agreement_with_profile(uuid, text, text, text, text) IS
  'P878 (AD-6): create an agreement addressed by profile_id; partner email resolved in-DB. '
  'Scope-gated for non-admins.';

COMMIT;
