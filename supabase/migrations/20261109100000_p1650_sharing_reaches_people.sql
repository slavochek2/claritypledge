-- P1650: sharing reaches people. Search by any word of a name, the people a member already has before anything is
-- typed, only the events that still matter, an invited letter recipient reaches the chat, a share opens the 1:1,
-- and the paperclip lists the canvases a chat may carry.
--
-- diffed against (the newest definition of each, found by grepping every migration; each body is copied byte for
-- byte except the lines marked "-- P1650"):
--   search_profiles                  20260605150000_p878_search_profiles_rpc.sql
--   get_canvas_share_targets         20261021240000_p1515_share_targets_no_cutoff.sql
--   get_canvas_audience              20261021210000_p1515_canvas_read_per_user.sql
--   share_canvas                     20261029100000_p1536_canvas_draft_versions.sql
--   seal_and_send_letter             20261021100100_p1515_seal_letter_skips_foreign_private_points.sql
--   add_recipient_to_sealed_letter   20260610140000_p914_letter_rpc_scope_gate.sql
--   _chat_dm_for_share               20261023100000_p1545_artifacts_data.sql
--   _chat_post_artifact              20261023100000_p1545_artifacts_data.sql
--   _chat_post_canvas_share          20261023100000_p1545_artifacts_data.sql
--   _chat_post_letter_on_delivery    20261023100000_p1545_artifacts_data.sql (dropped here, with its trigger)
-- new functions (grepped: no earlier body): _canvas_event_in_window, get_canvas_share_people,
--   _chat_post_letter_delivery, list_attachable_canvases.
--
-- client-safe: no deployed client breaks.
--   * share_canvas, seal_and_send_letter and add_recipient_to_sealed_letter change their RETURN TYPE (boolean, boolean
--     and uuid become jsonb), so each is dropped and created again inside this transaction with its argument list and
--     its grants unchanged. No deployed caller reads the old value: the canvas service awaits share_canvas and checks
--     only the error; sealLetter spreads the result into an object, and the spread of the old boolean added nothing
--     while the new object only adds the keys `sealed` and `skipped`; the recipient modal ignores the uuid that
--     addRecipientToSealed returns.
--   * _chat_post_artifact and _chat_post_canvas_share (internal, no client role may execute them since P1545) change
--     from void to boolean for the same reason, and _chat_post_letter_on_delivery with its trigger is dropped; their
--     only callers are replaced in this file.
--   * search_profiles keeps its argument list and return shape; get_canvas_audience's event entries gain one key.
--
-- WHAT CHANGES
--   1. search_profiles: a query matches the start of the whole name, of ANY word of the name (split on spaces,
--      hyphens, apostrophes and periods), or of the handle. A whole-name or handle prefix ranks first. Input is still
--      literal (starts_with, no pattern), and scope, admin branch, the 3-character minimum, the rate limit and the
--      8-row cap are unchanged.
--   2. get_canvas_share_people(): the caller's own relationship scope, newest relationship first, at most 8, with
--      the same display-safe columns as search_profiles. The same scope for everyone, the admin included.
--   3. _canvas_event_in_window + get_canvas_share_targets + share_canvas: a NEW event addition must be upcoming, running
--      (now before start plus duration) or started within the last 7 days. An event already on the canvas keeps
--      admitting (_canvas_event_admits is untouched) and can be re-shared. get_canvas_audience returns the datetime of
--      every event entry, so the panel can show the date of an event the window no longer offers.
--   4. letter_deliveries.created_by_sender records WHO made the row. seal_and_send_letter and
--      add_recipient_to_sealed_letter write true; every other creator (create_letter_delivery,
--      create_letter_delivery_on_open, the confirm edge function) leaves the column default false. Only a true row ever
--      posts a card, and the post is made by the sealing function itself after the letter is sealed, for one-to-one AND
--      one-to-many letters. The P1545 trigger is gone: a trigger cannot report who was skipped.
--   5. _chat_dm_for_share (used only by the sender's own share and the sender's own invitation) no longer needs a shared
--      reason. A block, the 20-new-1:1s-a-day limit and "an existing 1:1 stays usable" still apply. start_dm,
--      _chat_shared_reason and contact codes are untouched. share_canvas, seal_and_send_letter and
--      add_recipient_to_sealed_letter return which recipients were skipped (a block, the limit, anything raised);
--      nothing is stored, and sharing or sealing never fails because of chat.
--   6. list_attachable_canvases(conversation): the caller's own published canvases this chat may carry, by exactly the
--      _chat_can_attach rule PLUS a direct audience entry for the chat (a link-only canvas is accepted by the server
--      but its card would resolve as unavailable to the recipient, so it is not offered). _chat_can_attach is unchanged.

