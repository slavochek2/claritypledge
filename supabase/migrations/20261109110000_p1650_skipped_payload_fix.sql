-- P1650 review fix: the `skipped` list returned by seal_and_send_letter and add_recipient_to_sealed_letter must not
-- tell a sender anything the sender did not type.
--
-- diffed against: 20261109100000_p1650_sharing_reaches_people.sql (the newest definition of both functions, applied to
--   TEST already, so this is a second migration rather than an edit of that file). Each body is copied byte for byte
--   except the lines marked "-- P1650 fix".
--
-- client-safe: both functions keep their argument list, their jsonb return type, SECURITY DEFINER, search_path and
--   grants (no DROP, so no re-sign). The only change is inside each element of `skipped`: it is now exactly
--   {delivery_id, name}. `profile_id` is gone. No client reads `profile_id` from it yet (the keys shipped one migration
--   earlier and the frontend that reads them is not released).
--
-- THE DEFECT. A sender who typed only an email got the matched account's profile_id and profile name back for a skipped
--   (for example blocked) recipient, which tells the sender that the email belongs to an account and whose.
-- THE RULE. name = the receiver_name the sender typed, if non-empty; otherwise the email the sender typed (email path);
--   otherwise (the sender picked a person, who was already in their scope) the profile name. An email the server resolved
--   from a profile on the picker path is never returned. No profile id is returned.

BEGIN;

CREATE OR REPLACE FUNCTION seal_and_send_letter(
  p_letter_id      UUID,
  p_predictions    JSONB DEFAULT '[]'::jsonb,
  p_deliveries     JSONB DEFAULT '[]'::jsonb,
  p_responses_mode TEXT DEFAULT 'invite'
)
RETURNS JSONB
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
  v_is_admin            BOOLEAN;  -- P975 (restored from P914)
  v_delivery_id         UUID;     -- P1650
  v_post_ids            UUID[] := '{}';  -- P1650: deliveries to post a card for, after the seal
  v_post_names          TEXT[] := '{}';  -- P1650 fix: what the sender typed for each of them (NULL = picked from the list)
  v_post_id             UUID;     -- P1650
  v_post_status         TEXT;     -- P1650
  v_skipped             JSONB := '[]'::jsonb;  -- P1650
  v_i                   INTEGER;  -- P1650 fix
