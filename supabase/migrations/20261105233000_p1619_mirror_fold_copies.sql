-- Migration: P1619 — the mirror agent stops re-sending copies once the talk moves on
-- Created: 2026-11-05
-- Spec: features/p1619_mirror_agent_stop_resending_copies.md (Build contract)
-- Guaranteed by: e2e/integration/p1619-*.spec.ts, src/tests/p1619-mirror-folded-copies.test.ts
--
-- diffed against: 20261104150000_p1604_mirror_session_transcript.sql (_mirror_begin_job, _mirror_context_item, _mirror_copy_thread).
--   Each body is that file's with ONLY these changes; signatures, grants, lock order and every other line are unchanged.
--   _mirror_limits and _mirror_row_chars are NOT touched (no reservation changes; an open copy costs what it cost before).
--   * New pure helpers (IMMUTABLE, no table reads): _mirror_tokens, _mirror_name_tokens, _mirror_title_phrase, _mirror_date_hit,
--     _mirror_copy_matches. They decide whether an owner message names a copy by speaker, title or date.
--   * New STABLE readers: _mirror_fold_state (which copies stay open for one trigger), _mirror_folded_context_item, _mirror_folded_chars.
--   * _mirror_begin_job: computes v_open / v_fold ONCE before the offer passes; row cost, payload and the session profile follow it.
--     A folded copy costs one line and is sent as one line; only an open session copy widens the offer and takes the session reservation.
--     derived_refs are untouched: they follow the rows offered, so a folded copy still names every speaker and the title.
--     New result key chat_total (main chat only): messages in scope, for the "N earlier messages not shown" note.
--   * _mirror_context_item / _mirror_copy_thread: carry the source's original time (sent_at) and each reply's original time (at); a missing
--     old time is left out, never replaced by the copy time. The row's own time stays under 'at'.
--
-- Rule (decided by the founder, 2026-11-05): a copy stays open for the next 5 owner messages, and a message naming its speakers, title or
-- date restarts the count. Eligible messages: the owner's own kind = 'message', not deleted, not from a channel ask, a voice note only
-- with a done transcript, in the trigger's scope, ordered (created_at, id), up to and including the trigger. Copies do not count.
-- The last 6 are the window. A copy is open when any window message matches it, or, in the main chat, when it is newer than the oldest
-- of a full window. A copy that is the trigger, or the root of the trigger's thread, is always open. The relative words (today,
-- yesterday, a weekday) are read against the trigger's own time, so a retry decides the same way.
--
-- client-safe: function bodies only; no table, column or key changes.

-- 1. pure matching helpers ---------------------------------------------------------------------------------------------------------

-- Lower-cased words of a text: NFC-normalised, split on whitespace and punctuation (so Cyrillic and other scripts split the same way).
CREATE OR REPLACE FUNCTION public._mirror_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT array_remove(regexp_split_to_array(lower(normalize(COALESCE(p_text, ''))), '[\s[:punct:]]+'), '');
$$;

-- Speaker words: 3 or more characters, from the given names, never the placeholder names.
CREATE OR REPLACE FUNCTION public._mirror_name_tokens(p_names text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(DISTINCT s.t), '{}'::text[])
    FROM (SELECT unnest(public._mirror_tokens(n)) AS t FROM unnest(COALESCE(p_names, '{}'::text[])) n) s
   WHERE char_length(s.t) >= 3 AND s.t <> ALL (ARRAY['deleted', 'user', 'mirror', 'agent']);
$$;