BEGIN;

-- ============================================================================
-- 0. Who created a delivery
-- ============================================================================
-- Closed to client roles like the rest of the table's non-granted columns (letter_deliveries has no client SELECT or
-- UPDATE on it since P1446 and P1487): a new column is not readable or writable by anon or authenticated.
ALTER TABLE public.letter_deliveries ADD COLUMN IF NOT EXISTS created_by_sender boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.letter_deliveries.created_by_sender IS
  'P1650: true only when the sender created this row (seal_and_send_letter, add_recipient_to_sealed_letter). '
  'false for a reader who enrolled themselves, and the default for any other creator. Only a true row posts a chat card.';

-- ============================================================================
-- 1. The events window, in one place
-- ============================================================================
CREATE OR REPLACE FUNCTION public._canvas_event_in_window(p_datetime timestamptz, p_duration_minutes integer)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_datetime IS NOT NULL
     AND (p_datetime > now() - interval '7 days'
          OR now() < p_datetime + make_interval(mins => COALESCE(p_duration_minutes, 0)))
$$;
REVOKE ALL ON FUNCTION public._canvas_event_in_window(timestamptz, integer) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. search_profiles: any word of the name
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
  -- P1650: a query also matches the start of any word of the name (split on spaces, hyphens, apostrophes and periods);
  -- the whole-name and handle prefix keep ranking first.
  IF COALESCE(v_is_admin, false) THEN
    -- Founder/admin override: full-directory search (single admin row by unique index).
    RETURN QUERY
    SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color,
           COALESCE(p.has_pledged, false), COALESCE(p.is_verified, false)
    FROM public.profiles p
    WHERE p.id != v_caller
      AND (starts_with(lower(p.name), v_query) OR starts_with(lower(p.slug), v_query)
           OR EXISTS (SELECT 1 FROM regexp_split_to_table(lower(p.name), '[ ''.’-]+') AS w(word) WHERE starts_with(w.word, v_query))) -- P1650
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
           OR EXISTS (SELECT 1 FROM regexp_split_to_table(lower(p.name), '[ ''.’-]+') AS w(word) WHERE starts_with(w.word, v_query))) -- P1650
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
-- 3. People before typing
-- ============================================================================
-- The same six relationship arms as p878_relationship_scope, each carrying its own time, joined back to the scope
-- helper so the list is exactly the set the server accepts as a canvas person (_canvas_person_eligible: in scope).
-- The admin gets the same list: relationships, never the directory.
CREATE OR REPLACE FUNCTION public.get_canvas_share_people()
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
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH edges AS (
    -- letters sent: the delivery time
    SELECT ld.receiver_profile_id AS pid, ld.created_at AS at
      FROM public.clarity_letters cl
      JOIN public.letter_deliveries ld ON ld.letter_id = cl.id
     WHERE cl.sender_id = v_uid AND ld.receiver_profile_id IS NOT NULL AND ld.receiver_profile_id <> v_uid
    UNION ALL
    -- letters received
    SELECT cl.sender_id, ld.created_at
      FROM public.letter_deliveries ld
      JOIN public.clarity_letters cl ON cl.id = ld.letter_id
     WHERE ld.receiver_profile_id = v_uid AND cl.sender_id <> v_uid
    UNION ALL
    -- agreements accepted (same predicate as the scope helper): the time the partner signed
    SELECT ca.partner_profile_id, COALESCE(ca.partner_signed_at, ca.created_at)
      FROM public.clarity_agreements ca
     WHERE ca.creator_profile_id = v_uid AND ca.partner_profile_id IS NOT NULL
       AND (ca.status = 'active' OR (ca.status = 'terminated' AND ca.partner_signed_at IS NOT NULL))
    UNION ALL
    SELECT ca.creator_profile_id, COALESCE(ca.partner_signed_at, ca.created_at)
      FROM public.clarity_agreements ca
     WHERE ca.partner_profile_id = v_uid
       AND (ca.status = 'active' OR (ca.status = 'terminated' AND ca.partner_signed_at IS NOT NULL))
    UNION ALL
    -- witnesses, both directions
    SELECT w.profile_id, w.created_at FROM public.witnesses w WHERE w.witness_profile_id = v_uid
    UNION ALL
    SELECT w.witness_profile_id, w.created_at FROM public.witnesses w
     WHERE w.profile_id = v_uid AND w.witness_profile_id IS NOT NULL
    UNION ALL
    -- the latest chat message with them
    SELECT CASE WHEN c.dm_user_a = v_uid THEN c.dm_user_b ELSE c.dm_user_a END, c.last_message_at
      FROM public.chat_conversations c
     WHERE c.kind = 'dm' AND (c.dm_user_a = v_uid OR c.dm_user_b = v_uid) AND c.last_message_at IS NOT NULL
  ),
  latest AS (
    SELECT e.pid, max(e.at) AS at
      FROM edges e
     WHERE e.pid IS NOT NULL AND e.pid <> v_uid
       AND EXISTS (SELECT 1 FROM public.p878_relationship_scope(v_uid) s WHERE s = e.pid)
     GROUP BY e.pid
  )
  SELECT p.id, p.name, p.slug, p.avatar_url, p.avatar_color,
         COALESCE(p.has_pledged, false), COALESCE(p.is_verified, false)
    FROM latest l
    JOIN public.profiles p ON p.id = l.pid
   ORDER BY l.at DESC NULLS LAST, p.name, p.id
   LIMIT 8;
