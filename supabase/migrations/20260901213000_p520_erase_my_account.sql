-- P520 — self-serve account erasure (GDPR right to erasure).
--
-- new function
--   public.erase_my_account() does not exist before this migration; nothing is being
--   redefined, so there is no prior version to diff against.
--
-- client-safe: the only pre-commit-flagged shape is REVOKE EXECUTE on one BRAND-NEW
--   function (erase_my_account), immediately re-GRANTed to authenticated — the
--   P880 precedent. The two FK rewrites keep their constraint NAMES
--   (points_first_validator_id_fkey, events_host_id_fkey) because the client embeds
--   them in PostgREST joins; only the ON DELETE action and NOT NULL change, and every
--   client mapper already tolerates a null creator/host (`?.name ?? 'Unknown'`).
--
-- ONE FUNCTION, NO TARGET PARAMETER. erase_my_account() acts only on auth.uid(). There
-- is no way to name another account, so the authorization question ("may X delete Y")
-- never arises — the grant to `authenticated` IS the whole policy.
--
-- WHY A DEFINER FUNCTION AND NOT AN EDGE FUNCTION. The spec's technical note assumed
-- auth.users could only be deleted through the Admin API. It can also be deleted by the
-- migration owner (postgres) inside a SECURITY DEFINER function, which is what this does
-- — one transaction, one network hop, no service-role key in a Deno runtime. If any step
-- raises, NOTHING is erased: no half-deleted account can exist. Verified on the test
-- project by e2e/integration/p520-account-deletion.spec.ts, which also proves the
-- auth.users row is really gone (admin.getUserById → null).
--
-- ERASE vs ANONYMISE — the rule, then the table. A row is DELETED when it is the user's
-- own content or their own personal record. A row is ANONYMISED (profile FK → NULL,
-- name/email → tombstone) when another user's data hangs off it and deleting it would
-- destroy THEIR contribution. Every "silent in the spec" choice below is flagged
-- [FOUNDER DECISION] in features/p520_pledge_withdrawal_account_deletion.md.
--
-- WHY THE ORDER MATTERS (decisions.md 2026-06-01, 2026-05-18):
--   * profiles.id → auth.users is the only CASCADE that reaches profiles; most profile
--     children are NO ACTION / RESTRICT and BLOCK the delete unless cleared first.
--   * deleting point_positions fires log_position_change(), which INSERTS a history row
--     carrying the user's id — so positions go BEFORE the profile, and history is purged
--     AFTER positions (the trigger's tombstone rows would otherwise survive).
--   * story_verifications triggers only ever INCREMENT the cached counters; the
--     counterparties' ears_count / verification_session_count / understood_count are
--     recomputed here from what remains.
--   * a story frozen into a sealed letter is blocked by letter_story_snapshots /
--     letter_predictions (NO ACTION). Docs can only link the OWNER's stories (P551 RLS),
--     so every snapshot of my story lives in a letter I sent — and my letters go first.

-- ---------------------------------------------------------------------------
-- 1. Schema: community data survives its creator (spec § Data handling)
-- ---------------------------------------------------------------------------
-- NOT VALID: the test project already holds points whose first_validator_id points at
-- a profile that no longer exists (first apply failed with 23503 on exactly that row),
-- so the live constraint was not enforcing before this migration. NOT VALID skips the
-- legacy-row check and still enforces every future write AND every ON DELETE action —
-- which is the only part this feature needs. Legacy orphans render as 'Unknown', the
-- same way freshly orphaned rows do.
ALTER TABLE public.points ALTER COLUMN first_validator_id DROP NOT NULL;
ALTER TABLE public.points DROP CONSTRAINT IF EXISTS points_first_validator_id_fkey;
ALTER TABLE public.points
  ADD CONSTRAINT points_first_validator_id_fkey
  FOREIGN KEY (first_validator_id) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

ALTER TABLE public.events ALTER COLUMN host_id DROP NOT NULL;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_host_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- A badge is the HOLDER's achievement; the certifier leaving must not revoke it.
ALTER TABLE public.badge_points ALTER COLUMN verified_by DROP NOT NULL;
ALTER TABLE public.badge_points DROP CONSTRAINT IF EXISTS badge_points_verified_by_fkey;
ALTER TABLE public.badge_points
  ADD CONSTRAINT badge_points_verified_by_fkey
  FOREIGN KEY (verified_by) REFERENCES public.profiles(id) ON DELETE SET NULL
  NOT VALID;

-- ---------------------------------------------------------------------------
-- 2. The erasure function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_my_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_name         text;
  v_email        text;
  v_tomb         constant text := 'Deleted user';
  v_tomb_email   constant text := 'deleted-user@invalid';
  v_sessions     uuid[];
  v_counterparts uuid[];
  v_their_stories uuid[];
  v_out          jsonb := '{}'::jsonb;
  n              integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'erase_my_account: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.name, p.email INTO v_name, v_email FROM profiles p WHERE p.id = v_uid;

  -- A profile may be absent (auth row created, verification never finished). Then
  -- there is nothing in public.* to clear; fall through to the auth.users delete.
  IF v_name IS NOT NULL THEN

    -- ---- Agreements (RESTRICT both sides) --------------------------------------
    -- Partner side: the CREATOR keeps a terminated record with a tombstone partner —
    -- "I want to see that the agreement was terminated" (spec user story).
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

    -- Creator side: creator_profile_id is NOT NULL, the row cannot outlive its creator.
    DELETE FROM clarity_agreements WHERE creator_profile_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('agreements_deleted', n);

    -- ---- Story verifications (NO ACTION, NOT NULL both sides) --------------------
    -- Remember who is affected BEFORE deleting, then recompute their cached counters.
    SELECT array_agg(DISTINCT x) INTO v_counterparts
      FROM (SELECT speaker_id  AS x FROM story_verifications WHERE listener_id = v_uid
            UNION
            SELECT listener_id AS x FROM story_verifications WHERE speaker_id  = v_uid) s
     WHERE x <> v_uid;

    SELECT array_agg(DISTINCT sv.story_id) INTO v_their_stories
      FROM story_verifications sv
      JOIN stories s ON s.id = sv.story_id
     WHERE (sv.speaker_id = v_uid OR sv.listener_id = v_uid)
       AND s.author_id <> v_uid;

    DELETE FROM story_verifications WHERE speaker_id = v_uid OR listener_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('verifications_deleted', n);

    -- Same formulas as update_profile_ears_count() / update_story_understood_count().
    UPDATE profiles p
       SET ears_count = (SELECT count(DISTINCT sv.speaker_id) FROM story_verifications sv
                          WHERE sv.listener_id = p.id AND sv.accuracy_achieved),
           verification_session_count =
             (SELECT count(*) FROM story_verifications sv WHERE sv.listener_id = p.id)
           + (SELECT count(*) FROM story_verifications sv
               WHERE sv.speaker_id = p.id AND sv.speaker_id <> sv.listener_id)
     WHERE p.id = ANY(COALESCE(v_counterparts, '{}'::uuid[]));

    UPDATE stories s
       SET understood_count = (SELECT count(DISTINCT sv.listener_id) FROM story_verifications sv
                                WHERE sv.story_id = s.id AND sv.accuracy_achieved)
     WHERE s.id = ANY(COALESCE(v_their_stories, '{}'::uuid[]));

    -- ---- Letters I sent, docs I own (NO ACTION, NOT NULL) ------------------------
    UPDATE clarity_sessions SET source_letter_id = NULL
     WHERE source_letter_id IN (SELECT id FROM clarity_letters WHERE sender_id = v_uid);
    -- My explain-back recordings on OTHER people's letters (my voice = my data).
    DELETE FROM story_explain_backs WHERE recorder_id = v_uid;
    DELETE FROM clarity_letters WHERE sender_id = v_uid;   -- deliveries/snapshots/predictions/responses cascade
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('letters_deleted', n);
    DELETE FROM clarity_docs WHERE owner_id = v_uid;       -- doc_stories cascade

    -- ---- Letters delivered TO me by others: anonymise the delivery, drop my answers --
    DELETE FROM letter_point_responses
     WHERE delivery_id IN (SELECT id FROM letter_deliveries WHERE receiver_profile_id = v_uid);
    UPDATE letter_deliveries
       SET receiver_profile_id = NULL, receiver_email = NULL, receiver_name = v_tomb
     WHERE receiver_profile_id = v_uid
        OR (receiver_email IS NOT NULL AND lower(receiver_email) = lower(v_email));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('deliveries_anonymised', n);

    -- ---- Live sessions (NO ACTION on three nullable profile columns) --------------
    SELECT array_agg(id) INTO v_sessions
      FROM clarity_sessions
     WHERE creator_profile_id = v_uid OR joiner_profile_id = v_uid OR target_listener_id = v_uid;
    v_sessions := COALESCE(v_sessions, '{}'::uuid[]);

    -- A session nobody else ever joined is mine alone: delete it outright.
    DELETE FROM clarity_sessions
     WHERE id = ANY(v_sessions) AND creator_profile_id = v_uid
       AND joiner_profile_id IS NULL AND joiner_name IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('solo_sessions_deleted', n);

    -- Shared sessions: the counterparty keeps the session, minus my identity.
    -- Transcripts hold my verbatim speech — erased, see [FOUNDER DECISION] in the spec.
    DELETE FROM session_transcripts WHERE session_id = ANY(v_sessions);
    DELETE FROM transcription_jobs  WHERE session_id = ANY(v_sessions);

    UPDATE clarity_chat_messages SET author_name = v_tomb
     WHERE session_id = ANY(v_sessions) AND author_name = v_name;
    UPDATE clarity_verifications v SET verifier_name = v_tomb
      FROM clarity_chat_messages m
     WHERE v.message_id = m.id AND m.session_id = ANY(v_sessions) AND v.verifier_name = v_name;
    UPDATE clarity_ideas SET author_name = v_tomb
     WHERE session_id = ANY(v_sessions) AND author_name = v_name;
    UPDATE clarity_live_turns
       SET speaker_name  = CASE WHEN speaker_name  = v_name THEN v_tomb ELSE speaker_name  END,
           listener_name = CASE WHEN listener_name = v_name THEN v_tomb ELSE listener_name END,
           actor_name    = CASE WHEN actor_name    = v_name THEN v_tomb ELSE actor_name    END
     WHERE session_id = ANY(v_sessions);
    UPDATE clarity_demo_rounds
       SET speaker_name  = CASE WHEN speaker_name  = v_name THEN v_tomb ELSE speaker_name  END,
           listener_name = CASE WHEN listener_name = v_name THEN v_tomb ELSE listener_name END
     WHERE session_id = ANY(v_sessions);
    -- live_state is free-form JSON that carries display names; a textual replace is
    -- only JSON-safe when the name contains no quote or backslash.
    IF v_name !~ '["\\]' THEN
      UPDATE clarity_sessions
         SET live_state = replace(live_state::text, v_name, v_tomb)::jsonb
       WHERE id = ANY(v_sessions) AND live_state IS NOT NULL
         AND live_state::text LIKE '%' || v_name || '%';
    END IF;
    UPDATE clarity_sessions
       SET creator_profile_id = CASE WHEN creator_profile_id = v_uid THEN NULL ELSE creator_profile_id END,
           creator_name       = CASE WHEN creator_profile_id = v_uid OR creator_name = v_name THEN v_tomb ELSE creator_name END,
           joiner_profile_id  = CASE WHEN joiner_profile_id  = v_uid THEN NULL ELSE joiner_profile_id  END,
           joiner_name        = CASE WHEN joiner_profile_id  = v_uid OR joiner_name  = v_name THEN v_tomb ELSE joiner_name  END,
           target_listener_id = CASE WHEN target_listener_id = v_uid THEN NULL ELSE target_listener_id END
     WHERE id = ANY(v_sessions);
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('sessions_anonymised', n);

    -- A letter-sourced session about one of MY stories (NO ACTION) must let the story go.
    UPDATE clarity_sessions SET source_story_id = NULL
     WHERE source_story_id IN (SELECT id FROM stories WHERE author_id = v_uid);

    -- ---- Positions, then their history (trigger order — see header) ---------------
    DELETE FROM point_positions WHERE user_id = v_uid;        -- fires tombstone history + story_points unlink
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('positions_deleted', n);
    DELETE FROM point_position_history WHERE user_id = v_uid;
    DELETE FROM story_point_history    WHERE user_id = v_uid;

    -- ---- My content ----------------------------------------------------------------
    DELETE FROM stories WHERE author_id = v_uid;               -- versions/story_points/badge story refs cascade
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('stories_deleted', n);

    -- ---- Community data I created: orphan, never delete -----------------------------
    UPDATE points SET first_validator_id = NULL WHERE first_validator_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('points_orphaned', n);
    UPDATE events SET host_id = NULL WHERE host_id = v_uid;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('events_orphaned', n);

    -- ---- Endorsements I gave to others (NO ACTION, carries my name) ------------------
    UPDATE witnesses
       SET witness_profile_id = NULL, witness_name = v_tomb, witness_linkedin_url = NULL
     WHERE witness_profile_id = v_uid;

    -- ---- Logs / room memberships that outlive me --------------------------------------
    UPDATE email_send_log SET profile_id = NULL WHERE profile_id = v_uid;   -- NO ACTION
    UPDATE event_room_members SET profile_id = NULL, display_name = v_tomb
     WHERE profile_id = v_uid;                                              -- SET NULL, but name is PII

    -- ---- PII tables with no FK at all (spec) -------------------------------------------
    DELETE FROM terms_acceptances WHERE user_id = v_uid;
    DELETE FROM session_consents  WHERE user_id = v_uid;
  END IF;

  -- ---- The identity itself ------------------------------------------------------------
  -- Cascades: profiles → witnesses(profile_id), event_rsvps, point_positions (already
  -- empty), story_point_history, badge_points(user_id), membership, clarity_live_invites,
  -- event_practice_rooms, event_sub_rooms, transcribe_room_members (→ transcribe_messages),
  -- search_rate_limits, agent_accounts; auth.users → ai_rate_limits, user_voice_profiles,
  -- letter_response_pending, and GoTrue's own identities/sessions/refresh_tokens.
  -- membership_last_organizer_cannot_leave stands aside at pg_trigger_depth() > 1 (P1193).
  DELETE FROM auth.users WHERE id = v_uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'erase_my_account: auth user % not found', v_uid USING ERRCODE = 'P0002';
  END IF;

  RETURN v_out || jsonb_build_object('auth_user_deleted', true);
END;
$$;

-- Supabase's default privileges GRANT EXECUTE on new public functions to anon AND
-- authenticated, so REVOKE FROM PUBLIC alone is not enough (P683/P877/P880 precedent).
REVOKE EXECUTE ON FUNCTION public.erase_my_account() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.erase_my_account() TO authenticated;

COMMENT ON FUNCTION public.erase_my_account() IS
  'P520: erases the calling user (auth.uid()) — own content deleted, community data orphaned, counterparties'' rows anonymised, then the auth.users row. No target parameter by design. Returns per-step row counts.';
