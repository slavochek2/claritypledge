-- P1520: Mirror v2 — the mirror answers (in its own chat, and privately when summoned in a channel),
-- and has a generated face.
--
-- client-safe: additive on top of P1512 (unshipped, same branch lineage). New nullable columns on
--   chat_messages / chat_conversations, a widened chat_messages kind check (adds 'agent'), two new
--   tables with no client write grant, new functions, one BEFORE INSERT trigger on chat_messages that
--   only refuses copies of an agent row (no deployed client can produce one: agent rows are new here),
--   and erase_chat_data_for() redefined with one appended step.
--
-- diffed against: 20261019203000_p1512_clarity_chat.sql, the migration that defines
--   public.erase_chat_data_for(). The body below is that file's, byte for byte, plus exactly one added
--   block (step 6) before `RETURN v_out;`. src/tests/p1520-erase-body.test.ts asserts it, so a later
--   change to P1512's copy fails a test instead of being silently overwritten by this file.
--
-- DESIGN (features/p1520_mirror_v2_mira_answers_and_has_a_face.md, "Resolution"):
--   * EVERYTHING THE MIRROR SAYS LIVES IN ITS OWNER'S MIRROR CONVERSATION. A reply is a chat_messages
--     row of kind 'agent' (author_id NULL) in the owner's mirror. An @mirror ask made in a channel is
--     an ordinary row in the asker's mirror tagged context_conversation_id = that channel, and its
--     answer is an agent row tagged the same way. The mirror's owner-only RLS (P1512) and Realtime's RLS
--     on INSERT/UPDATE therefore cover both; the channel row, its last_message_at and other members'
--     unread counts are never touched. Nothing new is readable by anyone but the owner.
--   * NO CLIENT WRITES, as in P1512. Clients call SECURITY DEFINER RPCs that derive the actor from
--     auth.uid(). The model call itself runs in the mirror-reply / mirror-portrait edge functions,
--     which drive the service-role-only _mirror_* functions below.
--   * DURABLE JOBS. mirror_jobs holds one row per triggering message (unique), so a retried request
--     returns the same job and can never pay or reply twice. States: queued, running, done, failed,
--     capped, cancelled. A running job older than 3 minutes is treated as dead and may restart, at most
--     3 attempts in all.
--   * SPEND IS RESERVED BEFORE EACH CALL (the Mira assistant's pattern): the worst-case cost of the
--     call, (max_in x price_in + max_out x price_out) x 1.25, is reserved under one advisory lock
--     against a per-person daily allowance, a per-person daily count and a global daily ceiling, kept
--     separately for replies and portraits, plus one global total. Settled to the reported usage after
--     the call; released only when the call never started. The provider's hard cap on the mirror's own
--     key is the last line. Numbers live in _mirror_limits() (founder: change them there).
--   * ERASURE. A job and every agent row record derived_refs: the _chat_author_ref of every author
--     whose words were in the model's context. _mirror_begin_job locks its context rows FOR SHARE (the
--     clarify pattern), so an erase that scrubs those rows waits for a starting job to commit and then
--     sees its refs; step 6 of erase_chat_data_for cancels such jobs and scrubs such replies, and a
--     cancelled job's completion is refused.
--
-- KNOWN LIMITATIONS (accepted):
--   * A profile deleted OUTSIDE erase_my_account() leaves AI replies derived from their words, exactly
--     as P1512 leaves message bodies in that case.
--   * An erased owner's portrait file stays in the banners bucket, unlinked (its path carries no owner
--     id), as profile banners do today.
--   * The owner cannot edit or delete an agent reply in v1 (edit/delete require authorship).

-- ============================================================================
-- 1. Columns
-- ============================================================================
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS context_conversation_id uuid
  REFERENCES public.chat_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS derived_refs text[];

-- kind gains 'agent'. The original check is an inline column constraint (auto-named); drop it by name.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_kind_check
  CHECK (kind IN ('message', 'forward', 'clarify', 'agent'));