BEGIN
  -- Validate p_responses_mode before any writes (don't rely on CHECK for error message)
  IF p_responses_mode NOT IN ('off', 'invite', 'push') THEN
    RAISE EXCEPTION 'Invalid responses_mode: %. Must be one of: off, invite, push', p_responses_mode;
  END IF;

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

  -- P975 (restored from P914): resolve admin bypass once, up front.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
  FROM profiles p
  WHERE p.id = v_sender_id;

  -- P833: pre-flight desync check.
  SELECT string_agg(s.id::text, ', ' ORDER BY s.id)
  INTO v_desynced_stories
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN profiles ap ON ap.id = s.author_id
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

  -- P952 AD-2: write responses_mode in-transaction, after ownership check
  UPDATE clarity_letters
  SET responses_mode = p_responses_mode
  WHERE id = p_letter_id;

  INSERT INTO letter_story_snapshots (letter_id, story_id, version_id, position, point_config, visibility)
  SELECT
    p_letter_id,
    ds.story_id,
    sv.id,
    ds.position,
    jsonb_build_object(
      'storyText', COALESCE(sv.content, ''),
      'imageUrl', COALESCE(s.image_url, ''),
      'videoUrl', COALESCE(s.video_url, ''),
      'videoQuotes', COALESCE(s.video_quotes, '{"quotes": [], "durationSeconds": null}'::jsonb),
      'storyAuthorId', s.author_id::text,
      'storyAuthorName', COALESCE(ap.name, ''),
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
          AND pt.superseded_by IS NULL
          -- P1515: never copy the statement of a private point the sender does not own. Anyone
          -- may link their own story to a point id they know, so without this a letter would
          -- carry another person's private statement in its snapshot.
          AND (pt.visibility = 'public'::content_visibility OR pt.first_validator_id = v_sender_id)
        ), '[]'::jsonb
      ),
      'order', COALESCE(ds.point_config->'order', '[]'::jsonb),
      'hidden', COALESCE(ds.point_config->'hidden', '[]'::jsonb),
      'lead_count', CASE
        WHEN jsonb_typeof(ds.point_config->'lead_count') = 'number'
          THEN to_jsonb(GREATEST(0, floor((ds.point_config->>'lead_count')::numeric)::int))
        ELSE '1'::jsonb
      END
    ),
    s.visibility::text
  FROM doc_stories ds
  JOIN stories s ON s.id = ds.story_id
  LEFT JOIN profiles ap ON ap.id = s.author_id
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

    IF v_receiver_email IS NULL AND v_receiver_profile_id IS NOT NULL THEN
      IF v_receiver_profile_id = v_sender_id THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver matches sender)';
      END IF;
      -- P975 (restored from P914): relationship-scope gate. A non-admin sender may
      -- only resolve the email of a profile inside their relationship scope. Blocks
      -- the email-harvesting oracle that the gateless P952 4-arg overload reopened.
      -- NOT EXISTS (never NOT IN): a NULL in the scope set would make NOT IN return
      -- NULL (treated as not-true), silently failing open.
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
      IF v_receiver_email = v_sender_email THEN
        RAISE EXCEPTION 'Cannot send a letter to yourself (receiver_email matches sender)';
      END IF;
      v_receiver_profile_id := NULL;
      SELECT id INTO v_receiver_profile_id
      FROM profiles
      WHERE lower(email) = lower(v_receiver_email)
      LIMIT 1;
    END IF;

    v_delivery_id := NULL; -- P1650: a conflicting insert returns no row; never carry the previous id
    INSERT INTO letter_deliveries (
      letter_id, receiver_email, receiver_name,
      receiver_profile_id, invitation_expires_at,
      created_by_sender -- P1650: the sender made this row
    )
    VALUES (
      p_letter_id,
      v_receiver_email,
      v_del->>'receiver_name',
      v_receiver_profile_id,
      now() + interval '7 days',
      true -- P1650
    )
    ON CONFLICT (letter_id, receiver_email) WHERE receiver_email IS NOT NULL DO NOTHING
    RETURNING id INTO v_delivery_id; -- P1650

    IF v_delivery_id IS NOT NULL AND v_receiver_profile_id IS NOT NULL THEN
      v_post_ids := v_post_ids || v_delivery_id; -- P1650
      -- P1650 fix: the label the sender typed. The typed name, else the typed email; NULL when the sender picked a person
      -- from the list (the email in v_receiver_email was then resolved by the server and must never be returned).
      v_post_names := v_post_names || COALESCE(NULLIF(v_del->>'receiver_name', ''), v_del->>'receiver_email')::text;
    END IF;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  -- P1650: a card in each invited recipient's 1:1 (one-to-one AND one-to-many letters), after the letter is sealed.
  -- Sealing must never fail because of chat: a failure is a warning and the recipient is reported as skipped.
  FOR v_i IN 1 .. cardinality(v_post_ids)
  LOOP
    v_post_id := v_post_ids[v_i];
    BEGIN
      v_post_status := public._chat_post_letter_delivery(v_post_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'seal_and_send_letter: chat message not posted (%)', SQLERRM;
      v_post_status := 'skipped';
    END;
    IF v_post_status = 'skipped' THEN
      -- P1650 fix: exactly {delivery_id, name}; never a profile id, never a server-resolved email.
      v_skipped := v_skipped || jsonb_build_array((
        SELECT jsonb_build_object(
                 'delivery_id', d.id,
                 'name', COALESCE(v_post_names[v_i], pr.name))
          FROM letter_deliveries d
          LEFT JOIN profiles pr ON pr.id = d.receiver_profile_id
         WHERE d.id = v_post_id));
    END IF;
  END LOOP;

  RETURN jsonb_build_object('sealed', true, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seal_and_send_letter(UUID, JSONB, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION add_recipient_to_sealed_letter(
  p_letter_id UUID,
  p_email TEXT DEFAULT NULL,
  p_receiver_name TEXT DEFAULT NULL,
  p_receiver_profile_id UUID DEFAULT NULL
)
RETURNS JSONB
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
  v_post_status         TEXT := 'none';  -- P1650
  v_skipped             JSONB := '[]'::jsonb;  -- P1650
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
    invitation_expires_at,
    created_by_sender -- P1650: the sender made this row
  )
  VALUES (
    p_letter_id,
    v_receiver_email,
    p_receiver_name,
    v_receiver_profile_id,
    'sent',
    gen_random_uuid(),
    now() + interval '30 days',
    true -- P1650
  )
  RETURNING id INTO v_delivery_id;

  -- P1650: a card in the recipient's 1:1, never a reason to fail the add.
  IF v_receiver_profile_id IS NOT NULL THEN
    BEGIN
      v_post_status := public._chat_post_letter_delivery(v_delivery_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'add_recipient_to_sealed_letter: chat message not posted (%)', SQLERRM;
      v_post_status := 'skipped';
    END;
    IF v_post_status = 'skipped' THEN
      -- P1650 fix: exactly {delivery_id, name}. The name the sender typed, else the email the sender typed (email path),
      -- else (picker path) the profile name. p_email is NULL on the picker path, so the server-resolved email never appears.
      v_skipped := jsonb_build_array(jsonb_build_object(
        'delivery_id', v_delivery_id,
        'name', COALESCE(NULLIF(p_receiver_name, ''), p_email, (SELECT pr.name FROM profiles pr WHERE pr.id = v_receiver_profile_id))));
    END IF;
  END IF;

  RETURN jsonb_build_object('delivery_id', v_delivery_id, 'skipped', v_skipped);
END;
$$;

REVOKE EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  TO authenticated;

-- Post-conditions: client roles keep EXECUTE through authenticated only, and the payload no longer names a profile.
DO $$
DECLARE
  v_fn  text;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.seal_and_send_letter(uuid, jsonb, jsonb, text)',
    'public.add_recipient_to_sealed_letter(uuid, text, text, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1650 fix: % must be executable by authenticated only', v_fn;
    END IF;
    v_def := pg_get_functiondef(v_fn::regprocedure);
    IF v_def ILIKE '%''profile_id'', d.receiver_profile_id%' OR v_def ILIKE '%''profile_id'', v_receiver_profile_id%' THEN
      RAISE EXCEPTION 'P1650 fix: % still returns a profile id in skipped', v_fn;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
