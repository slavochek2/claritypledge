-- P520 — erasure hardening, round 2 (codex review findings 6, 7, 8).
--
-- diffed against: 20260902090000_p520_erasure_hardening.sql
--   public.erase_my_account() is redefined. Behaviour changes vs. that version:
--     * SET search_path = '' and every object reference schema-qualified (finding 7);
--     * two explicit auth-schema deletes added immediately before the auth.users
--       delete: auth.refresh_tokens and auth.flow_state (finding 8 — see § 3).
--   Nothing else in the body changes: the same statements, in the same order, with
--   the same predicates. `public.` / `auth.` prefixes only.
--   public._p520_scrub_live_state() is redefined with SET search_path = ''. Its body
--   touches no tables and no non-builtin functions, so the text is otherwise identical.
--
-- client-safe: no policy, grant, column or constraint semantics change for any caller.
--   The three constraints validated in § 1 already enforced every future write and every
--   ON DELETE action; VALIDATE only re-checks pre-existing rows, and the rows that would
--   have failed are nulled first (their referenced profile does not exist, so the
--   PostgREST embed already resolved to null and the client already rendered 'Unknown').
--   The two auth deletes remove rows GoTrue itself would have orphaned; the RPC's own
--   caller is being deleted in the same statement block.
--
-- 6. UNVALIDATED CONSTRAINTS. 20260901213000 recreated points_first_validator_id_fkey,
--    events_host_id_fkey and badge_points_verified_by_fkey as NOT VALID because the
--    tables already held rows pointing at profiles that no longer exist — the constraints
--    they replaced were not enforcing. Leaving them NOT VALID indefinitely means the
--    integrity defect is never repaired, only inherited. This migration records every
--    orphan in public.p520_legacy_fk_orphans (so the dangling uuid is not lost), nulls
--    the column, then VALIDATEs all three. Counts on the test project at authoring time:
--    913 points, 5 events, 2 badge_points.
--
-- 7. DEFINER HARDENING. erase_my_account is the strongest privilege bridge in the API
--    schema: it runs as postgres and deletes from auth.users. It ran with
--    search_path = 'public, pg_temp', which lets any object resolvable in those schemas
--    be shadowed. It now runs with search_path = '' and names every table and function in
--    full. § 4 asserts, at migration time, that exactly one erase_my_account overload
--    exists, that it is owned by the migration role, and that neither anon nor PUBLIC
--    holds EXECUTE — a later overload or a widened grant fails the deploy.
--
-- 8. GOTRUE CLEANUP WAS ASSUMED, NOT VERIFIED. Introspecting the deployed auth schema
--    (not the application migrations) shows identities, sessions, mfa_factors,
--    one_time_tokens, oauth_authorizations, oauth_consents, webauthn_challenges and
--    webauthn_credentials DO carry ON DELETE CASCADE to auth.users — but two do not:
--      * auth.refresh_tokens.user_id is a varchar with NO foreign key at all; those rows
--        are reached only through refresh_tokens_session_id_fkey → auth.sessions, so a
--        row whose session_id is NULL (legacy GoTrue) survives the user's deletion
--        carrying the user id and the token;
--      * auth.flow_state.user_id (PKCE) has no foreign key either.
--    Both are now deleted explicitly. The integration spec asserts zero rows in EVERY
--    auth table carrying the subject id after erasure, enumerated from the catalogue
--    rather than from a hand-written list, so a future GoTrue table is caught.

-- ---------------------------------------------------------------------------
-- 1. Repair the legacy orphans, then validate the three constraints (finding 6)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.p520_legacy_fk_orphans (
  table_name   text        NOT NULL,
  column_name  text        NOT NULL,
  row_id       uuid        NOT NULL,
  orphan_value uuid        NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, column_name, row_id)
);
ALTER TABLE public.p520_legacy_fk_orphans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.p520_legacy_fk_orphans FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.p520_legacy_fk_orphans IS
  'P520: the profile id each legacy orphaned FK column held before it was nulled so the constraint could be VALIDATEd. Service role only; the ids reference profiles that no longer exist.';

INSERT INTO public.p520_legacy_fk_orphans (table_name, column_name, row_id, orphan_value)
SELECT 'points', 'first_validator_id', p.id, p.first_validator_id
  FROM public.points p
 WHERE p.first_validator_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.first_validator_id)
ON CONFLICT DO NOTHING;
UPDATE public.points p SET first_validator_id = NULL
 WHERE p.first_validator_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p.first_validator_id);

INSERT INTO public.p520_legacy_fk_orphans (table_name, column_name, row_id, orphan_value)
SELECT 'events', 'host_id', e.id, e.host_id
  FROM public.events e
 WHERE e.host_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = e.host_id)
