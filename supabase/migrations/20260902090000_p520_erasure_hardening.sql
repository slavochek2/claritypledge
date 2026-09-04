-- P520 — erasure hardening (codex review findings 1–5).
--
-- diffed against: 20260901213000_p520_erase_my_account.sql
--   public.erase_my_account() is redefined below. Changes vs. the prior body:
--     * sessions are row-locked (FOR UPDATE) first and shared ones set to
--       status = 'cancelled' — the close state the live writers now respect;
--     * every tombstone matches on a PROFILE ID column where one exists; the
--       name-only tables are cleared only when the session's counterparty does
--       not share the name, and use the SESSION-TIME name, never the profile name;
--     * live_state is cleaned structurally (per key), never by textual replace,
--       and never skipped;
--     * ml_training_sessions rows are erased by (session code, name);
--     * an erased_subjects row is written.
-- diffed against: 20260409140000_fix_guest_patch_live_state.sql
--   patch_live_state(uuid, jsonb) is redefined with ONE added predicate on the
--   UPDATE: `AND status IS DISTINCT FROM 'cancelled'`. Body otherwise identical.
--
-- client-safe: the pre-commit-flagged shapes are DROP POLICY + CREATE POLICY pairs
--   that RE-CREATE the same six INSERT policies (and one UPDATE policy) with one
--   extra predicate each. No policy is removed, no grant to anon/authenticated
--   changes, no column changes. Every predicate added is false ONLY for (a) a JWT
--   whose profile no longer exists — a state the deployed client never holds
--   because it signs out immediately after erasure — and (b) a session in the
--   'cancelled' status, which nothing in the deployed client or any migration
--   sets before this one (grep: 'cancelled' on clarity_sessions has zero writers).
--   Existing workflows therefore see byte-identical behaviour (epistemic gate 7c).
--
-- WHY THESE FIVE, IN ONE MIGRATION.
--
-- 1. STALE JWT. A Supabase access token is a signed, stateless JWT; deleting the
--    auth.users row cascades GoTrue's sessions and refresh tokens (so no NEW token
--    can be minted — the integration test proves the refresh call fails), but the
--    access token already in a browser tab keeps validating for its lifetime
--    (≤ 1 h). Every INSERT policy that only checked `auth.uid() IS NOT NULL` would
--    still admit it. Those policies now also require the profile to EXIST. Tables
--    whose rows carry a profile FK were already closed by the FK itself (stories,
--    points, agreements, verifications); the six below had no FK to close them.
--    Residual, accepted: for ≤ 1 h a stale token can still READ what `authenticated`
--    can read, and can call RPCs that gate only on auth.uid() — patch_live_state is
--    the one that writes, and it is now gated on the cancelled state.
--
-- 2. live_state. `replace(live_state::text, name, tomb)` was skipped for names with
--    a quote or backslash — precisely the names most likely to be unusual — and a
--    textual replace can corrupt JSON regardless. Every key that carries a display
--    name in LiveSessionState (src/app/types/index.ts) is now handled by key:
--    scalar keys are compared and overwritten; the four maps keyed by user name
--    (roleSelections, sliderRatings, listenActivelyRatings, talkTime) have the
--    entry re-keyed to the tombstone; selectedStoryData.authorName is matched by
--    authorSlug, not by name.
--
-- 3. NAME EQUALITY. Matching `author_name = <profile name>` tombstoned the
--    counterparty's rows whenever two participants shared a name, and missed the
--    user's own rows whenever they had renamed their profile since the session.
--    Where a profile id column exists (clarity_sessions creator/joiner) the match is
--    on the id. The five name-only tables (clarity_chat_messages,
--    clarity_verifications, clarity_ideas, clarity_live_turns, clarity_demo_rounds)
--    are cleared per session using the SESSION-TIME name (creator_name/joiner_name
--    on the row the id identifies), and ONLY when the other participant's name
--    differs. Same-name sessions are left untouched and their ids recorded in
--    erased_subjects.same_name_sessions for the founder's decision.
--
-- 4. RACE. A live counterparty mid-session could patch live_state (with the leaver's
--    name still in their in-memory state) after the erase committed. The RPC now
--    locks the leaver's session rows first (in-flight writers queue behind the lock
--    and re-evaluate after commit), sets shared sessions to 'cancelled', and
--    patch_live_state, the sessions UPDATE policy and the three live INSERT policies
--    refuse cancelled sessions. Residual, accepted: the P1053 seat-claim RPCs are not
--    gated on status (a seat claim on a cancelled session re-pins joiner fields but
--    carries no third-party name); the legacy `state` jsonb column (demo flow) is
--    not scrubbed — see the spec's scope statement.
--
--    Residual, accepted and NOT closed here (documented 2026-09-04, P1243 review):
--    `clarity_verifications` is the fourth table §3 lists but only THREE carry the
--    cancelled-session clause. It has no `session_id` column — its session is reachable
--    only via `message_id -> clarity_chat_messages.session_id` — so the same one-line
--    `NOT EXISTS (... WHERE s.id = <table>.session_id AND s.status = 'cancelled')`
--    could not be written, and the omission was silent rather than stated. Effect: a
--    surviving counterparty can still insert a paraphrase against a message in a
--    cancelled session. What is written is the COUNTERPARTY'S own text, not the erased
--    user's, so this does not recreate erased personal data — but it is a write into a
--    conversation the erased user closed by leaving, and the live page carries no
--    status guard of its own (verified 2026-09-04: no cancelled-status check in
--    clarity-live-page.tsx), so these policies are the only control. Closing it needs a
--    two-table join inside an RLS policy on the hot path of a live session, which is a
--    write-path change deserving its own test pass rather than a footnote — filed as
--    P1245.
--
-- 5. CENSUS. ml_training_sessions(session_code, user_name) has no id column; rows
--    are erased by session code + session-time name under the same same-name rule.
--    Its audio_path points at GCS — not reachable from SQL. clarity_feed_ideas /
--    clarity_idea_comments / clarity_idea_votes / clarity_idea_vote_history carry
--    only an anonymous localStorage session id and a free-text name: NOT locatable
--    from an account; documented as such in the spec.