-- an agent reply carries no snapshot, like a plain message
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_forward_has_snapshot;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_forward_has_snapshot CHECK (
  kind IN ('message', 'agent') OR deleted_at IS NOT NULL OR forward_snapshot IS NOT NULL
);
-- an agent reply has no human author, no attachment and no copied snapshot
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_agent_shape;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_agent_shape CHECK (
  kind <> 'agent' OR (author_id IS NULL AND attachment_id IS NULL AND forward_snapshot IS NULL)
);
CREATE INDEX IF NOT EXISTS chat_messages_context ON public.chat_messages (context_conversation_id, created_at)
  WHERE context_conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chat_messages_derived_refs ON public.chat_messages USING gin (derived_refs)
  WHERE derived_refs IS NOT NULL;

ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS portrait_url text;
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS portrait_credit jsonb;
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS portrait_gender text;
ALTER TABLE public.chat_conversations DROP CONSTRAINT IF EXISTS chat_conversations_portrait_shape;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_portrait_shape CHECK (
  (portrait_gender IS NULL OR portrait_gender IN ('female', 'male', 'neutral'))
  AND (kind = 'mirror' OR (portrait_url IS NULL AND portrait_credit IS NULL AND portrait_gender IS NULL))
);

-- ============================================================================
-- 2. Tables: jobs and the spend ledger. Clients never write either; owners may read their own jobs.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mirror_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind                    text NOT NULL CHECK (kind IN ('reply', 'ask', 'portrait')),
  trigger_message_id      uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  context_conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  state                   text NOT NULL DEFAULT 'queued'
                          CHECK (state IN ('queued', 'running', 'done', 'failed', 'capped', 'cancelled')),
  attempts                integer NOT NULL DEFAULT 0,
  derived_refs            text[],
  reply_message_id        uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  spend_id                uuid,
  error_code              text CHECK (error_code IS NULL OR char_length(error_code) <= 40),
  created_at              timestamptz NOT NULL DEFAULT now(),
  started_at              timestamptz,
  finished_at             timestamptz,
  CONSTRAINT mirror_jobs_trigger_shape CHECK ((kind = 'portrait') = (trigger_message_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS mirror_jobs_trigger ON public.mirror_jobs (trigger_message_id)
  WHERE trigger_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS mirror_jobs_owner ON public.mirror_jobs (owner_id, created_at);
CREATE INDEX IF NOT EXISTS mirror_jobs_derived_refs ON public.mirror_jobs USING gin (derived_refs)
  WHERE derived_refs IS NOT NULL;

-- Spend survives the owner's erasure (owner SET NULL): the global ceiling must keep counting it.
CREATE TABLE IF NOT EXISTS public.mirror_ai_spend (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  bucket       text NOT NULL CHECK (bucket IN ('reply', 'portrait')),
  reserved_usd numeric(10, 6) NOT NULL CHECK (reserved_usd > 0),
  actual_usd   numeric(10, 6) CHECK (actual_usd IS NULL OR actual_usd >= 0),
  state        text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  settled_at   timestamptz
);
CREATE INDEX IF NOT EXISTS mirror_ai_spend_day ON public.mirror_ai_spend (created_at, bucket);
CREATE INDEX IF NOT EXISTS mirror_ai_spend_owner ON public.mirror_ai_spend (owner_id, created_at);

ALTER TABLE public.mirror_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mirror_ai_spend ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mirror_jobs     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.mirror_ai_spend FROM PUBLIC, anon, authenticated;
-- Owners read the state of their own jobs (pending / failed / capped markers). Column grant: never the
-- derived refs or the spend link.
GRANT SELECT (id, owner_id, kind, trigger_message_id, context_conversation_id, state, error_code,
              reply_message_id, created_at, finished_at)
  ON public.mirror_jobs TO authenticated;
DROP POLICY IF EXISTS mirror_jobs_select ON public.mirror_jobs;
CREATE POLICY mirror_jobs_select ON public.mirror_jobs FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- ============================================================================
-- 3. Limits and spend reservation
-- ============================================================================
-- Prices are Gemini's published paid-tier rates from 1 Jan 2027 (the higher of the two schedules on the
-- pricing page as read on 2026-10-20), so a reservation stays a ceiling across the price change.
-- The reply maximums are what mirror-reply enforces: input bounded by its context rules, output by
-- maxOutputTokens (thinking included).
CREATE OR REPLACE FUNCTION public._mirror_limits()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'reply_max_usd',             0.03,    -- (10000 in x $1.50 + 1200 out x $7.50) / 1e6 x 1.25; mirror-agent.ts MAX_IN/OUT_TOKENS
    'portrait_max_usd',          0.40,    -- up to 2 image generations + 2 vision checks, x 1.25
    'person_reply_daily_usd',    0.60,
    'person_reply_daily_count',  30,
    'person_portrait_daily_usd', 1.20,
    'person_portrait_daily_count', 3,
    'global_reply_daily_usd',    5.00,
    'global_portrait_daily_usd', 3.00,
    'global_total_daily_usd',    6.00
  );
$$;
REVOKE ALL ON FUNCTION public._mirror_limits() FROM PUBLIC, anon, authenticated;

