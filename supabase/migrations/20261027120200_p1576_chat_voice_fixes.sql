-- P1576 Part B, follow-up fixes (from the security reviews). The first voice-notes migration
-- (20261027120100) is already applied on the test database, so it is NOT edited; this file supersedes
-- four of its functions and adds a ledger table.
--
-- client-safe: server-side only. One new service-role-only table; one new and four redefined
--   service-role-only functions (chat_commit_voice_note and chat_voice_expire_old keep their signatures;
--   chat_voice_finish_transcription gains a defaulted fourth argument, so the old three-argument function
--   is dropped first). No client role can execute any of them, before or after, and no client reads the table.
--
-- diffed against: 20261027120100_p1576_chat_voice_notes.sql.
--   * chat_commit_voice_note: that file's body, with ONE change: the 10-per-minute limit counts a ledger
--     (chat_voice_rate_limits), not chat_messages.audio_duration_ms. A delete clears that column, so
--     delete-and-resend used to dodge the limit. Rows are pruned inside the commit (older than 10
--     minutes), so there is no cron job to register. The lock makes concurrent commits queue: exactly
--     the limit is admitted however many arrive at once (the first migration counted without one).
--   * chat_voice_reserve_upload (new): upload mode had no quota at all, so a member could mint signed
--     PUT URLs without limit and fill the bucket with 3.8 MB objects. It runs the same membership and
--     not-a-mirror check as the commit, then reserves a slot (20 per author per 10 minutes) on the same
--     ledger, kind 'upload', before the edge function signs anything.
--   * chat_voice_finish_transcription: that file's body, plus p_final. A failure with p_final ends the
--     message for good (no more attempts) AND removes its audio: the transcript job found the stored
--     bytes different from what commit validated, and the other person must not be able to play them.
--     Removing the audio row queues the object for deletion (the purge trigger).

-- SECRET NAMING (operators). The edge function's sweep secret is CHAT_VOICE_CRON_SECRET (its own name:
-- the project-wide CRON_SECRET is read by other functions, so sharing it would let one leaked copy open all
-- their sweeps). The vault secret chat_voice_cron_secret that the cron tick sends must hold the same value.
-- The first migration's header still says CRON_SECRET; that file is applied and unchanged.
--
--   * chat_commit_voice_note also: a client id that belongs to a row that is not a voice note is refused
--     (22023) in both replay branches, so a text message sent with an upload's id cannot make the commit
--     return that text row and orphan the uploaded object.
--   * chat_voice_expire_old: drains in batches (see below).