-- ---------------------------------------------------------------------------
-- 1. erased_subjects — an audit row per erasure, ids only, no PII
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.erased_subjects (
  user_id            uuid PRIMARY KEY,
  erased_at          timestamptz NOT NULL DEFAULT now(),
  -- sessions whose counterparty shared the leaver's display name; their name-only
  -- rows were left in place — see header § 3.
  same_name_sessions uuid[] NOT NULL DEFAULT '{}'
);
ALTER TABLE public.erased_subjects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.erased_subjects FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.erased_subjects IS
  'P520: one row per erased account (auth user id only). Written by erase_my_account(); readable by service_role only.';

-- ---------------------------------------------------------------------------
-- 2. Profile-existence guard on every INSERT policy that only checked auth.uid()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can record acceptance" ON public.terms_acceptances;
CREATE POLICY "Authenticated users can record acceptance"
  ON public.terms_acceptances FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can record consent" ON public.session_consents;
CREATE POLICY "Authenticated users can record consent"
  ON public.session_consents FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

-- The three live-session writers: profile must exist AND the session must not be cancelled.
DROP POLICY IF EXISTS "Anyone can insert demo rounds" ON public.clarity_demo_rounds;
CREATE POLICY "Anyone can insert demo rounds"
  ON public.clarity_demo_rounds FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert ideas" ON public.clarity_ideas;
CREATE POLICY "Anyone can insert ideas"
  ON public.clarity_ideas FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert live turns" ON public.clarity_live_turns;
