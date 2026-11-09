-- P1650 review fixes. Four functions replaced; nothing dropped.
--
-- Each body is the newest definition, copied byte for byte except the lines marked "-- P1650 review":
-- diffed against: 20261109100000_p1650_sharing_reaches_people.sql (search_profiles, share_canvas)
-- diffed against: 20261109110000_p1650_skipped_payload_fix.sql (seal_and_send_letter, add_recipient_to_sealed_letter)
--
-- client-safe: every function keeps its argument list, return type, SECURITY DEFINER, search_path and grants (restated
--   REVOKE-then-GRANT). No DROP, no re-sign. search_profiles returns the same columns and may now match a few more
--   people; the skipped lists keep the shape {delivery_id, name} / {kind, id, name} and only change which label is chosen.
--
-- WHAT CHANGES
--   1. add_recipient_to_sealed_letter: the email path finds the account with lower(email) = lower(p_email), as
--      seal_and_send_letter does. A differently cased email used to bind no account, so it posted no card and reported
--      nothing.
--   2. Both letter functions: a whitespace-only typed name counts as empty (NULLIF(btrim(...), '')).
--   3. search_profiles (both branches): a query also matches at every word boundary of the UNSPLIT name, so a name typed
--      as written finds its person ("o'brien" finds "Sean O'Brien", "jean-luc" finds "Jean-Luc Picard"). This replaces the
--      split-into-words predicate and contains it (a word prefix is a prefix at a boundary). Still literal (starts_with),
--      same ranking, scope, minimum, rate limit and 8-row cap.
--   4. A skipped label is never empty: when the name is blank the label is 'this person' / 'this event' / 'this group'
--      (share_canvas) or 'this recipient' (letters).

BEGIN;

-- ============================================================================
-- search_profiles
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
  -- P1650: a query also matches the start of any word of the name; the whole-name and handle prefix keep ranking first.
  -- P1650 review: "any word" is read off the UNSPLIT name, at every position that follows a space, hyphen, apostrophe
  -- (straight or curly) or period, so a name typed as written ("o'brien", "jean-luc") matches.
  IF COALESCE(v_is_admin, false) THEN
    -- Founder/admin override: full-directory search (single admin row by unique index).
    RETURN QUERY
    SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color,
           COALESCE(p.has_pledged, false), COALESCE(p.is_verified, false)
    FROM public.profiles p
    WHERE p.id != v_caller
      AND (starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query)
           OR EXISTS (SELECT 1 FROM generate_series(2, length(lower(p.name))) AS g(i) -- P1650 review
                       WHERE substr(lower(p.name), g.i - 1, 1) IN (' ', '''', '.', '’', '-')
                         AND starts_with(substr(lower(p.name), g.i), v_query)))
    ORDER BY CASE WHEN starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query) THEN 0 ELSE 1 END, -- P1650
             p.name
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
      AND (starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query)
           OR EXISTS (SELECT 1 FROM generate_series(2, length(lower(p.name))) AS g(i) -- P1650 review
                       WHERE substr(lower(p.name), g.i - 1, 1) IN (' ', '''', '.', '’', '-')
                         AND starts_with(substr(lower(p.name), g.i), v_query)))
    ORDER BY CASE WHEN starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query) THEN 0 ELSE 1 END, -- P1650
             p.name
    LIMIT 8;
  END IF;
END;
$$;

-- Triple REVOKE (mitigation 7) — Supabase default privileges grant EXECUTE to anon AND
-- authenticated on new functions (P683/P877 precedent). Then authenticated only.
REVOKE EXECUTE ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