CREATE TABLE IF NOT EXISTS public.chat_voice_rate_limits (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid        NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind      text        NOT NULL CHECK (kind IN ('commit', 'upload')),
  called_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_voice_rate_limits_author_window
  ON public.chat_voice_rate_limits (author_id, kind, called_at);

ALTER TABLE public.chat_voice_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_voice_rate_limits FROM PUBLIC, anon, authenticated, service_role;
-- the commit function (SECURITY DEFINER) writes it; service_role may read it and clear a bucket (the canary).
GRANT SELECT, DELETE ON TABLE public.chat_voice_rate_limits TO service_role;
COMMENT ON TABLE public.chat_voice_rate_limits IS
  'P1576: one row per committed voice note (kind commit) and per upload grant (kind upload), per author, for the rate limits. Deleting a message does not touch it. Server-only.';

CREATE OR REPLACE FUNCTION public.chat_commit_voice_note(
  p_uid          uuid,
  p_conversation uuid,
  p_object_key   text,
  p_duration_ms  integer,
  p_thread_root  uuid DEFAULT NULL,
  p_reply_to     uuid DEFAULT NULL,
  p_client_id    uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv  public.chat_conversations;
  v_since timestamptz;
  v_row   public.chat_messages;
BEGIN
  v_conv := public._chat_assert_can_post(p_conversation, p_uid);
  IF v_conv.kind = 'mirror' THEN
    RAISE EXCEPTION 'chat: voice notes are not available in this chat' USING ERRCODE = '22023';
  END IF;
  v_since := public._chat_access_since(p_conversation, p_uid);

  IF p_client_id IS NULL
     OR p_object_key IS DISTINCT FROM (lower(p_conversation::text) || '/' || lower(p_uid::text) || '/'
                                       || lower(p_client_id::text) || '.wav') THEN
    RAISE EXCEPTION 'chat: invalid voice note' USING ERRCODE = '22023';
  END IF;

  -- Idempotent retry (p1546): this author already committed this upload, so return THAT row. Before the
  -- length check on purpose: a replay carries no fresh duration.
  SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = p_uid AND m.client_id = p_client_id;
  IF FOUND THEN
    -- anything but a voice note under this client id (a text message sent with the upload's id) is not a replay
    IF v_row.conversation_id <> p_conversation OR v_row.audio_duration_ms IS NULL THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  IF p_duration_ms IS NULL OR p_duration_ms < 1 OR p_duration_ms > 120000 THEN
    RAISE EXCEPTION 'chat: invalid voice note length' USING ERRCODE = '22023';
  END IF;

  -- Rate limit on a ledger a delete cannot touch (counting chat_messages let delete-and-resend dodge it).
  -- One commit at a time per author, so the count sees every earlier reservation. A refused attempt
  -- raises, which rolls the ledger row back with it; only committed notes consume allowance.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p1576|chat-voice|' || p_uid::text, 0));
  DELETE FROM public.chat_voice_rate_limits l
   WHERE l.author_id = p_uid AND l.called_at < clock_timestamp() - interval '10 minutes';
  IF (SELECT count(*) FROM public.chat_voice_rate_limits l
       WHERE l.author_id = p_uid AND l.kind = 'commit'
         AND l.called_at > clock_timestamp() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'chat: too many voice notes' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.chat_voice_rate_limits (author_id, kind, called_at) VALUES (p_uid, 'commit', clock_timestamp());

  IF p_thread_root IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_thread_root AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.thread_root_id IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: thread not available' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF p_reply_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.chat_messages t
                    WHERE t.id = p_reply_to AND t.conversation_id = p_conversation
                      AND t.deleted_at IS NULL AND t.created_at >= v_since) THEN
      RAISE EXCEPTION 'chat: reply target not available' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- clock_timestamp(), not now(): see send_chat_message.
  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, reply_to_id, thread_root_id, kind, client_id, created_at,
     audio_duration_ms, transcript_status)
  VALUES
    (p_conversation, p_uid, NULL, p_reply_to, p_thread_root, 'message', p_client_id, clock_timestamp(),
     p_duration_ms, 'pending')
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    -- a concurrent call with the same client id committed first: return its row
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = p_uid AND m.client_id = p_client_id;
    -- anything but a voice note under this client id (a text message sent with the upload's id) is not a replay
    IF v_row.conversation_id <> p_conversation OR v_row.audio_duration_ms IS NULL THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  INSERT INTO public.chat_voice_audio (message_id, audio_path) VALUES (v_row.id, p_object_key);

  IF p_thread_root IS NULL THEN
    UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_conversation;
    INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
    VALUES (p_conversation, p_uid, v_row.created_at, false)
    ON CONFLICT (conversation_id, profile_id) DO UPDATE
      SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                   EXCLUDED.last_read_at),
          manual_unread = false;
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_commit_voice_note(uuid, uuid, text, integer, uuid, uuid, uuid)
  TO service_role;

-- Upload mode, before any URL is signed: may p_uid post a voice note in this conversation (the same rules
-- as the commit, mirror refused), and is there upload allowance left (20 grants per author per 10
-- minutes, SQLSTATE 54000 beyond). One call, one lock, so concurrent requests cannot both take the last slot.
CREATE OR REPLACE FUNCTION public.chat_voice_reserve_upload(p_uid uuid, p_conversation uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_conv public.chat_conversations;
BEGIN
  v_conv := public._chat_assert_can_post(p_conversation, p_uid);
  IF v_conv.kind = 'mirror' THEN
    RAISE EXCEPTION 'chat: voice notes are not available in this chat' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('p1576|chat-voice|' || p_uid::text, 0));
  DELETE FROM public.chat_voice_rate_limits l
   WHERE l.author_id = p_uid AND l.called_at < clock_timestamp() - interval '10 minutes';
  IF (SELECT count(*) FROM public.chat_voice_rate_limits l
       WHERE l.author_id = p_uid AND l.kind = 'upload') >= 20 THEN
    RAISE EXCEPTION 'chat: too many uploads' USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.chat_voice_rate_limits (author_id, kind, called_at) VALUES (p_uid, 'upload', clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_reserve_upload(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_reserve_upload(uuid, uuid) TO service_role;

-- Retention (30 days, the transcript stays), now draining: the first migration removed at most one batch
-- per daily run, so above that volume the backlog grew and audio outlived 30 days. This loops in batches
-- of p_limit until one comes back short, capped at 20 batches per call (100,000 notes at the default) so
-- one call cannot run for ever inside a single transaction; the daily tick then continues next day.
-- Everything else is that file's body: removing the audio row queues the object (purge trigger), the
-- message keeps its duration and transcript and gains audio_expired_at, and a note still pending can
-- never be transcribed so it becomes failed.
CREATE OR REPLACE FUNCTION public.chat_voice_expire_old(p_limit integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n       integer;
  total   integer := 0;
  batches integer := 0;
BEGIN
  LOOP
    WITH expired AS (
      SELECT a.message_id
        FROM public.chat_voice_audio a
        JOIN public.chat_messages m ON m.id = a.message_id
       WHERE m.created_at < now() - interval '30 days'
       ORDER BY m.created_at
       LIMIT GREATEST(COALESCE(p_limit, 5000), 1)
    ), gone AS (
      DELETE FROM public.chat_voice_audio a USING expired WHERE a.message_id = expired.message_id
      RETURNING a.message_id
    )
    UPDATE public.chat_messages m
       SET audio_expired_at  = now(),
           transcript_status = CASE WHEN m.transcript_status = 'pending' THEN 'failed' ELSE m.transcript_status END
      FROM gone WHERE m.id = gone.message_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    batches := batches + 1;
    EXIT WHEN n < GREATEST(COALESCE(p_limit, 5000), 1) OR batches >= 20;
  END LOOP;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_expire_old(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_expire_old(integer) TO service_role;

-- Stores the outcome of an attempt. A success writes the transcript (only while pending and not
-- deleted: a delete that raced the job wins). A failure marks the message failed once the third
-- attempt is used; before that it stays pending and the sweep retries it. A FINAL failure (the stored
-- audio was not what commit validated) fails it at once and takes the audio down.
DROP FUNCTION IF EXISTS public.chat_voice_finish_transcription(uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.chat_voice_finish_transcription(
  p_message uuid, p_ok boolean, p_text text DEFAULT NULL, p_final boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_ok THEN
    UPDATE public.chat_messages m
       SET transcript = left(COALESCE(p_text, ''), 20000), transcript_status = 'done'
     WHERE m.id = p_message AND m.transcript_status = 'pending' AND m.deleted_at IS NULL;
  ELSIF p_final THEN
    UPDATE public.chat_messages m
       SET transcript_status = 'failed', audio_expired_at = now()
     WHERE m.id = p_message AND m.transcript_status = 'pending' AND m.deleted_at IS NULL;
    IF FOUND THEN
      DELETE FROM public.chat_voice_audio a WHERE a.message_id = p_message;
    END IF;
  ELSE
    UPDATE public.chat_messages m
       SET transcript_status = 'failed'
      FROM public.chat_voice_audio a
     WHERE m.id = p_message AND a.message_id = m.id
       AND m.transcript_status = 'pending' AND m.deleted_at IS NULL AND a.transcript_attempts >= 3;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.chat_voice_finish_transcription(uuid, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_voice_finish_transcription(uuid, boolean, text, boolean)
  TO service_role;

-- Deploy-time assertions
DO $assert$
DECLARE
  f record;
BEGIN
  IF has_table_privilege('anon', 'public.chat_voice_rate_limits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chat_voice_rate_limits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.chat_voice_rate_limits', 'INSERT')
     OR has_table_privilege('authenticated', 'public.chat_voice_rate_limits', 'DELETE') THEN
    RAISE EXCEPTION 'P1576: a client role holds a privilege on the voice rate-limit ledger';
  END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = 'public.chat_voice_rate_limits'::regclass) THEN
    RAISE EXCEPTION 'P1576: RLS is not enabled on the voice rate-limit ledger';
  END IF;
  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('chat_commit_voice_note', 'chat_voice_finish_transcription', 'chat_voice_reserve_upload', 'chat_voice_expire_old')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1576: a client role can execute public.%', f.proname;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'chat_voice_finish_transcription') <> 1 THEN
    RAISE EXCEPTION 'P1576: chat_voice_finish_transcription must exist exactly once';
  END IF;
END;
$assert$;
