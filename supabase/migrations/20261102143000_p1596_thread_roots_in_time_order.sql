-- P1596 (founder, solo test 2026-11-02): threads sit in the order of the time they cover. A thread root used to be
-- stamped when its first line was posted, so a slow "Before round 1" job landed below Round 1, and "After the last
-- round" could land above a later round. Now a root is stamped at the time its thread covers: Round n at the start of
-- round n, "Before round 1" one second before round 1, "After the last round" one second after the last round
-- activity, "The conversation" now. The chat sorts a channel by created_at, so that stamp is the order.
-- Created: 2026-11-02
-- Spec: features/p1596_event_transcripts_one_speaker_per_sentence.md (Approved after solo test 2)
--
-- client-safe: no client-callable function is created or changed. _transcribe_root_time and _post_clean_round_item are
--   service-role / trigger-internal only (EXECUTE revoked from PUBLIC, anon, authenticated and, for the post function,
--   service_role; checked at the end). No table, policy or grant changes.
--
-- diffed against:
--   _post_clean_round_item 20261102133000_p1596_threads_in_time_order.sql (same body; only the created_at of the two
--                          kinds of root changes, from clock_timestamp() to _transcribe_root_time(...))
--
-- DECISIONS
--   * WHO CAN READ DOES NOT CHANGE. A reader sees a message only when created_at >= their access-since (for an event
--     channel: host = -infinity; otherwise the RSVP time, only if given within the event's grace). A root stamped in the
--     past would hide the thread from a person who RSVPed after that time, and `v_since <= root_at` would drop that
--     person's own lines. So the stamp is never earlier than the latest valid RSVP of the event
--     (rsvped_at <= datetime + event_grace_interval(), which is exactly the set that can read): every current reader's
--     access-since is <= the root's stamp, so the set of readers of the root is the same as with a post-time stamp.
--     RSVPs cannot appear later with an older time (rsvped_at is stamped by the server), and an RSVP past the grace gives
--     no access at all. The `v_since <= root_at` check therefore passes for exactly the people it passed for before.
--   * The stamp is also never later than now. When the clamp to the RSVP floor puts several roots on the same instant,
--     a rank in microseconds keeps their order (before 0, Round n n, after 100000).
--   * Replies keep their post time (readability is unchanged there too). A thread's lines are already posted in speech
--     order within one job; two rooms' jobs for the same place interleave by post time.
--   * LIMIT: an event whose room ends while rounds are still to come stamps "After the last round" at the last activity
--     it knows of; a later round's root is stamped at its own (later) start, so it sorts below it, which is correct, but
--     speech between those rounds is in the thread above them. Existing roots are not restamped.
--   * Unread counts and "last message" previews use the conversation's own fields and the replies' times: unchanged.

CREATE OR REPLACE FUNCTION public._transcribe_root_time(p_event uuid, p_desired timestamptz, p_rank integer)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT least(clock_timestamp(), greatest(p_desired,
    COALESCE((SELECT max(r.rsvped_at) FROM public.event_rsvps r JOIN public.events e ON e.id = r.event_id
               WHERE r.event_id = p_event AND r.rsvped_at <= e.datetime + public.event_grace_interval()),
             '-infinity'::timestamptz) + p_rank * interval '1 microsecond'));
$$;
REVOKE ALL ON FUNCTION public._transcribe_root_time(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._post_clean_round_item(
  p_job_id uuid, p_member_id uuid, p_chunk_ms bigint, p_text text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_max CONSTANT integer := 4000;
  v_job     public.transcribe_round_clean_jobs;
  v_prior   uuid;
  v_speaker uuid;
  v_consent timestamptz;
  v_line    text;
  v_conv    uuid;
  v_since   timestamptz;
  v_round   public.event_rounds;
  v_thread  public.chat_round_threads;
  v_root    uuid;
  v_root_at timestamptz;
  v_root_del timestamptz;
  v_root_id uuid;
  v_msg     uuid;
  v_first   timestamptz;
  v_n_rounds integer;
  v_place   text;
BEGIN
  -- The caller (post_clean_round) holds the job row FOR UPDATE and has checked the claim and the switch.
  SELECT j.* INTO v_job FROM public.transcribe_round_clean_jobs j WHERE j.id = p_job_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'clean post: job is gone' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_job.seats) s WHERE s ->> 'member_id' = p_member_id::text) THEN
    RAISE EXCEPTION 'clean post: member is not in the job snapshot' USING ERRCODE = '22023';
  END IF;

  SELECT p.chat_message_id INTO v_prior FROM public.transcribe_round_clean_posts p
   WHERE p.job_id = p_job_id AND p.member_id = p_member_id AND p.chunk_ms = p_chunk_ms;
  IF FOUND THEN
    RETURN v_prior;                              -- idempotent: never posted twice
  END IF;

  v_line := btrim(COALESCE(p_text, ''));
  IF v_line = '' THEN
    RETURN NULL;
  END IF;
  IF char_length(v_line) > c_max THEN
    v_line := regexp_replace(left(v_line, c_max), '\s+\S*$', '');
    IF v_line = '' THEN
      v_line := left(btrim(p_text), c_max);
    END IF;
  END IF;

  SELECT m.profile_id, m.consent_given_at INTO v_speaker, v_consent
    FROM public.transcribe_room_members m WHERE m.id = p_member_id;
  IF v_speaker IS NULL OR v_consent IS NULL THEN
    RETURN NULL;                                 -- no consent, or the account is gone
  END IF;
  -- Erasure of this speaker takes the same lock first (P1592): either we finish before it, or we find the account gone.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_speaker::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_speaker) THEN
    RETURN NULL;
  END IF;

  SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_job.event_id;
  IF v_conv IS NULL THEN
    INSERT INTO public.chat_conversations (kind, event_id) VALUES ('event', v_job.event_id)
    ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = v_job.event_id;
  END IF;
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'clean post: event channel unavailable' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_conv, v_speaker);
  IF v_since IS NULL THEN
    RETURN NULL;                                 -- words reach only readers of this channel
  END IF;

  v_root := NULL;
  IF v_job.kind = 'round' THEN
    SELECT er.* INTO v_round FROM public.event_rounds er WHERE er.id = v_job.round_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'clean post: round is gone' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_job.round_id::text || ':' || v_job.table_no::text, 0));
    SELECT t.* INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
    IF NOT FOUND THEN
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, 'Round ' || v_round.round_no, 'message', 'round_thread',
              public._transcribe_root_time(v_job.event_id, v_round.started_at, v_round.round_no))
      RETURNING id INTO v_root_id;
      INSERT INTO public.chat_round_threads (event_id, round_id, table_no, conversation_id, root_message_id)
      VALUES (v_job.event_id, v_job.round_id, v_job.table_no, v_conv, v_root_id)
      ON CONFLICT (round_id, table_no) DO NOTHING
      RETURNING * INTO v_thread;
      IF NOT FOUND THEN
        DELETE FROM public.chat_messages WHERE id = v_root_id;
        SELECT t.* INTO v_thread FROM public.chat_round_threads t
         WHERE t.round_id = v_job.round_id AND t.table_no = v_job.table_no;
      ELSE
        UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
      END IF;
    END IF;
    IF v_thread.conversation_id <> v_conv THEN
      RAISE EXCEPTION 'clean post: thread belongs to another conversation' USING ERRCODE = '22023';
    END IF;
    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del
      FROM public.chat_messages m WHERE m.id = v_thread.root_message_id;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'clean post: round thread root is not available' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.chat_round_thread_members (thread_id, profile_id, display_name)
    SELECT v_thread.id, r.profile_id, r.display_name
      FROM public._transcribe_job_roster_locked(v_job.roster, v_job.event_id, v_thread.id, v_speaker) r
    ON CONFLICT (thread_id, profile_id) DO UPDATE SET display_name = EXCLUDED.display_name;
    PERFORM public._transcribe_retitle_thread(v_thread.id);
    IF v_since <= v_root_at THEN
      v_root := v_thread.root_message_id;
    END IF;
  ELSE
    -- room job (P1596 founder, solo test 2026-11-02): the words land in the thread of the TIME they were said, one thread
    -- per event and place, shared by every room of the event. before: said before round 1 (the "before" job, or a
    -- stretch of a room that ended before round 1); after: said once rounds had begun and not at a table (between rounds,
    -- after the last, or while sitting a round out); conversation: the event has no round at all.
    SELECT s.first_start, s.n INTO v_first, v_n_rounds FROM public._transcribe_event_round_span(v_job.event_id) s;
    v_place := CASE WHEN v_job.place = 'before' THEN 'before'
                    WHEN v_n_rounds = 0 THEN 'conversation'
                    WHEN to_timestamp(p_chunk_ms / 1000.0) < v_first THEN 'before'
                    ELSE 'after' END;
    PERFORM pg_advisory_xact_lock(hashtextextended('p1596:place:' || v_conv::text || ':' || v_place, 0));
    SELECT o.root_message_id INTO v_root_id FROM public.chat_outside_round_threads o
     WHERE o.conversation_id = v_conv AND o.place = v_place;
    IF v_root_id IS NULL THEN
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, public._transcribe_place_title(v_place), 'message', 'outside_rounds',
              public._transcribe_root_time(v_job.event_id,
                CASE v_place
                  WHEN 'before' THEN v_first - interval '1 second'
                  WHEN 'after' THEN COALESCE((SELECT greatest(max(er.started_at), max(er.ended_at))
                                                FROM public.event_rounds er WHERE er.event_id = v_job.event_id),
                                             clock_timestamp()) + interval '1 second'
                  ELSE clock_timestamp() END,
                CASE v_place WHEN 'before' THEN 0 WHEN 'after' THEN 100000 ELSE 0 END))
      RETURNING id INTO v_root_id;
      INSERT INTO public.chat_outside_round_threads (conversation_id, root_message_id, place)
      VALUES (v_conv, v_root_id, v_place);
      UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
    END IF;
    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del FROM public.chat_messages m WHERE m.id = v_root_id;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'clean post: outside-rounds root is not available' USING ERRCODE = '42501';
    END IF;
    IF v_since <= v_root_at THEN
      v_root := v_root_id;
    END IF;
  END IF;

  -- Never the channel's top level: a speaker who cannot read this thread's root gets no post (founder, P1592 D1).
  IF v_root IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public._transcribe_lock_place(v_conv, v_root);
  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, thread_root_id, is_transcription, created_at)
  VALUES (v_conv, v_speaker, v_line, 'message', v_root, true, clock_timestamp())
  RETURNING id INTO v_msg;
  INSERT INTO public.transcribe_round_clean_posts (job_id, member_id, chunk_ms, chat_message_id)
  VALUES (p_job_id, p_member_id, p_chunk_ms, v_msg);
  RETURN v_msg;
END;
$$;
REVOKE ALL ON FUNCTION public._post_clean_round_item(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated, service_role;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._transcribe_root_time(uuid, timestamptz, integer)',
                               'public._post_clean_round_item(uuid, uuid, bigint, text)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1596: % is client-callable', v_fn;
    END IF;
  END LOOP;
END
$check$;