-- A chat title as one phrase of words, without a trailing "· General"; null when it is shorter than 4 characters or generic.
CREATE OR REPLACE FUNCTION public._mirror_title_phrase(p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE WHEN char_length(s.p) >= 4 AND s.p NOT IN ('mirror', 'general') THEN s.p END
    FROM (SELECT array_to_string(public._mirror_tokens(regexp_replace(COALESCE(p_title, ''), '\s*·\s*general\s*$', '', 'i')), ' ') AS p) s;
$$;

-- Does a text name a calendar day (UTC) of the source? English month names and numeric forms only; today / yesterday against p_ref's day;
-- an English weekday name only for a source at most 8 days before p_ref.
CREATE OR REPLACE FUNCTION public._mirror_date_hit(p_text text, p_at timestamptz, p_ref timestamptz)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  t     text := lower(normalize(COALESCE(p_text, '')));
  d     date;
  r     date;
  dd    text;
  mm    integer;
  ab    text;
  fu    text;
  mons  constant text[] := ARRAY['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  fulls constant text[] := ARRAY['january','february','march','april','may','june','july','august','september','october','november','december'];
  days  constant text[] := ARRAY['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  wb    constant text := '(^|[^[:alnum:]])';
  we    constant text := '($|[^[:alnum:]])';
BEGIN
  IF p_at IS NULL OR p_ref IS NULL OR t = '' THEN
    RETURN false;
  END IF;
  d := (p_at AT TIME ZONE 'UTC')::date;
  r := (p_ref AT TIME ZONE 'UTC')::date;
  dd := extract(day FROM d)::integer::text;
  mm := extract(month FROM d)::integer;
  ab := mons[mm];
  fu := fulls[mm];
  IF t ~ ('(^|[^0-9])' || to_char(d, 'YYYY-MM-DD') || '($|[^0-9])') THEN RETURN true; END IF;                       -- 2026-11-04
  IF t ~ ('(^|[^0-9])0?' || dd || '[./]0?' || mm::text || '($|[^0-9])') THEN RETURN true; END IF;                    -- 04.11  4.11  4/11
  IF t ~ (wb || '0?' || dd || '\s+(' || ab || '|' || fu || ')' || we) THEN RETURN true; END IF;                      -- 4 nov  4 november
  IF t ~ (wb || '(' || ab || '|' || fu || ')\s+0?' || dd || '($|[^0-9])') THEN RETURN true; END IF;                  -- nov 4  november 4
  IF d = r AND t ~ (wb || 'today' || we) THEN RETURN true; END IF;
  IF d = r - 1 AND t ~ (wb || 'yesterday' || we) THEN RETURN true; END IF;
  IF r - d BETWEEN 0 AND 8 AND t ~ (wb || days[extract(dow FROM d)::integer + 1] || we) THEN RETURN true; END IF;
  RETURN false;
END;
$$;

-- Does an owner's text name this copy: a speaker's word, the source chat's title as a phrase, or the source's date?
CREATE OR REPLACE FUNCTION public._mirror_copy_matches(p_text text, p_names text[], p_title text, p_src_at timestamptz, p_ref timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_text, '') <> '' AND (
         public._mirror_name_tokens(p_names) && public._mirror_tokens(p_text)
      OR COALESCE((' ' || array_to_string(public._mirror_tokens(p_text), ' ') || ' ') LIKE ('% ' || public._mirror_title_phrase(p_title) || ' %'), false)
      OR public._mirror_date_hit(p_text, p_src_at, p_ref));
$$;

-- 2. which copies stay open for one trigger ----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mirror_fold_state(p_owner uuid, p_msg public.chat_messages)
RETURNS TABLE (copy_id uuid, is_open boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH win AS (
    SELECT x.id, x.created_at,
           CASE WHEN x.audio_duration_ms IS NOT NULL THEN x.transcript ELSE x.body END AS txt
      FROM public.chat_messages x
     WHERE x.conversation_id = p_msg.conversation_id AND x.author_id = p_owner AND x.kind = 'message'
       AND x.deleted_at IS NULL AND x.context_conversation_id IS NULL
       AND (x.audio_duration_ms IS NULL OR x.transcript_status = 'done')
       AND public._mirror_in_scope(x, p_msg)
       AND (x.created_at, x.id) <= (p_msg.created_at, p_msg.id)
     ORDER BY x.created_at DESC, x.id DESC LIMIT 6),
  cut AS (   -- the oldest message of a FULL window; absent while fewer than 6 exist
    SELECT w.created_at AS c_at, w.id AS c_id
      FROM (SELECT v.*, count(*) OVER () AS n FROM win v) w
     WHERE w.n = 6 ORDER BY w.created_at, w.id LIMIT 1),
  cand AS (
    SELECT c.id, c.created_at, c.forward_snapshot AS snap
      FROM public.chat_messages c
     WHERE c.conversation_id = p_msg.conversation_id AND c.kind IN ('clarify', 'forward')
       AND c.forward_snapshot IS NOT NULL AND c.deleted_at IS NULL AND c.context_conversation_id IS NULL
       AND c.created_at <= p_msg.created_at
       AND (public._mirror_in_scope(c, p_msg)
            OR (p_msg.thread_root_id IS NOT NULL AND c.thread_root_id IS NULL AND c.id <> p_msg.thread_root_id))
     ORDER BY c.created_at DESC, c.id DESC LIMIT 2000)
  SELECT cd.id,
         (cd.id = p_msg.id
          OR (p_msg.thread_root_id IS NOT NULL AND cd.id = p_msg.thread_root_id)
          OR (p_msg.thread_root_id IS NULL
              AND (NOT EXISTS (SELECT 1 FROM cut) OR (cd.created_at, cd.id) > (SELECT k.c_at, k.c_id FROM cut k)))
          OR EXISTS (SELECT 1 FROM win w
                      WHERE public._mirror_copy_matches(
                              w.txt, nm.names, cd.snap ->> 'conversation_title',
                              CASE WHEN cd.snap ->> 'created_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN (cd.snap ->> 'created_at')::timestamptz END,
                              p_msg.created_at)))
    FROM cand cd
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT DISTINCT q.n FROM (
          SELECT cd.snap ->> 'author_name' AS n
          UNION ALL
          SELECT e ->> 'author_name'
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(cd.snap -> 'thread') = 'array' THEN cd.snap -> 'thread' ELSE '[]'::jsonb END) e
           WHERE e ->> 'system_kind' IS NULL) q
         WHERE q.n IS NOT NULL) AS names) nm;
$$;

-- 3. a folded copy: one line ---------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mirror_folded_context_item(t public.chat_messages)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'who', 'owner',
    'body', t.body,                                   -- the owner's own note on a Clarify stays
    'attachment', t.attachment_kind,
    'at', t.created_at,
    'folded', jsonb_build_object(
      'kind', t.kind,
      'from', t.forward_snapshot ->> 'author_name',
      'in', t.forward_snapshot ->> 'conversation_title',
      'original_at', t.forward_snapshot ->> 'created_at',
      'speakers', (SELECT COALESCE(jsonb_agg(s.n ORDER BY s.o), '[]'::jsonb) FROM (
                     SELECT u.n, min(u.o) AS o
                       FROM unnest(ARRAY[t.forward_snapshot ->> 'author_name']
                                   || ARRAY(SELECT e ->> 'author_name'
                                              FROM jsonb_array_elements(z.thr) WITH ORDINALITY a(e, o)
                                             WHERE e ->> 'system_kind' IS NULL ORDER BY a.o)) WITH ORDINALITY u(n, o)
                      WHERE u.n IS NOT NULL GROUP BY u.n ORDER BY min(u.o) LIMIT 8) s),
      -- the copied message itself plus its thread; the stored total stands in for a thread the copy clipped
      'lines', 1 + COALESCE((t.forward_snapshot ->> 'thread_total')::integer, jsonb_array_length(z.thr)),
      -- a copy that is itself clipped keeps saying so: how many lines it kept
      'lines_kept', CASE WHEN COALESCE((t.forward_snapshot ->> 'thread_total')::integer, 0) > jsonb_array_length(z.thr)
                         THEN 1 + jsonb_array_length(z.thr) END)))
    FROM (SELECT CASE WHEN jsonb_typeof(t.forward_snapshot -> 'thread') = 'array' THEN t.forward_snapshot -> 'thread' ELSE '[]'::jsonb END AS thr) z;