CREATE POLICY "Anyone can insert live turns"
  ON public.clarity_live_turns FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.clarity_sessions s WHERE s.id = session_id AND s.status = 'cancelled')
  );

DROP POLICY IF EXISTS "Anyone can insert verifications" ON public.clarity_verifications;
CREATE POLICY "Anyone can insert verifications"
  ON public.clarity_verifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. The session close state the writers respect
-- ---------------------------------------------------------------------------
-- Sessions UPDATE policy: identical to 20260811170000_p1047_restore_creator_not_null_check.sql
-- plus `status IS DISTINCT FROM 'cancelled'` in USING.
DROP POLICY IF EXISTS clarity_sessions_creator_update ON public.clarity_sessions;
CREATE POLICY clarity_sessions_creator_update
  ON public.clarity_sessions
  FOR UPDATE
  USING (
    status IS DISTINCT FROM 'cancelled'
    AND (
      (target_listener_id IS NULL)
      OR (auth.uid() = target_listener_id)
      OR (auth.uid() = creator_profile_id)
    )
  )
  WITH CHECK (
    (creator_profile_id IS NOT NULL)
    AND (
      (target_listener_id IS NULL)
      OR (auth.uid() = target_listener_id)
      OR (auth.uid() = creator_profile_id)
    )
  );