END;
$$;
REVOKE ALL ON FUNCTION public.get_canvas_share_people() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_share_people() TO authenticated;

-- ============================================================================
-- 4. The events offered (D2) and the panel's dates
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_canvas_share_targets()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'events', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', e.id, 'title', e.title, 'slug', e.slug,
                 'datetime', e.datetime, 'hosted', e.host_id IS NOT DISTINCT FROM v_uid)
               ORDER BY e.datetime DESC, e.id)
        FROM public.events e
       WHERE e.status IS DISTINCT FROM 'cancelled'
         AND public._canvas_event_in_window(e.datetime, e.duration_minutes) -- P1650
         AND (e.host_id = v_uid
              OR EXISTS (SELECT 1 FROM public.event_rsvps r WHERE r.event_id = e.id AND r.profile_id = v_uid))
         AND public._canvas_event_admits(e.id, v_uid)
    ), '[]'::jsonb),
    'groups', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'id', o.id, 'name', o.name, 'slug', o.slug, 'public', o.visibility = 'public')
               ORDER BY o.name, o.id)
        FROM public.membership m
        JOIN public.organization o ON o.id = m.org_id
       WHERE m.user_id = v_uid
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_canvas_share_targets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_share_targets() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_canvas_audience(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text := lower(COALESCE(p_name, ''));
  v_canvas uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;

  SELECT c.id INTO v_canvas FROM public.canvases c WHERE c.owner_id = v_uid AND c.name = v_name;
  IF v_canvas IS NULL THEN
    RETURN jsonb_build_object('entries', '[]'::jsonb, 'general_access', 'restricted', 'link_token', NULL);
  END IF;

  RETURN jsonb_build_object('general_access', (SELECT c.general_access FROM public.canvases c WHERE c.id = v_canvas), 'link_token', (SELECT c.link_token FROM public.canvases c WHERE c.id = v_canvas), 'entries', COALESCE((
    SELECT jsonb_agg(q.entry ORDER BY q.rank, q.created_at, q.id)
      FROM (
        SELECT a.id, a.created_at,
               CASE a.kind WHEN 'person' THEN 0 WHEN 'event' THEN 1 ELSE 2 END AS rank,
               jsonb_build_object(
                 'kind', a.kind,
                 'id', COALESCE(a.event_id, a.org_id, a.profile_id),
                 'name', COALESCE(e.title, o.name, pe.name),
                 'slug', COALESCE(e.slug, o.slug, pe.slug),
                 'datetime', e.datetime, -- P1650: the date of an event already on the canvas (null for a person or a group)
                 'public', (a.kind IN ('event', 'person') OR o.visibility = 'public'),
                 'owner_admitted', t.owner_in,
                 'count', CASE WHEN a.kind = 'person' THEN 1 ELSE COALESCE(ppl.n, 0) END,
                 'names', CASE WHEN a.kind = 'person'
                               THEN jsonb_build_array(jsonb_build_object('id', pe.id, 'name', pe.name, 'slug', pe.slug))
                               WHEN a.kind = 'event' OR o.visibility = 'public'
                               THEN COALESCE(ppl.names, '[]'::jsonb)
                               ELSE NULL END
               ) AS entry
          FROM public.canvas_audience a
          LEFT JOIN public.events e ON e.id = a.event_id
          LEFT JOIN public.organization o ON o.id = a.org_id
          LEFT JOIN public.profiles pe ON pe.id = a.profile_id
          CROSS JOIN LATERAL (
            SELECT (a.kind = 'person' OR public._canvas_target_admits(a.kind, a.event_id, a.org_id, v_uid)) AS owner_in
          ) t
          LEFT JOIN LATERAL (
            SELECT count(*) AS n,
                   jsonb_agg(jsonb_build_object('id', pr.id, 'name', pr.name, 'slug', pr.slug)
                             ORDER BY pr.name, pr.id) AS names
              FROM (
                SELECT e2.host_id AS uid FROM public.events e2
                 WHERE a.kind = 'event' AND e2.id = a.event_id AND e2.host_id IS NOT NULL
                UNION
                SELECT r.profile_id FROM public.event_rsvps r
                 WHERE a.kind = 'event' AND r.event_id = a.event_id
                UNION
                SELECT m.user_id FROM public.membership m
                 WHERE a.kind = 'group' AND m.org_id = a.org_id
              ) cand
              JOIN public.profiles pr ON pr.id = cand.uid
             WHERE t.owner_in
               AND cand.uid <> v_uid
               AND public._canvas_target_admits(a.kind, a.event_id, a.org_id, cand.uid)
          ) ppl ON true
         WHERE a.canvas_id = v_canvas
      ) q
  ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.get_canvas_audience(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_canvas_audience(text) TO authenticated;

-- ============================================================================
-- 5. Chat helpers
-- ============================================================================
-- The 1:1 for the sender's own share or invitation. P1650: no shared reason is needed (the sender chose this person).
-- Everything else stays: the person exists, nobody blocked anybody, an existing 1:1 is reused, a NEW one counts toward
-- the sender's 20 a day. NULL = no message can be posted.
CREATE OR REPLACE FUNCTION public._chat_dm_for_share(p_from uuid, p_to uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_a   uuid;
  v_b   uuid;
  v_id  uuid;
  v_new integer;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from = p_to THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_to) THEN
    RETURN NULL;
  END IF;
  IF public._chat_blocked_either(p_from, p_to) THEN
    RETURN NULL;
  END IF;
  v_a := LEAST(p_from, p_to);
  v_b := GREATEST(p_from, p_to);
  SELECT c.id INTO v_id FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  -- P1650: the shared-connection check that stood here is gone for this path only.
  PERFORM pg_advisory_xact_lock(hashtextextended('chat_start_dm:' || p_from::text, 0));
  SELECT count(*)::integer INTO v_new FROM public.chat_conversations c
   WHERE c.kind = 'dm' AND c.created_by = p_from AND c.created_at > now() - interval '24 hours';
  IF v_new >= 20 THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.chat_conversations (kind, dm_user_a, dm_user_b, created_by)
  VALUES ('dm', v_a, v_b, p_from)
  ON CONFLICT (dm_user_a, dm_user_b) WHERE kind = 'dm' DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT c.id INTO v_id FROM public.chat_conversations c
     WHERE c.kind = 'dm' AND c.dm_user_a = v_a AND c.dm_user_b = v_b;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_dm_for_share(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Both return a boolean now (was void): true only when a message was written.
DROP FUNCTION IF EXISTS public._chat_post_canvas_share(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public._chat_post_artifact(uuid, uuid, text, uuid);

CREATE OR REPLACE FUNCTION public._chat_post_artifact(p_conversation uuid, p_author uuid, p_kind text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv public.chat_conversations;
  v_at   timestamptz;
BEGIN
  IF p_conversation IS NULL OR p_author IS NULL OR p_kind NOT IN ('canvas', 'letter') OR p_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF NOT FOUND OR public._chat_access_since(p_conversation, p_author) IS NULL THEN
    RETURN false;
  END IF;
  IF v_conv.kind = 'dm' THEN
    IF v_conv.dm_user_a IS NULL OR v_conv.dm_user_b IS NULL
       OR public._chat_blocked_either(v_conv.dm_user_a, v_conv.dm_user_b) THEN
      RETURN false;
    END IF;
  ELSIF v_conv.kind NOT IN ('group', 'event') THEN
    RETURN false;
  END IF;

  INSERT INTO public.chat_messages (conversation_id, author_id, kind, attachment_kind, attachment_id, created_at)
  VALUES (p_conversation, p_author, 'message', p_kind, p_id, clock_timestamp())
  RETURNING created_at INTO v_at;

  UPDATE public.chat_conversations c SET last_message_at = v_at WHERE c.id = p_conversation;
  INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
  VALUES (p_conversation, p_author, v_at, false)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                 EXCLUDED.last_read_at),
        manual_unread = false;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._chat_post_artifact(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._chat_post_canvas_share(p_owner uuid, p_canvas uuid, p_kind text, p_target uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv uuid;
BEGIN
  IF p_kind = 'person' THEN
    v_conv := public._chat_dm_for_share(p_owner, p_target);
  ELSIF p_kind = 'group' THEN
    INSERT INTO public.chat_conversations (kind, org_id) VALUES ('group', p_target)
    ON CONFLICT (org_id) WHERE kind = 'group' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'group' AND c.org_id = p_target;
  ELSIF p_kind = 'event' THEN
    INSERT INTO public.chat_conversations (kind, event_id) VALUES ('event', p_target)
    ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = p_target;
  END IF;
  RETURN public._chat_post_artifact(v_conv, p_owner, 'canvas', p_canvas);
END;
$$;
REVOKE ALL ON FUNCTION public._chat_post_canvas_share(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- The letter trigger is replaced by an explicit call from the two sender-side functions below.
DROP TRIGGER IF EXISTS p1545_chat_post_letter ON public.letter_deliveries;
DROP FUNCTION IF EXISTS public._chat_post_letter_on_delivery();

-- One card for one delivery the SENDER created. 'posted' = a message was written; 'skipped' = a card was due and was
-- not written (a block, the daily limit, no access); 'none' = nothing was due (a reader's row, no account, the sender).
CREATE OR REPLACE FUNCTION public._chat_post_letter_delivery(p_delivery uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_letter   uuid;
  v_receiver uuid;
  v_by       boolean;
  v_sender   uuid;
  v_conv     uuid;
BEGIN
  SELECT d.letter_id, d.receiver_profile_id, d.created_by_sender
    INTO v_letter, v_receiver, v_by
    FROM public.letter_deliveries d WHERE d.id = p_delivery;
  IF NOT FOUND OR NOT COALESCE(v_by, false) OR v_receiver IS NULL THEN
    RETURN 'none';
  END IF;
  SELECT l.sender_id INTO v_sender FROM public.clarity_letters l WHERE l.id = v_letter;
  IF v_sender IS NULL OR v_sender = v_receiver THEN
    RETURN 'none';
  END IF;
  v_conv := public._chat_dm_for_share(v_sender, v_receiver);
  IF v_conv IS NOT NULL AND public._chat_post_artifact(v_conv, v_sender, 'letter', v_letter) THEN
    RETURN 'posted';
  END IF;
  RETURN 'skipped';
END;
$$;
REVOKE ALL ON FUNCTION public._chat_post_letter_delivery(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. share_canvas: the window for a new event, and who was skipped
-- ============================================================================
DROP FUNCTION IF EXISTS public.share_canvas(text, text, uuid);
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
        'name', CASE p_kind
                  WHEN 'person' THEN (SELECT pr.name FROM public.profiles pr WHERE pr.id = p_target)
                  WHEN 'event'  THEN (SELECT ev.title FROM public.events ev WHERE ev.id = p_target)
                  ELSE (SELECT o.name FROM public.organization o WHERE o.id = p_target) END));
    END IF;
  END IF;

  RETURN jsonb_build_object('shared', true, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.share_canvas(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.share_canvas(text, text, uuid) TO authenticated;

-- ============================================================================
-- 7. seal_and_send_letter: a sender-created delivery is recorded and posts
-- ============================================================================
DROP FUNCTION IF EXISTS seal_and_send_letter(UUID, JSONB, JSONB, TEXT);
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
  v_post_id             UUID;     -- P1650
  v_post_status         TEXT;     -- P1650
  v_skipped             JSONB := '[]'::jsonb;  -- P1650
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
    END IF;
  END LOOP;

  UPDATE clarity_letters
  SET status = 'sealed', sealed_at = now()
  WHERE id = p_letter_id;

  -- P1650: a card in each invited recipient's 1:1 (one-to-one AND one-to-many letters), after the letter is sealed.
  -- Sealing must never fail because of chat: a failure is a warning and the recipient is reported as skipped.
  FOREACH v_post_id IN ARRAY v_post_ids
  LOOP
    BEGIN
      v_post_status := public._chat_post_letter_delivery(v_post_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'seal_and_send_letter: chat message not posted (%)', SQLERRM;
      v_post_status := 'skipped';
    END;
    IF v_post_status = 'skipped' THEN
      v_skipped := v_skipped || jsonb_build_array((
        SELECT jsonb_build_object(
                 'delivery_id', d.id, 'profile_id', d.receiver_profile_id,
                 'name', COALESCE(NULLIF(d.receiver_name, ''), pr.name))
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
-- 8. add_recipient_to_sealed_letter: the same, for a recipient added later
-- ============================================================================
DROP FUNCTION IF EXISTS add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID);
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
      v_skipped := jsonb_build_array(jsonb_build_object(
        'delivery_id', v_delivery_id, 'profile_id', v_receiver_profile_id,
        'name', COALESCE(NULLIF(p_receiver_name, ''), (SELECT pr.name FROM profiles pr WHERE pr.id = v_receiver_profile_id))));
    END IF;
  END IF;

  RETURN jsonb_build_object('delivery_id', v_delivery_id, 'skipped', v_skipped);
END;
$$;

REVOKE EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION add_recipient_to_sealed_letter(UUID, TEXT, TEXT, UUID)
  TO authenticated;

-- ============================================================================
-- 9. The paperclip's canvases
-- ============================================================================
-- The caller's OWN published canvases this chat may carry: the _chat_can_attach rule, plus a direct audience entry for
-- this chat (a person entry in a 1:1; the group or the event in a channel). A link-only canvas is accepted by the server
-- but its card resolves only through admission and a published version, so it would read as unavailable to the
-- recipient; it is not offered. Attaching never shares. _chat_can_attach itself is not changed.
CREATE OR REPLACE FUNCTION public.list_attachable_canvases(p_conversation uuid)
RETURNS TABLE (
  canvas_id uuid,
  name      text,
  title     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_conv  public.chat_conversations;
  v_other uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_conversation;
  IF NOT FOUND OR public._chat_access_since(p_conversation, v_uid) IS NULL THEN
    RETURN;
  END IF;
  IF v_conv.kind = 'dm' THEN
    v_other := CASE WHEN v_conv.dm_user_a = v_uid THEN v_conv.dm_user_b ELSE v_conv.dm_user_a END;
    IF v_other IS NULL THEN
      RETURN;
    END IF;
  ELSIF v_conv.kind NOT IN ('group', 'event') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.title
    FROM public.canvases c
   WHERE c.owner_id = v_uid
     AND public._canvas_owner_has_points(v_uid, c.name)
     AND public._chat_can_attach('canvas', c.id, v_uid, p_conversation)
     AND EXISTS (
       SELECT 1 FROM public.canvas_audience a
        WHERE a.canvas_id = c.id
          AND ((v_conv.kind = 'dm'    AND a.kind = 'person' AND a.profile_id = v_other)
            OR (v_conv.kind = 'group' AND a.kind = 'group'  AND a.org_id = v_conv.org_id)
            OR (v_conv.kind = 'event' AND a.kind = 'event'  AND a.event_id = v_conv.event_id)))
   ORDER BY c.created_at DESC, c.name;
END;
$$;
REVOKE ALL ON FUNCTION public.list_attachable_canvases(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_attachable_canvases(uuid) TO authenticated;

-- ============================================================================
-- Post-conditions
-- ============================================================================
DO $$
DECLARE
  v_fn text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'p1545_chat_post_letter') THEN
    RAISE EXCEPTION 'P1650: the letter trigger must be gone';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public._chat_dm_for_share(uuid, uuid)', 'public._chat_post_artifact(uuid, uuid, text, uuid)',
    'public._chat_post_canvas_share(uuid, uuid, text, uuid)', 'public._chat_post_letter_delivery(uuid)',
    'public._canvas_event_in_window(timestamptz, integer)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1650: % must not be executable by a client role', v_fn;
    END IF;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.search_profiles(text)', 'public.get_canvas_share_people()', 'public.get_canvas_share_targets()',
    'public.get_canvas_audience(text)', 'public.share_canvas(text, text, uuid)',
    'public.seal_and_send_letter(uuid, jsonb, jsonb, text)',
    'public.add_recipient_to_sealed_letter(uuid, text, text, uuid)', 'public.list_attachable_canvases(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1650: % must be executable by authenticated only', v_fn;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