$$;

CREATE OR REPLACE FUNCTION public._mirror_folded_chars(x public.chat_messages)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT char_length(public._mirror_folded_context_item(x)::text);
$$;

-- 4. changed bodies --------------------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mirror_copy_thread(p_snap jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(k.e ORDER BY k.ord), '[]'::jsonb) FROM (
    SELECT s.e, s.ord FROM (
      SELECT jsonb_build_object('name', a.e ->> 'author_name', 'body', a.e ->> 'body')
             -- P1619: the reply's own original time; a reply stored without one carries none, never the copy's
             || CASE WHEN a.e ->> 'created_at' IS NOT NULL THEN jsonb_build_object('at', a.e ->> 'created_at') ELSE '{}'::jsonb END AS e, a.ord,
             sum(COALESCE(char_length(a.e ->> 'body'), 0) + COALESCE(char_length(a.e ->> 'author_name'), 0))
               OVER (ORDER BY a.ord DESC) AS upto
        FROM jsonb_array_elements(COALESCE(p_snap -> 'thread', '[]'::jsonb)) WITH ORDINALITY AS a(e, ord)) s
     -- a Clarified SESSION thread (snapshot flag) is offered up to 60,000 tokens x 3 chars; every other copy keeps 15,000
     WHERE s.upto <= CASE WHEN p_snap ->> 'session_thread' = 'true' THEN 180000 ELSE 15000 END) k;
