-- P914: letter RPCs — add the P878 relationship-scope gate to in-DB email resolution.
--
-- SECURITY FIX. seal_and_send_letter and add_recipient_to_sealed_letter resolve a
-- recipient's profiles.email from a caller-supplied receiver_profile_id with only a
-- self-send check. Email is read inside a SECURITY DEFINER function (runs as owner),
-- so the P877 column REVOKE does not constrain it — the in-function scope gate is the
-- intended control, and it was missing (present in create_agreement_with_profile,
-- absent in both letter RPCs). Any authenticated caller could resolve any profile's
-- email by addressing an arbitrary id on a self-created letter (profiles.id is
-- anon-enumerable; these RPCs are unthrottled). This adds the same admin-OR-
-- relationship-scope gate the agreement RPC already uses.
--
-- NOT EXISTS (never NOT IN): a NULL in p878_relationship_scope's set would make NOT IN
-- yield NULL and the guard would silently pass — decisions.md 2026-06-06 [technical]
-- "P878 SQL gotchas — EXISTS over IN for set-returning scope checks".
--
-- Bodies reproduced verbatim from the current authoritative versions, with ONLY the
-- v_is_admin declaration + fetch + scope gate added. Signatures unchanged;
-- CREATE OR REPLACE in place; idempotent.
-- diffed against: 20260606120000_p898_seal_rpc_lead_count.sql (seal_and_send_letter — P898 lead_count body)
-- diffed against: 20260605150000_p878_search_profiles_rpc.sql (add_recipient_to_sealed_letter — section 6b)

BEGIN;

-- ============================================================================
-- seal_and_send_letter — P898 body + P914 scope gate
-- ============================================================================
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
  v_is_admin            BOOLEAN;  -- P914
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

  -- P914: resolve the sender's admin flag once; used to bypass the scope gate below.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM profiles p WHERE p.id = v_sender_id;

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
          -- P898: compose shows only current heads (P800) — seal must match
          AND pt.superseded_by IS NULL
        ), '[]'::jsonb
      ),
      'order', COALESCE(ds.point_config->'order', '[]'::jsonb),
      'hidden', COALESCE(ds.point_config->'hidden', '[]'::jsonb),
      -- P898: pre/post-story split. Carry only valid numbers (floored, >= 0);
      -- absent/malformed seals as 1 (the historical implicit single lead).
      'lead_count', CASE
        WHEN jsonb_typeof(ds.point_config->'lead_count') = 'number'
          THEN to_jsonb(GREATEST(0, floor((ds.point_config->>'lead_count')::numeric)::int))
        ELSE '1'::jsonb
      END
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
      -- P914: scope gate — a non-admin sender may only resolve the email of a profile
      -- already in their relationship scope. Without this, the in-DB email resolve is
      -- an email-harvesting oracle. NOT EXISTS (never NOT IN) per decisions.md.
      IF NOT v_is_admin
         AND NOT EXISTS (
           SELECT 1 FROM public.p878_relationship_scope(v_sender_id) s
           WHERE s = v_receiver_profile_id
         ) THEN
        RAISE EXCEPTION 'Recipient is not in your relationship scope';
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
-- add_recipient_to_sealed_letter — P878 body (section 6b) + P914 scope gate
-- ============================================================================
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
  v_is_admin            BOOLEAN;  -- P914
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
    -- P914: scope gate — a non-admin sender may only resolve the email of a profile
    -- already in their relationship scope. NOT EXISTS (never NOT IN) per decisions.md.
    SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = v_sender_id;
    IF NOT v_is_admin
       AND NOT EXISTS (
         SELECT 1 FROM public.p878_relationship_scope(v_sender_id) s
         WHERE s = p_receiver_profile_id
       ) THEN
      RAISE EXCEPTION 'Recipient is not in your relationship scope' USING ERRCODE = '42501';
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

COMMIT;