CREATE OR REPLACE FUNCTION patch_live_state(
  p_session_id uuid,
  p_patch      jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  merged jsonb;
BEGIN
  UPDATE clarity_sessions
  SET live_state = COALESCE(live_state, '{}'::jsonb) || p_patch
  WHERE id = p_session_id
    AND status IS DISTINCT FROM 'cancelled'
    AND (
      creator_profile_id = auth.uid()
      OR joiner_profile_id = auth.uid()
      OR (
        auth.uid() IS NULL
        AND joiner_profile_id IS NULL
        AND joiner_name IS NOT NULL
      )
    )
  RETURNING live_state INTO merged;

  IF merged IS NOT NULL
     AND (merged->>'checkerSubmitted')::boolean IS TRUE
     AND (merged->>'responderSubmitted')::boolean IS TRUE
     AND merged->>'ratingPhase' = 'waiting'
  THEN
    UPDATE clarity_sessions
    SET live_state = live_state || '{"ratingPhase": "revealed"}'::jsonb
    WHERE id = p_session_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. live_state structural cleanup helper
-- ---------------------------------------------------------------------------
-- Every LiveSessionState key that carries a display name (src/app/types/index.ts):
--   scalars: currentIdeaOriginator, currentSpeaker, currentListener,
--            pendingRatingRequest, currentlySpeaking, checkerName, proverName,
--            skippedBy, partnerName
--   maps keyed by user name: roleSelections, sliderRatings, listenActivelyRatings, talkTime
--   nested: selectedStoryData.authorName (matched by selectedStoryData.authorSlug)
CREATE OR REPLACE FUNCTION public._p520_scrub_live_state(
  p_state jsonb,
  p_name  text,
  p_slug  text,
  p_tomb  text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
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
-- 5. erase_my_account — redefined (see header for the diff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  SELECT p.name, p.email, p.slug INTO v_name, v_email, v_slug FROM profiles p WHERE p.id = v_uid;

  IF v_name IS NOT NULL THEN

    -- ---- Lock my sessions first: in-flight live writers queue behind these row
    -- locks and re-evaluate their predicates after this commits (header § 4).
    PERFORM 1 FROM clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid
       FOR UPDATE;
    SELECT COALESCE(array_agg(id), '{}') INTO v_sessions
      FROM clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid;

    -- ---- Agreements (RESTRICT both sides) --------------------------------------
    UPDATE clarity_agreements
       SET status               = 'terminated',
           terminated_at        = COALESCE(terminated_at, now()),
           terminated_by        = NULL,
           partner_profile_id   = NULL,
           partner_email        = v_tomb_email,
           partner_display_name = v_tomb
     WHERE partner_profile_id = v_uid
        OR (partner_profile_id IS NULL AND lower(partner_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_anonymised', n);

    DELETE FROM clarity_agreements WHERE creator_profile_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_deleted', n);

    -- ---- Story verifications (NO ACTION, NOT NULL both sides) --------------------
    SELECT array_agg(DISTINCT x) INTO v_counterparts
      FROM (SELECT speaker_id  AS x FROM story_verifications WHERE listener_id = v_uid
            UNION
            SELECT listener_id AS x FROM story_verifications WHERE speaker_id  = v_uid) q
     WHERE x <> v_uid;

    SELECT array_agg(DISTINCT sv.story_id) INTO v_their_stories
      FROM story_verifications sv
      JOIN stories st ON st.id = sv.story_id
     WHERE (sv.speaker_id = v_uid OR sv.listener_id = v_uid)
       AND st.author_id <> v_uid;

    DELETE FROM story_verifications WHERE speaker_id = v_uid OR listener_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('verifications_deleted', n);

    UPDATE profiles p
       SET ears_count = (SELECT count(DISTINCT sv.speaker_id) FROM story_verifications sv
                          WHERE sv.listener_id = p.id AND sv.accuracy_achieved),
           verification_session_count =
             (SELECT count(*) FROM story_verifications sv WHERE sv.listener_id = p.id)
           + (SELECT count(*) FROM story_verifications sv
               WHERE sv.speaker_id = p.id AND sv.speaker_id <> sv.listener_id)
     WHERE p.id = ANY(COALESCE(v_counterparts, '{}'::uuid[]));

    UPDATE stories st
       SET understood_count = (SELECT count(DISTINCT sv.listener_id) FROM story_verifications sv
                                WHERE sv.story_id = st.id AND sv.accuracy_achieved)
     WHERE st.id = ANY(COALESCE(v_their_stories, '{}'::uuid[]));

    -- ---- Letters I sent, docs I own (NO ACTION, NOT NULL) ------------------------
    UPDATE clarity_sessions SET source_letter_id = NULL
     WHERE source_letter_id IN (SELECT id FROM clarity_letters WHERE sender_id = v_uid);
    DELETE FROM story_explain_backs WHERE recorder_id = v_uid;
    DELETE FROM clarity_letters WHERE sender_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('letters_deleted', n);
    DELETE FROM clarity_docs WHERE owner_id = v_uid;

    -- ---- Letters delivered TO me by others --------------------------------------
    DELETE FROM letter_point_responses
     WHERE delivery_id IN (SELECT id FROM letter_deliveries WHERE receiver_profile_id = v_uid);
    UPDATE letter_deliveries
       SET receiver_profile_id = NULL, receiver_email = NULL, receiver_name = v_tomb
     WHERE receiver_profile_id = v_uid
        OR (receiver_email IS NOT NULL AND lower(receiver_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('deliveries_anonymised', n);

    -- ---- Live sessions ------------------------------------------------------------
    -- A session nobody else ever joined is mine alone: delete it outright.
    DELETE FROM clarity_sessions
     WHERE id = ANY(v_sessions) AND creator_profile_id = v_uid
       AND joiner_profile_id IS NULL AND joiner_name IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('solo_sessions_deleted', n);

    -- Transcripts hold my verbatim speech — erased (spec [FOUNDER DECISION]).
    DELETE FROM session_transcripts WHERE session_id = ANY(v_sessions);
    DELETE FROM transcription_jobs  WHERE session_id = ANY(v_sessions);

    -- Per shared session: name-only tables use the SESSION-TIME name and only when the
    -- counterparty's name differs (header § 3); live_state is scrubbed by key (§ 2).
    FOR s IN
      SELECT id, code, creator_profile_id, joiner_profile_id, creator_name, joiner_name, live_state
        FROM clarity_sessions
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
        DELETE FROM clarity_verifications v
         USING clarity_chat_messages m
         WHERE v.message_id = m.id AND m.session_id = s.id AND v.verifier_name = v_my_name;
        DELETE FROM clarity_chat_messages WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM clarity_ideas         WHERE session_id = s.id AND author_name = v_my_name;
        DELETE FROM clarity_live_turns    WHERE session_id = s.id AND actor_name  = v_my_name;
        UPDATE clarity_live_turns
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        UPDATE clarity_demo_rounds
           SET speaker_name  = CASE WHEN speaker_name  = v_my_name THEN v_tomb ELSE speaker_name  END,
               listener_name = CASE WHEN listener_name = v_my_name THEN v_tomb ELSE listener_name END
         WHERE session_id = s.id AND (speaker_name = v_my_name OR listener_name = v_my_name);
        DELETE FROM ml_training_sessions WHERE session_code = s.code AND user_name = v_my_name;
      END IF;

      UPDATE clarity_sessions
         SET live_state = _p520_scrub_live_state(live_state, COALESCE(v_my_name, v_name), v_slug, v_tomb)
       WHERE id = s.id AND live_state IS NOT NULL;
    END LOOP;

    -- Identity columns: matched on the ID, never the name. Shared sessions are closed.
    UPDATE clarity_sessions
       SET creator_profile_id = CASE WHEN creator_profile_id = v_uid THEN NULL   ELSE creator_profile_id END,
           creator_name       = CASE WHEN creator_profile_id = v_uid THEN v_tomb ELSE creator_name       END,
           joiner_profile_id  = CASE WHEN joiner_profile_id  = v_uid THEN NULL   ELSE joiner_profile_id  END,
           joiner_name        = CASE WHEN joiner_profile_id  = v_uid THEN v_tomb ELSE joiner_name        END,
           target_listener_id = CASE WHEN target_listener_id = v_uid THEN NULL   ELSE target_listener_id END,
           status             = 'cancelled'
     WHERE id = ANY(v_sessions);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('sessions_anonymised', n);

    UPDATE clarity_sessions SET source_story_id = NULL
     WHERE source_story_id IN (SELECT id FROM stories WHERE author_id = v_uid);

    -- ---- Positions, then their history (trigger order) ------------------------------
    DELETE FROM point_positions WHERE user_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('positions_deleted', n);
    DELETE FROM point_position_history WHERE user_id = v_uid;
    DELETE FROM story_point_history    WHERE user_id = v_uid;

    -- ---- My content ---------------------------------------------------------------------
    DELETE FROM stories WHERE author_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('stories_deleted', n);

    -- ---- Community data I created: orphan, never delete ---------------------------------
    UPDATE points SET first_validator_id = NULL WHERE first_validator_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('points_orphaned', n);
    UPDATE events SET host_id = NULL WHERE host_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('events_orphaned', n);

    -- ---- Endorsements I gave (matched on the id column) -----------------------------------
    UPDATE witnesses
       SET witness_profile_id = NULL, witness_name = v_tomb, witness_linkedin_url = NULL
     WHERE witness_profile_id = v_uid;

    -- ---- Logs / room memberships that outlive me -------------------------------------------
    UPDATE email_send_log SET profile_id = NULL WHERE profile_id = v_uid;
    UPDATE event_room_members SET profile_id = NULL, display_name = v_tomb WHERE profile_id = v_uid;

    -- ---- PII tables with no FK at all ---------------------------------------------------------
    DELETE FROM terms_acceptances WHERE user_id = v_uid;
    DELETE FROM session_consents  WHERE user_id = v_uid;
  END IF;

  -- ---- Audit row, then the identity itself -------------------------------------------------
  INSERT INTO erased_subjects (user_id, same_name_sessions)
  VALUES (v_uid, v_same_name)
  ON CONFLICT (user_id) DO UPDATE SET erased_at = now(), same_name_sessions = EXCLUDED.same_name_sessions;

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