-- ============================================================================
-- share_canvas
-- ============================================================================
CREATE OR REPLACE FUNCTION public.share_canvas(p_name text, p_kind text, p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_name    text := lower(COALESCE(p_name, ''));
  v_canvas  uuid;
  v_entry   uuid;
  v_posted  boolean := false; -- P1650
  v_skipped jsonb := '[]'::jsonb; -- P1650
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  IF v_name !~ '^[a-z0-9_]{1,64}$' OR p_kind IS NULL OR p_kind NOT IN ('event', 'group', 'person') OR p_target IS NULL THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- The caller must actually own a canvas of this name with at least one point on a PUBLISHED version (P1536:
  -- an unpublished canvas is shared only after Publish).
  IF NOT public._canvas_owner_has_points(v_uid, v_name) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- Everything inside a canvas follows the canvas, so a canvas must hold no PUBLIC point. The trigger
  -- below keeps new ones out; this refuses a legacy canvas that still has one (its visibility cannot
  -- change, p586), with the same message as every other refusal.
  IF public._canvas_has_public_point(v_uid, v_name) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- A cancelled event is not a place to share with.
  IF p_kind = 'event' AND EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = p_target AND e.status = 'cancelled'
  ) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  -- P1650 (D2): a NEW event addition must be inside the window; an event already on this canvas is re-shared as before.
  IF p_kind = 'event'
     AND NOT EXISTS (SELECT 1 FROM public.canvas_audience a
                       JOIN public.canvases c ON c.id = a.canvas_id
                      WHERE c.owner_id = v_uid AND c.name = v_name AND a.kind = 'event' AND a.event_id = p_target)
     AND NOT EXISTS (SELECT 1 FROM public.events e
                      WHERE e.id = p_target AND public._canvas_event_in_window(e.datetime, e.duration_minutes)) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'person' THEN
    -- Only a person the owner could find in the invite field (search_profiles), never themselves.
    IF NOT public._canvas_person_eligible(v_uid, p_target) THEN
      RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public._canvas_target_admits(
       p_kind,
       CASE WHEN p_kind = 'event' THEN p_target END,
       CASE WHEN p_kind = 'group' THEN p_target END,
       v_uid) THEN
    RAISE EXCEPTION 'not authorized for this canvas' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.canvases (owner_id, name) VALUES (v_uid, v_name)
  ON CONFLICT (owner_id, name) DO NOTHING;
  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name;

  INSERT INTO public.canvas_audience (canvas_id, kind, event_id, org_id, profile_id)
  VALUES (
    v_canvas, p_kind,
    CASE WHEN p_kind = 'event' THEN p_target END,
    CASE WHEN p_kind = 'group' THEN p_target END,
    CASE WHEN p_kind = 'person' THEN p_target END
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_entry;

  -- P1545: a NEW grant posts one attachment message in the matching chat; a re-share (the entry
  -- already existed) posts nothing. Sharing must never fail because of chat, so a failure to post is a
  -- warning, not an error (the canvas still shows in Shared with you).
  -- P1650: the share also says who was skipped (a block, the daily limit, anything raised); nothing is stored.
  IF v_entry IS NOT NULL THEN
    BEGIN
      v_posted := public._chat_post_canvas_share(v_uid, v_canvas, p_kind, p_target);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'share_canvas: chat message not posted (%)', SQLERRM;
      v_posted := false;
    END;
    IF NOT COALESCE(v_posted, false) THEN
      v_skipped := jsonb_build_array(jsonb_build_object(
        'kind', p_kind, 'id', p_target,
        -- P1650 review: never null; a blank name falls back to a plain label
        'name', COALESCE(
                  NULLIF(btrim(CASE p_kind
                    WHEN 'person' THEN (SELECT pr.name FROM public.profiles pr WHERE pr.id = p_target)
                    WHEN 'event'  THEN (SELECT ev.title FROM public.events ev WHERE ev.id = p_target)
                    ELSE (SELECT o.name FROM public.organization o WHERE o.id = p_target) END), ''),
                  CASE p_kind WHEN 'person' THEN 'this person' WHEN 'event' THEN 'this event' ELSE 'this group' END)));
    END IF;
  END IF;

  RETURN jsonb_build_object('shared', true, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.share_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_canvas(text, text, uuid) TO authenticated;

-- ============================================================================
-- seal_and_send_letter
-- ============================================================================
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
      -- P1650 review: a whitespace-only typed name or email counts as empty.
      v_post_names := v_post_names || COALESCE(NULLIF(btrim(v_del->>'receiver_name'), ''), NULLIF(btrim(v_del->>'receiver_email'), ''))::text;
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
      -- P1650 review: never an empty name.
      v_skipped := v_skipped || jsonb_build_array((
        SELECT jsonb_build_object(
                 'delivery_id', d.id,
                 'name', COALESCE(v_post_names[v_i], NULLIF(btrim(pr.name), ''), 'this recipient'))
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

-- ============================================================================
-- add_recipient_to_sealed_letter
-- ============================================================================
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
    WHERE lower(email) = lower(p_email) -- P1650 review: the same case-insensitive match seal_and_send_letter uses
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
      -- P1650 review: a whitespace-only name or email counts as empty, and the label is never empty.
      v_skipped := jsonb_build_array(jsonb_build_object(
        'delivery_id', v_delivery_id,
        'name', COALESCE(NULLIF(btrim(p_receiver_name), ''), NULLIF(btrim(p_email), ''),
                         NULLIF(btrim((SELECT pr.name FROM profiles pr WHERE pr.id = v_receiver_profile_id)), ''), 'this recipient')));
    END IF;
  END IF;

  RETURN jsonb_build_object('delivery_id', v_delivery_id, 'skipped', v_skipped);
END;
$$;

REVOKE EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  TO authenticated;

-- Post-conditions: authenticated-only EXECUTE, no profile id in a skipped list, the case-insensitive email match is in force.
DO $$
DECLARE
  v_fn  text;
  v_def text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.search_profiles(text)', 'public.share_canvas(text, text, uuid)',
    'public.seal_and_send_letter(uuid, jsonb, jsonb, text)',
    'public.add_recipient_to_sealed_letter(uuid, text, text, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1650 review: % must be executable by authenticated only', v_fn;
    END IF;
  END LOOP;
  v_def := pg_get_functiondef('public.add_recipient_to_sealed_letter(uuid, text, text, uuid)'::regprocedure);
  IF v_def NOT ILIKE '%lower(email) = lower(p_email)%' THEN
    RAISE EXCEPTION 'P1650 review: the email path must match case-insensitively';
  END IF;
  IF v_def ILIKE '%''profile_id'', v_receiver_profile_id%' THEN
    RAISE EXCEPTION 'P1650 review: skipped must not carry a profile id';
  END IF;
END;
$$;

COMMIT;