$$;

CREATE OR REPLACE FUNCTION public._mirror_context_item(t public.chat_messages)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'who',  CASE WHEN t.kind = 'agent' THEN 'mirror' ELSE 'owner' END,
    'body', CASE WHEN t.audio_duration_ms IS NOT NULL
                 THEN CASE WHEN t.transcript_status = 'done' THEN t.transcript END
                 ELSE t.body END,
    'voice', CASE WHEN t.audio_duration_ms IS NOT NULL
                  THEN CASE WHEN t.transcript_status = 'done' THEN 'transcript' ELSE 'untranscribed' END
             END,
    'quoted', CASE WHEN t.kind = 'forward' AND t.forward_snapshot IS NOT NULL THEN
                jsonb_build_object('name', t.forward_snapshot ->> 'author_name', 'body', t.forward_snapshot ->> 'body')
                -- P1619: when the forwarded message was first written (left out when the snapshot has no time)
                || CASE WHEN t.forward_snapshot ->> 'created_at' IS NOT NULL
                        THEN jsonb_build_object('sent_at', t.forward_snapshot ->> 'created_at') ELSE '{}'::jsonb END
              END,
    'clarify', CASE WHEN t.kind = 'clarify' AND t.forward_snapshot IS NOT NULL THEN
                 jsonb_build_object(
                   'from',   t.forward_snapshot ->> 'author_name',
                   'in',     t.forward_snapshot ->> 'conversation_title',
                   'body',   t.forward_snapshot ->> 'body',
                   'session_thread', COALESCE((t.forward_snapshot ->> 'session_thread') = 'true', false),
                   'thread', public._mirror_copy_thread(t.forward_snapshot),
                   -- legacy copies (before 20261023130000) carry no total: their stored length stands in
                   'thread_total', COALESCE((t.forward_snapshot ->> 'thread_total')::integer,
                                            jsonb_array_length(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb))))
                 -- P1619: when the copied message was first written (left out when the snapshot has no time)
                 || CASE WHEN t.forward_snapshot ->> 'created_at' IS NOT NULL
                         THEN jsonb_build_object('sent_at', t.forward_snapshot ->> 'created_at') ELSE '{}'::jsonb END
               END,
    'replies', CASE WHEN t.thread_root_id IS NULL THEN
                 (SELECT count(*) FROM public.chat_messages r
                   WHERE r.thread_root_id = t.id AND r.conversation_id = t.conversation_id AND r.deleted_at IS NULL)
               END,
    'attachment', t.attachment_kind,
    'at', t.created_at);