ON CONFLICT DO NOTHING;
UPDATE public.events e SET host_id = NULL
 WHERE e.host_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = e.host_id);

INSERT INTO public.p520_legacy_fk_orphans (table_name, column_name, row_id, orphan_value)
SELECT 'badge_points', 'verified_by', b.id, b.verified_by
  FROM public.badge_points b
 WHERE b.verified_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = b.verified_by)
ON CONFLICT DO NOTHING;
UPDATE public.badge_points b SET verified_by = NULL
 WHERE b.verified_by IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = b.verified_by);

ALTER TABLE public.points       VALIDATE CONSTRAINT points_first_validator_id_fkey;
ALTER TABLE public.events       VALIDATE CONSTRAINT events_host_id_fkey;
ALTER TABLE public.badge_points VALIDATE CONSTRAINT badge_points_verified_by_fkey;

-- ---------------------------------------------------------------------------
-- 2. live_state scrub helper — search_path = '' (finding 7)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._p520_scrub_live_state(
  p_state jsonb,
  p_name  text,
  p_slug  text,
  p_tomb  text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v jsonb := p_state;
  k text;
  m jsonb;
BEGIN
  IF v IS NULL OR jsonb_typeof(v) <> 'object' THEN
    RETURN v;
  END IF;

  FOREACH k IN ARRAY ARRAY['currentIdeaOriginator','currentSpeaker','currentListener',
                            'pendingRatingRequest','currentlySpeaking','checkerName',
                            'proverName','skippedBy','partnerName'] LOOP
    IF v ? k AND v->>k = p_name THEN
      v := jsonb_set(v, ARRAY[k], to_jsonb(p_tomb));
    END IF;
  END LOOP;

  FOREACH k IN ARRAY ARRAY['roleSelections','sliderRatings','listenActivelyRatings','talkTime'] LOOP
    m := v->k;
    IF m IS NOT NULL AND jsonb_typeof(m) = 'object' AND m ? p_name THEN
      m := (m - p_name) || jsonb_build_object(p_tomb, m->p_name);
      v := jsonb_set(v, ARRAY[k], m);
    END IF;
  END LOOP;

  IF v->'selectedStoryData' IS NOT NULL
     AND jsonb_typeof(v->'selectedStoryData') = 'object'
     AND p_slug IS NOT NULL
     AND v->'selectedStoryData'->>'authorSlug' = p_slug THEN
    v := jsonb_set(v, ARRAY['selectedStoryData','authorName'], to_jsonb(p_tomb));
    v := jsonb_set(v, ARRAY['selectedStoryData','authorSlug'], 'null'::jsonb);
    v := jsonb_set(v, ARRAY['selectedStoryData','authorAvatarUrl'], 'null'::jsonb);
  END IF;

  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._p520_scrub_live_state(jsonb, text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. erase_my_account — search_path = '', qualified, + the two auth orphans
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_name          text;
  v_email         text;
  v_slug          text;
  v_tomb          constant text := 'Deleted user';
  v_tomb_email    constant text := 'deleted-user@invalid';
  v_sessions      uuid[] := '{}';
  v_same_name     uuid[] := '{}';
  v_counterparts  uuid[];
  v_their_stories uuid[];
  v_out           jsonb := '{}'::jsonb;
  n               integer;
  s               record;
  v_my_name       text;
  v_other_name    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'erase_my_account: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.name, p.email, p.slug INTO v_name, v_email, v_slug FROM public.profiles p WHERE p.id = v_uid;

  IF v_name IS NOT NULL THEN

    -- ---- Lock my sessions first: in-flight live writers queue behind these row
    -- locks and re-evaluate their predicates after this commits (§ 4 of the round-1 header).
    PERFORM 1 FROM public.clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid
       FOR UPDATE;
    SELECT COALESCE(array_agg(id), '{}') INTO v_sessions
      FROM public.clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid;

    -- ---- Agreements (RESTRICT both sides) --------------------------------------
    UPDATE public.clarity_agreements
       SET status               = 'terminated',
           terminated_at        = COALESCE(terminated_at, now()),
           terminated_by        = NULL,
           partner_profile_id   = NULL,
           partner_email        = v_tomb_email,
           partner_display_name = v_tomb
     WHERE partner_profile_id = v_uid
        OR (partner_profile_id IS NULL AND lower(partner_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_anonymised', n);

    DELETE FROM public.clarity_agreements WHERE creator_profile_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_deleted', n);

    -- ---- Story verifications (NO ACTION, NOT NULL both sides) --------------------
    SELECT array_agg(DISTINCT x) INTO v_counterparts
      FROM (SELECT speaker_id  AS x FROM public.story_verifications WHERE listener_id = v_uid
            UNION
            SELECT listener_id AS x FROM public.story_verifications WHERE speaker_id  = v_uid) q
     WHERE x <> v_uid;

    SELECT array_agg(DISTINCT sv.story_id) INTO v_their_stories
      FROM public.story_verifications sv
      JOIN public.stories st ON st.id = sv.story_id
     WHERE (sv.speaker_id = v_uid OR sv.listener_id = v_uid)
       AND st.author_id <> v_uid;

    DELETE FROM public.story_verifications WHERE speaker_id = v_uid OR listener_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('verifications_deleted', n);

    UPDATE public.profiles p
       SET ears_count = (SELECT count(DISTINCT sv.speaker_id) FROM public.story_verifications sv
                          WHERE sv.listener_id = p.id AND sv.accuracy_achieved),
           verification_session_count =
             (SELECT count(*) FROM public.story_verifications sv WHERE sv.listener_id = p.id)
           + (SELECT count(*) FROM public.story_verifications sv
               WHERE sv.speaker_id = p.id AND sv.speaker_id <> sv.listener_id)
     WHERE p.id = ANY(COALESCE(v_counterparts, '{}'::uuid[]));

    UPDATE public.stories st
       SET understood_count = (SELECT count(DISTINCT sv.listener_id) FROM public.story_verifications sv
                                WHERE sv.story_id = st.id AND sv.accuracy_achieved)
     WHERE st.id = ANY(COALESCE(v_their_stories, '{}'::uuid[]));

    -- ---- Letters I sent, docs I own (NO ACTION, NOT NULL) ------------------------
    UPDATE public.clarity_sessions SET source_letter_id = NULL
     WHERE source_letter_id IN (SELECT id FROM public.clarity_letters WHERE sender_id = v_uid);
    DELETE FROM public.story_explain_backs WHERE recorder_id = v_uid;
    DELETE FROM public.clarity_letters WHERE sender_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('letters_deleted', n);
    DELETE FROM public.clarity_docs WHERE owner_id = v_uid;

    -- ---- Letters delivered TO me by others --------------------------------------
    DELETE FROM public.letter_point_responses
     WHERE delivery_id IN (SELECT id FROM public.letter_deliveries WHERE receiver_profile_id = v_uid);
    UPDATE public.letter_deliveries
       SET receiver_profile_id = NULL, receiver_email = NULL, receiver_name = v_tomb
     WHERE receiver_profile_id = v_uid
        OR (receiver_email IS NOT NULL AND lower(receiver_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('deliveries_anonymised', n);

    -- ---- Live sessions ------------------------------------------------------------
    -- A session nobody else ever joined is mine alone: delete it outright.
    DELETE FROM public.clarity_sessions
     WHERE id = ANY(v_sessions) AND creator_profile_id = v_uid
       AND joiner_profile_id IS NULL AND joiner_name IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('solo_sessions_deleted', n);

    -- Transcripts hold my verbatim speech — erased (spec [FOUNDER DECISION]).
    DELETE FROM public.session_transcripts WHERE session_id = ANY(v_sessions);
    DELETE FROM public.transcription_jobs  WHERE session_id = ANY(v_sessions);

    -- Per shared session: name-only tables use the SESSION-TIME name and only when the
    -- counterparty's name differs; live_state is scrubbed by key.
    FOR s IN
      SELECT id, code, creator_profile_id, joiner_profile_id, creator_name, joiner_name, live_state
        FROM public.clarity_sessions
       WHERE id = ANY(v_sessions)
    LOOP
      IF s.creator_profile_id = v_uid THEN
        v_my_name := s.creator_name;  v_other_name := s.joiner_name;
      ELSIF s.joiner_profile_id = v_uid THEN
        v_my_name := s.joiner_name;   v_other_name := s.creator_name;
      ELSE
        v_my_name := NULL;            v_other_name := NULL;   -- target_listener only: no name on the row
      END IF;

      IF v_my_name IS NOT NULL AND v_my_name IS NOT DISTINCT FROM v_other_name THEN
        v_same_name := v_same_name || s.id;
      ELSIF v_my_name IS NOT NULL THEN
        -- Rows that are MINE (author/actor) go; my name on the counterparty's rows is tombstoned.
        DELETE FROM public.clarity_verifications v
         USING public.clarity_chat_messages m
         WHERE v.message_id = m.id AND m.session_id = s.id AND v.verifier_name = v_my_name;
        DELETE FROM public.clarity_chat_messages WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM public.clarity_ideas         WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM public.clarity_live_turns    WHERE session_id = s.id AND actor_name  = v_my_name;
        UPDATE public.clarity_live_turns
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        UPDATE public.clarity_demo_rounds
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        DELETE FROM public.ml_training_sessions WHERE session_code = s.code AND user_name = v_my_name;
      END IF;

      UPDATE public.clarity_sessions
         SET live_state = public._p520_scrub_live_state(live_state, COALESCE(v_my_name, v_name), v_slug, v_tomb)
       WHERE id = s.id AND live_state IS NOT NULL;
    END LOOP;

    -- Identity columns: matched on the ID, never the name. Shared sessions are closed.
    UPDATE public.clarity_sessions
       SET creator_profile_id = CASE WHEN creator_profile_id = v_uid THEN NULL   ELSE creator_profile_id END,
           creator_name       = CASE WHEN creator_profile_id = v_uid THEN v_tomb ELSE creator_name       END,
           joiner_profile_id  = CASE WHEN joiner_profile_id  = v_uid THEN NULL   ELSE joiner_profile_id  END,
           joiner_name        = CASE WHEN joiner_profile_id  = v_uid THEN v_tomb ELSE joiner_name        END,
           target_listener_id = CASE WHEN target_listener_id = v_uid THEN NULL   ELSE target_listener_id END,
           status             = 'cancelled'
     WHERE id = ANY(v_sessions);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('sessions_anonymised', n);

    UPDATE public.clarity_sessions SET source_story_id = NULL
     WHERE source_story_id IN (SELECT id FROM public.stories WHERE author_id = v_uid);

    -- ---- Positions, then their history (trigger order) ------------------------------
    DELETE FROM public.point_positions WHERE user_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('positions_deleted', n);
    DELETE FROM public.point_position_history WHERE user_id = v_uid;
    DELETE FROM public.story_point_history    WHERE user_id = v_uid;

    -- ---- My content ---------------------------------------------------------------------
    DELETE FROM public.stories WHERE author_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('stories_deleted', n);

    -- ---- Community data I created: orphan, never delete ---------------------------------
    UPDATE public.points SET first_validator_id = NULL WHERE first_validator_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('points_orphaned', n);
    UPDATE public.events SET host_id = NULL WHERE host_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('events_orphaned', n);

    -- ---- Endorsements I gave (matched on the id column) -----------------------------------
    UPDATE public.witnesses
       SET witness_profile_id = NULL, witness_name = v_tomb, witness_linkedin_url = NULL
     WHERE witness_profile_id = v_uid;

    -- ---- Logs / room memberships that outlive me -------------------------------------------
    UPDATE public.email_send_log SET profile_id = NULL WHERE profile_id = v_uid;
    UPDATE public.event_room_members SET profile_id = NULL, display_name = v_tomb WHERE profile_id = v_uid;

    -- ---- PII tables with no FK at all ---------------------------------------------------------
    DELETE FROM public.terms_acceptances WHERE user_id = v_uid;
    DELETE FROM public.session_consents  WHERE user_id = v_uid;
  END IF;

  -- ---- Audit row, then the identity itself -------------------------------------------------
  INSERT INTO public.erased_subjects (user_id, same_name_sessions)
  VALUES (v_uid, v_same_name)
  ON CONFLICT (user_id) DO UPDATE SET erased_at = now(), same_name_sessions = EXCLUDED.same_name_sessions;

  -- The two GoTrue tables that do NOT cascade from auth.users (header § 8).
  -- refresh_tokens.user_id is varchar and carries no FK; flow_state.user_id carries none either.
  DELETE FROM auth.refresh_tokens WHERE user_id = v_uid::text;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_refresh_tokens_deleted', n);
  DELETE FROM auth.flow_state WHERE user_id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('auth_flow_state_deleted', n);

  DELETE FROM auth.users WHERE id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'erase_my_account: auth user % not found', v_uid USING ERRCODE = 'P0002';
  END IF;

  RETURN v_out || jsonb_build_object('auth_user_deleted', true,
                                     'same_name_sessions', to_jsonb(v_same_name));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.erase_my_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erase_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Deploy-time assertions: one overload, right owner, no anon/PUBLIC execute
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_count int;
  v_owner text;
  v_acl   text;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'erase_my_account';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'P520: expected exactly 1 erase_my_account function, found %', v_count;
  END IF;

  SELECT pg_get_userbyid(p.proowner), COALESCE(array_to_string(p.proacl, '|'), '')
    INTO v_owner, v_acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'erase_my_account' AND n.nspname = 'public';

  IF v_owner <> current_user THEN
    RAISE EXCEPTION 'P520: erase_my_account owner is % but the migration runs as %', v_owner, current_user;
  END IF;
  IF v_acl LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'P520: anon holds EXECUTE on erase_my_account (acl: %)', v_acl;
  END IF;
  IF v_acl LIKE '%|=X%' OR v_acl LIKE '=X%' THEN
    RAISE EXCEPTION 'P520: PUBLIC holds EXECUTE on erase_my_account (acl: %)', v_acl;
  END IF;
END;
$assert$;