-- Reserve p_max_usd for one model call. Returns the reservation id, or NULL when any cap would be
-- passed. One advisory lock serialises every reservation, so concurrent calls cannot all see room.
-- A day is the UTC day.
CREATE OR REPLACE FUNCTION public._mirror_reserve(p_owner uuid, p_bucket text, p_max_usd numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lim      jsonb := public._mirror_limits();
  v_day      timestamptz := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_person   numeric;
  v_person_n integer;
  v_bucket   numeric;
  v_total    numeric;
  v_id       uuid;
BEGIN
  IF p_bucket NOT IN ('reply', 'portrait') OR p_max_usd IS NULL OR p_max_usd <= 0 THEN
    RAISE EXCEPTION '_mirror_reserve: bad arguments' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_spend'));

  SELECT COALESCE(sum(COALESCE(s.actual_usd, s.reserved_usd)), 0), count(*)
    INTO v_person, v_person_n
    FROM public.mirror_ai_spend s
   WHERE s.owner_id = p_owner AND s.bucket = p_bucket AND s.created_at >= v_day AND s.state <> 'released';
  SELECT COALESCE(sum(COALESCE(s.actual_usd, s.reserved_usd)) FILTER (WHERE s.bucket = p_bucket), 0),
         COALESCE(sum(COALESCE(s.actual_usd, s.reserved_usd)), 0)
    INTO v_bucket, v_total
    FROM public.mirror_ai_spend s
   WHERE s.created_at >= v_day AND s.state <> 'released';

  IF v_person + p_max_usd > (v_lim ->> ('person_' || p_bucket || '_daily_usd'))::numeric
     OR v_person_n >= (v_lim ->> ('person_' || p_bucket || '_daily_count'))::integer
     OR v_bucket + p_max_usd > (v_lim ->> ('global_' || p_bucket || '_daily_usd'))::numeric
     OR v_total + p_max_usd > (v_lim ->> 'global_total_daily_usd')::numeric THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.mirror_ai_spend (owner_id, bucket, reserved_usd) VALUES (p_owner, p_bucket, p_max_usd)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_reserve(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

-- Settle a reservation: p_actual_usd is the reported cost; NULL means the call never started (released).
-- Settling twice is a no-op, so a retried completion cannot change the ledger.
CREATE OR REPLACE FUNCTION public._mirror_settle(p_spend uuid, p_actual_usd numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.mirror_ai_spend s
     SET actual_usd = p_actual_usd,
         state      = CASE WHEN p_actual_usd IS NULL THEN 'released' ELSE 'settled' END,
         settled_at = now()
   WHERE s.id = p_spend AND s.state = 'reserved';
$$;
REVOKE ALL ON FUNCTION public._mirror_settle(uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Client RPCs
-- ============================================================================
-- Ask the mirror privately from a channel (@mirror). The question is written into the CALLER'S OWN mirror,
-- tagged with the channel; nothing is written to the channel. Idempotent per (author, client id).
CREATE OR REPLACE FUNCTION public.mirror_ask(p_channel uuid, p_body text, p_client_id uuid DEFAULT NULL)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_conv   public.chat_conversations;
  v_mirror uuid;
  v_body   text;
  v_row    public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = p_channel;
  -- one error for "no such channel" and "not yours", so ids cannot be probed
  IF NOT FOUND OR v_conv.kind NOT IN ('group', 'event')
     OR public._chat_access_since(p_channel, v_uid) IS NULL THEN
    RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
  END IF;

  v_mirror := public._chat_ensure_mirror(v_uid);
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> v_mirror OR v_row.context_conversation_id IS DISTINCT FROM p_channel THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'chat: empty message' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, context_conversation_id, client_id, created_at)
  VALUES (v_mirror, v_uid, v_body, 'message', p_channel, p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> v_mirror OR v_row.context_conversation_id IS DISTINCT FROM p_channel THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
  INSERT INTO public.chat_member_state (conversation_id, profile_id, last_read_at, manual_unread)
  VALUES (v_mirror, v_uid, v_row.created_at, false)
  ON CONFLICT (conversation_id, profile_id) DO UPDATE
    SET last_read_at  = GREATEST(COALESCE(public.chat_member_state.last_read_at, '-infinity'::timestamptz),
                                 EXCLUDED.last_read_at),
        manual_unread = false;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_ask(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_ask(uuid, text, uuid) TO authenticated;

-- Ask the mirror to answer one of the caller's own messages in their mirror (a plain message, a Clarify,
-- or an @mirror ask). Returns the job, creating it once per message. Never answers the mirror itself.
DROP FUNCTION IF EXISTS public.mirror_request_reply(uuid);
CREATE FUNCTION public.mirror_request_reply(p_message uuid)
RETURNS TABLE (job_id uuid, state text, reply_message_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT m.* INTO v_msg
    FROM public.chat_messages m
    JOIN public.chat_conversations c ON c.id = m.conversation_id
   WHERE m.id = p_message AND c.kind = 'mirror' AND c.owner_id = v_uid AND m.author_id = v_uid;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL OR v_msg.kind NOT IN ('message', 'clarify') THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.mirror_jobs (owner_id, kind, trigger_message_id, context_conversation_id)
  VALUES (v_uid, CASE WHEN v_msg.context_conversation_id IS NULL THEN 'reply' ELSE 'ask' END,
          v_msg.id, v_msg.context_conversation_id)
  ON CONFLICT (trigger_message_id) WHERE trigger_message_id IS NOT NULL DO NOTHING;

  RETURN QUERY
    SELECT j.id, j.state, j.reply_message_id FROM public.mirror_jobs j WHERE j.trigger_message_id = v_msg.id;
END;
$$;
REVOKE ALL ON FUNCTION public.mirror_request_reply(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mirror_request_reply(uuid) TO authenticated;

-- The gender the next portrait is painted with. NULL = random each time (the default; never guessed).
CREATE OR REPLACE FUNCTION public.set_mirror_gender(p_gender text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_mirror uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_gender IS NOT NULL AND p_gender NOT IN ('female', 'male', 'neutral') THEN
    RAISE EXCEPTION 'chat: unknown choice' USING ERRCODE = '22023';
  END IF;
  v_mirror := public._chat_ensure_mirror(v_uid);
  UPDATE public.chat_conversations c SET portrait_gender = p_gender WHERE c.id = v_mirror;
END;
$$;
REVOKE ALL ON FUNCTION public.set_mirror_gender(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_mirror_gender(text) TO authenticated;

-- A mirror reply is the owner's alone: it can never be forwarded or clarified anywhere (P1520 invariant).
-- forward_chat_message and clarify_chat_message both record the source in forwarded_from_message_id.
CREATE OR REPLACE FUNCTION public._mirror_refuse_agent_copy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_messages s WHERE s.id = NEW.forwarded_from_message_id AND s.kind = 'agent') THEN
    RAISE EXCEPTION 'chat: mirror replies stay private' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_refuse_agent_copy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS chat_messages_no_agent_copy ON public.chat_messages;
CREATE TRIGGER chat_messages_no_agent_copy BEFORE INSERT ON public.chat_messages
  FOR EACH ROW WHEN (NEW.forwarded_from_message_id IS NOT NULL)
  EXECUTE FUNCTION public._mirror_refuse_agent_copy();

-- ============================================================================
-- 5. Service-role functions (the edge functions' side)
-- ============================================================================
-- Start (or restart) a reply/ask job: lock and read its bounded context, reserve its spend, and mark it
-- running. Returns jsonb with "status": run | done | busy | capped | cancelled | failed | gone.
CREATE OR REPLACE FUNCTION public._mirror_begin_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job      public.mirror_jobs;
  v_msg      public.chat_messages;
  v_mirror   public.chat_conversations;
  v_since    timestamptz;
  v_ctx      jsonb;
  v_refs     text[];
  v_spend    uuid;
  v_owner    text;
  v_channel  text;
  v_question jsonb;
BEGIN
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job AND j.kind IN ('reply', 'ask') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'gone');
  END IF;
  IF v_job.state = 'done' THEN
    RETURN jsonb_build_object('status', 'done', 'reply_message_id', v_job.reply_message_id);
  END IF;
  IF v_job.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;
  IF v_job.state = 'running' AND v_job.started_at > now() - interval '3 minutes' THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  IF v_job.attempts >= 3 THEN
    UPDATE public.mirror_jobs j SET state = 'failed', error_code = COALESCE(j.error_code, 'attempts'),
           finished_at = now() WHERE j.id = p_job;
    RETURN jsonb_build_object('status', 'failed');
  END IF;

  SELECT * INTO v_msg FROM public.chat_messages m WHERE m.id = v_job.trigger_message_id;
  SELECT * INTO v_mirror FROM public.chat_conversations c WHERE c.id = v_msg.conversation_id;
  IF v_msg.deleted_at IS NOT NULL OR v_mirror.kind <> 'mirror' OR v_mirror.owner_id <> v_job.owner_id THEN
    UPDATE public.mirror_jobs j SET state = 'cancelled', finished_at = now() WHERE j.id = p_job;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;
  SELECT split_part(COALESCE(p.name, ''), ' ', 1) INTO v_owner FROM public.profiles p WHERE p.id = v_job.owner_id;

  IF v_job.kind = 'ask' THEN
    v_since := public._chat_access_since(v_job.context_conversation_id, v_job.owner_id);
    IF v_since IS NULL THEN
      UPDATE public.mirror_jobs j SET state = 'cancelled', error_code = 'no_access', finished_at = now()
       WHERE j.id = p_job;
      RETURN jsonb_build_object('status', 'cancelled');
    END IF;
    SELECT CASE c.kind
             WHEN 'group' THEN (SELECT o.name || ' · General' FROM public.organization o WHERE o.id = c.org_id)
             WHEN 'event' THEN (SELECT e.title FROM public.events e WHERE e.id = c.event_id)
           END
      INTO v_channel FROM public.chat_conversations c WHERE c.id = v_job.context_conversation_id;

    -- Lock first (separate statement), then read: the context is the last 30 main-channel messages the
    -- owner may read, up to the moment of the ask.
    PERFORM 1 FROM (
      SELECT x.id FROM public.chat_messages x
       WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
         AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
       ORDER BY x.created_at DESC, x.id DESC LIMIT 30) ids
      JOIN public.chat_messages m ON m.id = ids.id
     ORDER BY m.created_at, m.id
       FOR SHARE OF m;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'who',  CASE WHEN t.author_id = v_job.owner_id THEN 'owner' ELSE 'other' END,
             'name', COALESCE(tp.name, 'Deleted user'),
             'body', left(t.body, 1000),
             'quoted', CASE WHEN t.forward_snapshot IS NULL THEN NULL
                            ELSE jsonb_build_object('name', t.forward_snapshot ->> 'author_name',
                                                    'body', left(t.forward_snapshot ->> 'body', 1000)) END,
             'attachment', t.attachment_kind,
             'at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb),
           array_remove(
             array_agg(DISTINCT public._chat_author_ref(t.author_id)) FILTER (WHERE t.author_id IS NOT NULL)
             || array_agg(DISTINCT public._chat_author_ref(t.forward_author_id)) FILTER (WHERE t.forward_author_id IS NOT NULL),
             NULL)
      INTO v_ctx, v_refs
      FROM (SELECT x.* FROM public.chat_messages x
             WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
               AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
      LEFT JOIN public.profiles tp ON tp.id = t.author_id;
    v_question := jsonb_build_object('body', left(v_msg.body, 4000));
  ELSE
    -- A mirror-chat reply: the last 30 rows of the mirror itself, never the channel asks kept there.
    PERFORM 1 FROM (
      SELECT x.id FROM public.chat_messages x
       WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
       ORDER BY x.created_at DESC, x.id DESC LIMIT 30) ids
      JOIN public.chat_messages m ON m.id = ids.id
     ORDER BY m.created_at, m.id
       FOR SHARE OF m;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'who',  CASE WHEN t.kind = 'agent' THEN 'mirror' ELSE 'owner' END,
             'body', left(t.body, 1000),
             'clarify', CASE WHEN t.kind IN ('clarify', 'forward') AND t.forward_snapshot IS NOT NULL THEN
                          jsonb_build_object(
                            'from',  t.forward_snapshot ->> 'author_name',
                            'in',    t.forward_snapshot ->> 'conversation_title',
                            'body',  left(t.forward_snapshot ->> 'body', 1000),
                            'thread', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                                'name', e ->> 'author_name', 'body', left(e ->> 'body', 500))
                                              ORDER BY ord), '[]'::jsonb)
                                         FROM (SELECT e, ord FROM jsonb_array_elements(
                                                 COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb))
                                                 WITH ORDINALITY AS a(e, ord)
                                               ORDER BY ord DESC LIMIT 10) last10))
                        END,
             'attachment', t.attachment_kind,
             'at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM (SELECT x.* FROM public.chat_messages x
             WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
               AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t;

    -- whose words are in it: the original authors of copies, every copied thread entry, and whatever an
    -- earlier mirror reply in the context was itself derived from
    SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.forward_author_id) AS r
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
       WHERE t.forward_author_id IS NOT NULL
      UNION
      SELECT e ->> 'author_ref'
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t,
             jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) e
      UNION
      SELECT unnest(t.derived_refs)
        FROM (SELECT x.* FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT 30) t
       WHERE t.kind = 'agent'
    ) refs;
    v_question := NULL;  -- the trigger is the last item of the context
  END IF;

  v_spend := public._mirror_reserve(v_job.owner_id, 'reply', (public._mirror_limits() ->> 'reply_max_usd')::numeric);
  IF v_spend IS NULL THEN
    UPDATE public.mirror_jobs j SET state = 'capped', error_code = 'cap', finished_at = now() WHERE j.id = p_job;
    RETURN jsonb_build_object('status', 'capped');
  END IF;

  UPDATE public.mirror_jobs j
     SET state = 'running', attempts = j.attempts + 1, started_at = now(), finished_at = NULL,
         error_code = NULL, derived_refs = COALESCE(v_refs, '{}'), spend_id = v_spend
   WHERE j.id = p_job;

  RETURN jsonb_build_object(
    'status', 'run',
    'kind', v_job.kind,
    'owner_id', v_job.owner_id,
    'mirror_name', v_mirror.title,
    'owner_first_name', NULLIF(v_owner, ''),
    'channel_title', v_channel,
    'question', v_question,
    'context', v_ctx,
    'reserved_usd', (public._mirror_limits() ->> 'reply_max_usd')::numeric);
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_begin_job(uuid) FROM PUBLIC, anon, authenticated;