$$;

CREATE OR REPLACE FUNCTION public._mirror_begin_job(p_job uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- see the header: 50,000 tokens x 3 chars; and a row cap that keeps the payload bounded
  c_chars    constant integer := 150000;
  c_rows     constant integer := 2000;
  v_job      public.mirror_jobs;
  v_msg      public.chat_messages;
  v_mirror   public.chat_conversations;
  v_since    timestamptz;
  v_ctx      jsonb;
  v_out      jsonb;
  v_total    integer;
  v_ids      uuid[];
  v_out_ids  uuid[];
  v_locked   uuid[];
  v_refs     text[];
  v_spend    uuid;
  v_owner    text;
  v_channel  text;
  v_question jsonb;
  v_chars    integer := 150000;   -- the offer bound: c_chars, or the session profile's
  v_session  boolean := false;    -- P1604: a Clarified session thread is among the offered rows
  v_pass     integer;
  v_reply_usd numeric;
  v_open     uuid[];              -- P1619: copies that stay open for this attempt, decided once below
  v_fold     uuid[];              -- P1619: copies sent as one folded line
  v_chat_total integer;           -- P1619: main-chat messages in scope, for the omission note
BEGIN
  -- LOCK ORDER (no cycle with erase_chat_data_for, which takes message rows, then the context lock
  -- exclusively, then jobs): this function takes context rows FOR SHARE, then the context lock SHARED, then
  -- the job row. The first read of the job is unlocked; its state is checked again under the lock below.
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job AND j.kind IN ('reply', 'ask');
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
  -- P1576 backstop: the Mirror never answers a voice note before its transcript is done.
  IF v_msg.audio_duration_ms IS NOT NULL
     AND (v_msg.transcript_status IS DISTINCT FROM 'done' OR btrim(COALESCE(v_msg.transcript, '')) = '') THEN
    IF v_msg.transcript_status IS DISTINCT FROM 'pending' THEN
      UPDATE public.mirror_jobs j SET state = 'cancelled', error_code = 'transcript_failed', finished_at = now()
       WHERE j.id = p_job;
      RETURN jsonb_build_object('status', 'cancelled');
    END IF;
    RETURN jsonb_build_object('status', 'waiting');
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

    -- The main-channel messages the owner may read, up to the moment of the ask, newest first within the
    -- offer bound; locked below in one pass, then read.
    v_ids := ARRAY(
        SELECT s.id FROM (
          SELECT x.id, sum(public._mirror_ask_row_chars(x)) OVER (ORDER BY x.created_at DESC, x.id DESC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
            FROM public.chat_messages x
           WHERE x.conversation_id = v_job.context_conversation_id AND x.thread_root_id IS NULL
             AND x.deleted_at IS NULL AND x.created_at >= v_since AND x.created_at <= v_msg.created_at
           ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
         WHERE COALESCE(s.before, 0) < c_chars);

    v_out_ids := '{}';
    -- ONE lock pass over every offered row, FOR SHARE SKIP LOCKED (P1547 review 2). erase_chat_data_for
    -- locks rows in phases (the erased person's own rows, then copies of them, then copied threads, then
    -- titles), so a start that WAITED on one of those rows while holding another could deadlock with it.
    -- A row an erase (or an edit) holds is skipped instead: never read, never sent, and absent from
    -- derived_refs, which are computed from exactly the rows locked and read below. Rows this start does
    -- lock are ones the erase has not reached yet; the erase then waits for this transaction and, under
    -- the context lock, cancels the job by the refs recorded here.
    SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
      SELECT m.id FROM public.chat_messages m WHERE m.id = ANY(v_ids || v_out_ids)
       ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
    -- The message this job answers must be among the rows read: if an edit or erase holds it, SKIP LOCKED
    -- would drop it and the model would answer an older message (P1547 review 3). Busy; the client retries.
    IF v_msg.id = ANY(v_ids || v_out_ids) AND NOT (v_msg.id = ANY(v_locked)) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;
    v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY(v_locked));
    v_out_ids := ARRAY(SELECT u FROM unnest(v_out_ids) u WHERE u = ANY(v_locked));

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'who',  CASE WHEN t.author_id = v_job.owner_id THEN 'owner' ELSE 'other' END,
             'name', COALESCE(tp.name, 'Deleted user'),
             'body', COALESCE(t.body, CASE WHEN t.transcript_status = 'done' THEN t.transcript END),
             'voice', CASE WHEN t.audio_duration_ms IS NOT NULL
                           THEN CASE WHEN t.transcript_status = 'done' THEN 'transcript' ELSE 'untranscribed' END
                      END,
             'quoted', CASE WHEN t.forward_snapshot IS NULL THEN NULL
                            ELSE jsonb_build_object('name', t.forward_snapshot ->> 'author_name',
                                                    'body', t.forward_snapshot ->> 'body') END,
             'attachment', t.attachment_kind,
             'at', t.created_at) ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM public.chat_messages t
      LEFT JOIN public.profiles tp ON tp.id = t.author_id
     WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL;
    v_question := jsonb_build_object('body', left(v_msg.body, 4000));
  ELSE
    -- A mirror-chat reply: the mirror itself, never the channel asks kept there. P1546 scope: a question
    -- inside a thread sees that thread (root and replies) as 'context'; P1547: plus the main chat as
    -- 'outside' (thread roots, never replies). A question outside threads sees the main chat only.
    -- P1604: a Clarified session thread among the rows widens the offer to its profile (100,000 tokens x 3 chars) and the
    -- selection is made again over the wider window; nothing else changes the offer. mirror-agent.ts reads the same flag.
    -- P1619: only an OPEN copy counts here and costs its full text; a folded one costs its one line.
    -- P1619: which copies stay open is decided ONCE per attempt, here, before any offer pass, and used by the row cost, the payload, the
    -- refs and the profile alike; nothing reopens after the reservation. A retry recomputes it from the same trigger.
    SELECT COALESCE(array_agg(f.copy_id) FILTER (WHERE f.is_open), '{}'), COALESCE(array_agg(f.copy_id) FILTER (WHERE NOT f.is_open), '{}')
      INTO v_open, v_fold
      FROM public._mirror_fold_state(v_job.owner_id, v_msg) f;
    FOR v_pass IN 1..2 LOOP
      v_ids := ARRAY(
          SELECT s.id FROM (
            SELECT x.id, sum(CASE WHEN x.id = ANY(v_fold) THEN public._mirror_folded_chars(x) ELSE public._mirror_row_chars(x) END) OVER (ORDER BY x.created_at DESC, x.id DESC
                     ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
              FROM public.chat_messages x
             WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
               AND public._mirror_in_scope(x, v_msg)
               AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
             ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
           WHERE COALESCE(s.before, 0) < v_chars);
      IF v_msg.thread_root_id IS NOT NULL THEN
        v_out_ids := ARRAY(
            SELECT s.id FROM (
              SELECT x.id, sum(CASE WHEN x.id = ANY(v_fold) THEN public._mirror_folded_chars(x) ELSE public._mirror_row_chars(x) END) OVER (ORDER BY x.created_at DESC, x.id DESC
                       ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS before
                FROM public.chat_messages x
               WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
                 AND x.thread_root_id IS NULL AND x.id <> v_msg.thread_root_id
                 AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at
               ORDER BY x.created_at DESC, x.id DESC LIMIT c_rows) s
             WHERE COALESCE(s.before, 0) < v_chars);
      ELSE
        v_out_ids := '{}';
      END IF;
      v_session := EXISTS (SELECT 1 FROM public.chat_messages x
                            WHERE x.id = ANY(v_ids || v_out_ids) AND x.deleted_at IS NULL
                              AND x.id = ANY(v_open)   -- P1619: only an OPEN session copy widens the offer and the reservation
                              AND x.forward_snapshot ->> 'session_thread' = 'true');
      EXIT WHEN v_pass = 2 OR NOT v_session;
      v_chars := 300000;
    END LOOP;

    -- ONE lock pass over every offered row, FOR SHARE SKIP LOCKED (P1547 review 2). erase_chat_data_for
    -- locks rows in phases (the erased person's own rows, then copies of them, then copied threads, then
    -- titles), so a start that WAITED on one of those rows while holding another could deadlock with it.
    -- A row an erase (or an edit) holds is skipped instead: never read, never sent, and absent from
    -- derived_refs, which are computed from exactly the rows locked and read below. Rows this start does
    -- lock are ones the erase has not reached yet; the erase then waits for this transaction and, under
    -- the context lock, cancels the job by the refs recorded here.
    SELECT COALESCE(array_agg(q.id), '{}') INTO v_locked FROM (
      SELECT m.id FROM public.chat_messages m WHERE m.id = ANY(v_ids || v_out_ids)
       ORDER BY m.created_at, m.id FOR SHARE SKIP LOCKED) q;
    -- The message this job answers must be among the rows read: if an edit or erase holds it, SKIP LOCKED
    -- would drop it and the model would answer an older message (P1547 review 3). Busy; the client retries.
    IF v_msg.id = ANY(v_ids || v_out_ids) AND NOT (v_msg.id = ANY(v_locked)) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;
    v_ids := ARRAY(SELECT u FROM unnest(v_ids) u WHERE u = ANY(v_locked));
    v_out_ids := ARRAY(SELECT u FROM unnest(v_out_ids) u WHERE u = ANY(v_locked));

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(CASE WHEN t.id = ANY(v_fold) THEN public._mirror_folded_context_item(t) ELSE public._mirror_context_item(t) END ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL;
    IF v_msg.thread_root_id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(CASE WHEN t.id = ANY(v_fold) THEN public._mirror_folded_context_item(t) ELSE public._mirror_context_item(t) END ORDER BY t.created_at, t.id), '[]'::jsonb)
        INTO v_out
        FROM public.chat_messages t WHERE t.id = ANY(v_out_ids) AND t.deleted_at IS NULL;
      SELECT count(*) INTO v_total FROM public.chat_messages x
       WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
         AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at;
    ELSE
      SELECT count(*) INTO v_chat_total FROM public.chat_messages x
       WHERE x.conversation_id = v_mirror.id AND x.context_conversation_id IS NULL
         AND public._mirror_in_scope(x, v_msg)
         AND x.deleted_at IS NULL AND x.created_at <= v_msg.created_at;
    END IF;
    v_question := NULL;  -- the trigger is the last item of the context
  END IF;

  -- whose words are in it, from exactly the rows read (locked, not deleted). A channel ask sends only each
  -- row's author and a forward's original author and body; a mirror row also its copied thread, a 1:1
  -- copy's title, and whatever an earlier mirror answer was derived from.
  IF v_job.kind = 'ask' THEN
    SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.author_id) AS r
        FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
      UNION
      SELECT public._chat_author_ref(t.forward_author_id)
        FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
    ) refs;
  ELSE
    SELECT array_remove(array_agg(DISTINCT r), NULL) INTO v_refs FROM (
      SELECT public._chat_author_ref(t.author_id) AS r
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.author_id IS NOT NULL
      UNION
      SELECT public._chat_author_ref(t.forward_author_id)
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.forward_author_id IS NOT NULL
      UNION
      SELECT e ->> 'author_ref'
        FROM public.chat_messages t,
             jsonb_array_elements(COALESCE(t.forward_snapshot -> 'thread', '[]'::jsonb)) e
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL
      UNION
      SELECT t.forward_snapshot ->> 'conversation_title_ref'
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.forward_snapshot ? 'conversation_title_ref'
      UNION
      SELECT unnest(t.derived_refs)
        FROM public.chat_messages t
       WHERE t.id = ANY(v_ids || v_out_ids) AND t.deleted_at IS NULL AND t.kind = 'agent'
    ) refs;
  END IF;

  -- Now the job row, and its state again: another start may have run while this one waited.
  SELECT * INTO v_job FROM public.mirror_jobs j WHERE j.id = p_job FOR UPDATE;
  IF v_job.state = 'done' THEN
    RETURN jsonb_build_object('status', 'done', 'reply_message_id', v_job.reply_message_id);
  END IF;
  IF v_job.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;
  IF (v_job.state = 'running' AND v_job.started_at > now() - interval '3 minutes') OR v_job.attempts >= 3 THEN
    RETURN jsonb_build_object('status', 'busy');
  END IF;

  -- A restarted dead attempt may still have been billed: its reservation is charged in full, never released.
  IF v_job.state = 'running' AND v_job.spend_id IS NOT NULL THEN
    UPDATE public.mirror_ai_spend s SET actual_usd = s.reserved_usd, state = 'settled', settled_at = now()
     WHERE s.id = v_job.spend_id AND s.state = 'reserved';
  END IF;
  v_reply_usd := (public._mirror_limits() ->> CASE WHEN v_session THEN 'reply_session_max_usd' ELSE 'reply_max_usd' END)::numeric;
  v_spend := public._mirror_reserve(v_job.owner_id, 'reply', v_reply_usd);
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
    'outside', v_out,
    'thread_total', v_total,
    'reserved_usd', v_reply_usd,
    'session', v_session,
    'chat_total', v_chat_total,
    'attempt', v_job.attempts + 1);
END;
$$;

REVOKE ALL ON FUNCTION public._mirror_tokens(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_name_tokens(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_title_phrase(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_date_hit(text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_copy_matches(text, text[], text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_fold_state(uuid, public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_folded_context_item(public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_folded_chars(public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_copy_thread(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_context_item(public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_begin_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mirror_begin_job(uuid) TO service_role;
-- The pure matchers read nothing; the service role may call them so the integration spec can pin the matching rules directly.
GRANT EXECUTE ON FUNCTION public._mirror_copy_matches(text, text[], text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_date_hit(text, timestamptz, timestamptz) TO service_role;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._mirror_tokens(text)', 'public._mirror_name_tokens(text[])', 'public._mirror_title_phrase(text)',
                               'public._mirror_date_hit(text, timestamptz, timestamptz)',
                               'public._mirror_copy_matches(text, text[], text, timestamptz, timestamptz)',
                               'public._mirror_fold_state(uuid, public.chat_messages)',
                               'public._mirror_folded_context_item(public.chat_messages)', 'public._mirror_folded_chars(public.chat_messages)',
                               'public._mirror_copy_thread(jsonb)', 'public._mirror_context_item(public.chat_messages)',
                               'public._mirror_begin_job(uuid)']
  LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1619: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF (public._mirror_limits() ->> 'reply_max_usd')::numeric <> 0.105
     OR (public._mirror_limits() ->> 'reply_session_max_usd')::numeric <> 0.225 THEN
    RAISE EXCEPTION 'P1619: the reservations must not change';
  END IF;
  -- the matcher, on the shapes the contract names (synthetic)
  IF NOT public._mirror_copy_matches('what did Алиса say', ARRAY['Алиса Тест'], NULL, NULL, now()) THEN RAISE EXCEPTION 'P1619: a Cyrillic name must match'; END IF;
  IF public._mirror_copy_matches('mirror general user', ARRAY['Deleted user', 'mirror'], 'Team · General', NULL, now()) THEN RAISE EXCEPTION 'P1619: placeholder words must not match'; END IF;
END
$check$;