-- Finish a running job with the model's text. Returns the new agent row as jsonb, or JSON null when it
-- refuses (the job was cancelled meanwhile: erasure, the trigger deleted, access lost) — never a row of
-- nulls, which PostgREST would hand back for a NULL composite. Settles the spend either way.
-- p_actual_usd: the reported cost.
DROP FUNCTION IF EXISTS public._mirror_complete_job(uuid, text, numeric);
CREATE FUNCTION public._mirror_complete_job(p_job uuid, p_body text, p_actual_usd numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job  public.mirror_jobs;
  v_msg  public.chat_messages;
  v_body text;
  v_row  public.chat_messages;
BEGIN
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job AND j.kind IN ('reply', 'ask') FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_job.spend_id IS NOT NULL THEN
    PERFORM public._mirror_settle(v_job.spend_id, p_actual_usd);
  END IF;
  IF v_job.state <> 'running' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_msg FROM public.chat_messages m WHERE m.id = v_job.trigger_message_id FOR SHARE;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL
     OR (v_job.kind = 'ask' AND public._chat_access_since(v_job.context_conversation_id, v_job.owner_id) IS NULL) THEN
    UPDATE public.mirror_jobs j SET state = 'cancelled', finished_at = now() WHERE j.id = p_job;
    RETURN NULL;
  END IF;
  v_body := NULLIF(btrim(COALESCE(p_body, '')), '');
  IF v_body IS NULL THEN
    UPDATE public.mirror_jobs j SET state = 'failed', error_code = 'empty', finished_at = now() WHERE j.id = p_job;
    RETURN NULL;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, reply_to_id, context_conversation_id, derived_refs, created_at)
  VALUES
    (v_msg.conversation_id, NULL, left(v_body, 4000), 'agent', v_msg.id, v_msg.context_conversation_id,
     v_job.derived_refs, clock_timestamp())
  RETURNING * INTO v_row;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_msg.conversation_id;
  -- An answer to a channel ask was read where it was asked: if the owner had read their mirror up to the
  -- ask, the answer does not make the mirror unread.
  IF v_job.kind = 'ask' THEN
    UPDATE public.chat_member_state s
       SET last_read_at = v_row.created_at
     WHERE s.conversation_id = v_msg.conversation_id AND s.profile_id = v_job.owner_id
       AND s.last_read_at >= v_msg.created_at;
  END IF;

  UPDATE public.mirror_jobs j
     SET state = 'done', reply_message_id = v_row.id, finished_at = now()
   WHERE j.id = p_job;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_complete_job(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

-- A running job (reply, ask or portrait) failed. p_actual_usd NULL = the call never started (released);
-- a call that started without reported usage is charged its full reservation by the caller.
CREATE OR REPLACE FUNCTION public._mirror_fail_job(p_job uuid, p_code text, p_actual_usd numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.mirror_jobs;
BEGIN
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_job.spend_id IS NOT NULL THEN
    PERFORM public._mirror_settle(v_job.spend_id, p_actual_usd);
  END IF;
  IF v_job.state = 'running' THEN
    UPDATE public.mirror_jobs j
       SET state = CASE WHEN p_code = 'cap' THEN 'capped' ELSE 'failed' END,
           error_code = left(COALESCE(p_code, 'error'), 40), finished_at = now()
     WHERE j.id = p_job;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_fail_job(uuid, text, numeric) FROM PUBLIC, anon, authenticated;

-- Start a portrait for this owner's mirror. Refuses while one is running (a double tap never pays twice).
-- Returns jsonb "status": run (with job_id, gender, exclude_artist) | busy | capped.
CREATE OR REPLACE FUNCTION public._mirror_begin_portrait(p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mirror uuid;
  v_conv   public.chat_conversations;
  v_spend  uuid;
  v_job    uuid;
BEGIN
  IF p_owner IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_owner) THEN
    RAISE EXCEPTION '_mirror_begin_portrait: no owner' USING ERRCODE = '22023';
  END IF;
  v_mirror := public._chat_ensure_mirror(p_owner);
  -- serialise this owner's portrait starts on the mirror row
  SELECT * INTO v_conv FROM public.chat_conversations c WHERE c.id = v_mirror FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.mirror_jobs j
              WHERE j.owner_id = p_owner AND j.kind = 'portrait' AND j.state = 'running'
                AND j.started_at > now() - interval '3 minutes') THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;
  v_spend := public._mirror_reserve(p_owner, 'portrait', (public._mirror_limits() ->> 'portrait_max_usd')::numeric);
  IF v_spend IS NULL THEN
    RETURN jsonb_build_object('status', 'capped');
  END IF;
  INSERT INTO public.mirror_jobs (owner_id, kind, state, attempts, started_at, spend_id)
  VALUES (p_owner, 'portrait', 'running', 1, now(), v_spend)
  RETURNING id INTO v_job;
  RETURN jsonb_build_object(
    'status', 'run',
    'job_id', v_job,
    'gender', v_conv.portrait_gender,
    'exclude_artist', v_conv.portrait_credit ->> 'artist',
    'reserved_usd', (public._mirror_limits() ->> 'portrait_max_usd')::numeric);
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_begin_portrait(uuid) FROM PUBLIC, anon, authenticated;

-- Store a finished portrait. Returns the previous portrait url (for the caller to delete), '' when there
-- was none, or NULL when the job is no longer running (the caller deletes the NEW file instead).
CREATE OR REPLACE FUNCTION public._mirror_finish_portrait(p_job uuid, p_url text, p_credit jsonb, p_actual_usd numeric)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job public.mirror_jobs;
  v_old text;
BEGIN
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job AND j.kind = 'portrait' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_job.spend_id IS NOT NULL THEN
    PERFORM public._mirror_settle(v_job.spend_id, p_actual_usd);
  END IF;
  IF v_job.state <> 'running' THEN
    RETURN NULL;
  END IF;
  SELECT c.portrait_url INTO v_old FROM public.chat_conversations c
   WHERE c.kind = 'mirror' AND c.owner_id = v_job.owner_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.mirror_jobs j SET state = 'cancelled', finished_at = now() WHERE j.id = p_job;
    RETURN NULL;
  END IF;
  UPDATE public.chat_conversations c SET portrait_url = p_url, portrait_credit = p_credit
   WHERE c.kind = 'mirror' AND c.owner_id = v_job.owner_id;
  UPDATE public.mirror_jobs j SET state = 'done', finished_at = now() WHERE j.id = p_job;
  RETURN COALESCE(v_old, '');
END;
$$;
REVOKE ALL ON FUNCTION public._mirror_finish_portrait(uuid, text, jsonb, numeric) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._mirror_begin_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_complete_job(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_fail_job(uuid, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_begin_portrait(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_finish_portrait(uuid, text, jsonb, numeric) TO service_role;

-- ============================================================================
-- 6. Erasure: erase_chat_data_for (P1512) plus step 6
-- ============================================================================
CREATE OR REPLACE FUNCTION public.erase_chat_data_for(p_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_ref text := public._chat_author_ref(p_uid);
  n     integer;
  pass  integer;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- ORDER MATTERS (race with forward_chat_message / clarify_chat_message). Those lock their source
  -- row FOR SHARE, so step 2's UPDATE of the erased user's own rows WAITS for any in-flight copy of
  -- them to commit. Under READ COMMITTED every statement takes a fresh snapshot, so the scrub in
  -- step 3 (a later statement) then SEES a copy that committed while step 2 waited and scrubs it.
  -- Scrubbing first would miss it. A copy that starts after step 2 commits finds the source deleted
  -- and is refused. Step 3 runs twice for the copy-of-a-copy case (a forward of a forward that
  -- committed while step 3's first pass waited).

  -- 1. their mirror and everything copied into it
  DELETE FROM public.chat_conversations c WHERE c.kind = 'mirror' AND c.owner_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_mirrors_deleted', n);

  -- 2. their messages in shared conversations
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()),
         attachment_kind = NULL, attachment_id = NULL,
         forward_snapshot = NULL, forward_author_id = NULL,
         author_id = NULL
   WHERE m.author_id = p_uid;
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_messages_erased', n);

  -- 3. copies made by OTHER people that carry their words. Erase means erase; D5 snapshot survival
  -- applies to ordinary deletes, not account erasure: the author becomes 'Deleted user', the body is
  -- removed (also from copied thread entries), the attachment and the back-reference are cleared.
  FOR pass IN 1..2 LOOP
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(jsonb_set(m.forward_snapshot, '{author_name}', to_jsonb('Deleted user'::text)),
                                        '{body}', 'null'::jsonb),
           attachment_kind = NULL, attachment_id = NULL,
           forward_author_id = NULL
     WHERE m.forward_author_id = p_uid AND m.forward_snapshot IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_forwards_anonymised_' || pass, n);

    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot, '{thread}', (
             SELECT COALESCE(jsonb_agg(
                      CASE WHEN t.e ->> 'author_ref' = v_ref
                           THEN (t.e - 'author_ref') || jsonb_build_object('author_name', 'Deleted user', 'body', NULL::text)
                           ELSE t.e END
                      ORDER BY t.ord), '[]'::jsonb)
               FROM jsonb_array_elements(m.forward_snapshot -> 'thread') WITH ORDINALITY AS t(e, ord)))
     WHERE m.forward_snapshot IS NOT NULL
       AND jsonb_path_exists(m.forward_snapshot, '$.thread[*] ? (@.author_ref == $ref)',
                             jsonb_build_object('ref', v_ref));
    GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('chat_threads_anonymised_' || pass, n);

    -- a clarify made in a 1:1 with them carries their name as the chat title
    UPDATE public.chat_messages m
       SET forward_snapshot = jsonb_set(m.forward_snapshot - 'conversation_title_ref', '{conversation_title}',
                                        to_jsonb('Deleted user'::text))
     WHERE m.forward_snapshot ->> 'conversation_title_ref' = v_ref;
  END LOOP;

  -- 4. read state and blocks
  DELETE FROM public.chat_member_state s WHERE s.profile_id = p_uid;
  DELETE FROM public.chat_blocks b WHERE b.blocker_id = p_uid OR b.blocked_id = p_uid;

  -- 5. conversations that would be left with nobody
  DELETE FROM public.chat_conversations c
   WHERE c.kind = 'dm'
     AND ((c.dm_user_a = p_uid AND c.dm_user_b IS NULL) OR (c.dm_user_b = p_uid AND c.dm_user_a IS NULL));
  UPDATE public.chat_conversations c SET created_by = NULL WHERE c.created_by = p_uid;

  -- 6. (P1520) AI work derived from their words. Runs last, as its own statements, so each sees every
  -- job that committed while the steps above waited on the rows it had locked. Jobs first: a completion
  -- that commits while this waits leaves a reply the next statement then scrubs.
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 7. Deploy-time assertions
-- ============================================================================
DO $assert$
DECLARE
  t text;
  f record;
BEGIN
  FOREACH t IN ARRAY ARRAY['mirror_jobs', 'mirror_ai_spend'] LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       OR has_table_privilege('anon', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'P1520: a client role holds a forbidden privilege on public.%', t;
    END IF;
    IF NOT (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'P1520: RLS is not enabled on public.%', t;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.mirror_ai_spend', 'SELECT')
     OR has_column_privilege('authenticated', 'public.mirror_jobs', 'derived_refs', 'SELECT')
     OR has_column_privilege('authenticated', 'public.mirror_jobs', 'spend_id', 'SELECT') THEN
    RAISE EXCEPTION 'P1520: clients can read the spend ledger or a job''s derived refs';
  END IF;

  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('mirror_ask', 'mirror_request_reply', 'set_mirror_gender')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1520: anon or PUBLIC can execute public.%', f.proname;
    END IF;
    IF NOT has_function_privilege('authenticated', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1520: authenticated cannot execute public.%', f.proname;
    END IF;
  END LOOP;
  FOR f IN
    SELECT p.oid, p.proname,
           (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE')) AS public_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND (p.proname LIKE '\_mirror\_%' OR p.proname = 'erase_chat_data_for')
  LOOP
    IF has_function_privilege('anon', f.oid, 'EXECUTE')
       OR has_function_privilege('authenticated', f.oid, 'EXECUTE') OR f.public_exec THEN
      RAISE EXCEPTION 'P1520: a client role can execute internal function public.%', f.proname;
    END IF;
  END LOOP;
END;
$assert$;
