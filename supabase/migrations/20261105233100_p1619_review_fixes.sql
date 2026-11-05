-- Migration: P1619 review fixes: the fold decision, its cost, its masking, and the lock pass
-- Created: 2026-11-05
-- Spec: features/p1619_mirror_agent_stop_resending_copies.md (Build contract)
-- Guaranteed by: e2e/integration/p1619-*.spec.ts, src/tests/p1619-mirror-folded-copies.test.ts
--
-- diffed against: 20261105233000_p1619_mirror_fold_copies.sql (applied on test; NOT edited). Each CREATE OR REPLACE below is that file's body
--   with ONLY the changes listed here; signatures, grants, lock order and every other line are unchanged.
--   * _mirror_tokens: splits on every NON-alphanumeric (was whitespace + punctuation, so emoji and symbols stayed glued to a word:
--     "Bob🙂"). The separators are explicit code ranges, not [^[:alnum:]], so the result does not depend on the database locale, and
--     combining marks and Indic vowel signs (outside every range) are never split off a word.
--   * _mirror_date_hit: now a wrapper over the new _mirror_date_hit_norm (the same body on an already normalised, lower-cased text), so the
--     window can be normalised once. Same result for every input.
--   * _mirror_copy_matches: now a wrapper over the new array-taking _mirror_copy_matches_arr. Same result for every input.
--   * _mirror_parse_ts (new): a snapshot time that casts, or NULL. '2026-13-45' passes the shape test but raises on the cast; one such copy
--     must never abort the job.
--   * _mirror_is_system_root, _mirror_snap_name_tokens, _mirror_copy_is_folded (new, pure).
--   * _mirror_fold_state: the window's text is tokenised ONCE (a materialised CTE), the copy's speaker words and title phrase once per copy
--     and only for a copy not already open by position. A copy that is the trigger, or the trigger's own thread root, is classified even
--     past the 2000-row candidate cap. The date guard uses _mirror_parse_ts.
--   * _mirror_folded_context_item: carries the copy's reply count (`replies`, as _mirror_context_item does) and masks a system root with no
--     author: no `from`, and its "Deleted user" takes no speaker slot (as speaker() in mirror-context-fields.ts does on the open path).
--   * _mirror_begin_job: (a) a copy is folded exactly when it is NOT in v_open, so a copy past the candidate cap can never be sent in
--     full with session = false; v_fold is gone. (b) v_session is recomputed from the rows that survived FOR SHARE SKIP LOCKED, before
--     the reservation: a skipped session copy does not hold 0.225. (c) the channel-ask branch carries `sent_at` on `quoted`, as the
--     reply path does.
--
-- client-safe: function bodies only; no table, column or key changes.

-- 1. pure helpers --------------------------------------------------------------------------------------------------------------------

-- Lower-cased words of a text: NFC-normalised, split on whitespace, ASCII punctuation and symbols, Latin-1 punctuation, General Punctuation
-- through Miscellaneous Symbols and Arrows (U+2000-2BFF, which holds the zero-width joiner), CJK punctuation, variation selectors,
-- full-width punctuation and the emoji planes. Letters, digits and combining marks of every script stay inside a word.
CREATE OR REPLACE FUNCTION public._mirror_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT array_remove(regexp_split_to_array(lower(normalize(COALESCE(p_text, ''))),
    '[\s\u0000-/:-@[-`{-©«-´¶-¹»-¿×÷ -⯿　-〿︀-️！-／\U0001F000-\U0001FAFF]+'), '');
$$;

-- A snapshot time that casts, or NULL. STABLE, not IMMUTABLE: a time written without an offset is read in the session's zone.
CREATE OR REPLACE FUNCTION public._mirror_parse_ts(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF p_text IS NULL OR p_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
    RETURN NULL;
  END IF;
  RETURN p_text::timestamptz;
EXCEPTION WHEN OTHERS THEN   -- an impossible date (month 13, day 45): no time, no match, no abort. OTHERS never catches a cancel or a timeout.
  RETURN NULL;
END;
$$;

-- A system post (a transcript session's title row, a round thread's root): it has no speaker, so "Deleted user" would be a false author.
CREATE OR REPLACE FUNCTION public._mirror_is_system_root(p_body text, p_system_kind text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT p_system_kind IS NOT NULL OR COALESCE(p_body ~ '^session\|[^|]+\|[0-9]+(\|i)?$', false);
$$;

-- The speaker words of a copy: its author and its thread's authors, system rows never. Distinct names first, so a 720-line thread
-- tokenises a handful of names once.
CREATE OR REPLACE FUNCTION public._mirror_snap_name_tokens(p_snap jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public._mirror_name_tokens(ARRAY(
    SELECT DISTINCT q.n FROM (
      SELECT p_snap ->> 'author_name' AS n
       WHERE NOT public._mirror_is_system_root(p_snap ->> 'body', p_snap ->> 'system_kind')
      UNION ALL
      SELECT e ->> 'author_name'
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_snap -> 'thread') = 'array' THEN p_snap -> 'thread' ELSE '[]'::jsonb END) e
       WHERE NOT public._mirror_is_system_root(e ->> 'body', e ->> 'system_kind')) q
     WHERE q.n IS NOT NULL));
$$;

-- A copy is folded exactly when it is a copy with a snapshot that is not among the open ones.
CREATE OR REPLACE FUNCTION public._mirror_copy_is_folded(x public.chat_messages, p_open uuid[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT x.kind IN ('clarify', 'forward') AND x.forward_snapshot IS NOT NULL AND NOT (x.id = ANY(COALESCE(p_open, '{}'::uuid[])));
$$;

-- Does a (lower-cased, normalised) text name a calendar day (UTC) of the source? Body of the applied _mirror_date_hit, unchanged.
CREATE OR REPLACE FUNCTION public._mirror_date_hit_norm(p_norm text, p_at timestamptz, p_ref timestamptz)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  t     text := COALESCE(p_norm, '');
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

CREATE OR REPLACE FUNCTION public._mirror_date_hit(p_text text, p_at timestamptz, p_ref timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public._mirror_date_hit_norm(lower(normalize(COALESCE(p_text, ''))), p_at, p_ref);
$$;

-- The match on a text that is already tokenised: p_toks = _mirror_tokens(text), p_norm = lower(normalize(text)),
-- p_ntok = _mirror_name_tokens(names), p_phrase = _mirror_title_phrase(title). Nothing here tokenises anything.
CREATE OR REPLACE FUNCTION public._mirror_copy_matches_arr(p_toks text[], p_norm text, p_ntok text[], p_phrase text, p_src_at timestamptz, p_ref timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_ntok && p_toks, false)
      OR COALESCE((' ' || array_to_string(p_toks, ' ') || ' ') LIKE ('% ' || p_phrase || ' %'), false)
      OR public._mirror_date_hit_norm(p_norm, p_src_at, p_ref);
$$;

-- Does an owner's text name this copy: a speaker's word, the source chat's title as a phrase, or the source's date? (Semantics unchanged.)
CREATE OR REPLACE FUNCTION public._mirror_copy_matches(p_text text, p_names text[], p_title text, p_src_at timestamptz, p_ref timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_text, '') <> '' AND public._mirror_copy_matches_arr(
           public._mirror_tokens(p_text), lower(normalize(p_text)),
           public._mirror_name_tokens(p_names), public._mirror_title_phrase(p_title), p_src_at, p_ref);
$$;

-- 2. which copies stay open for one trigger ----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._mirror_fold_state(p_owner uuid, p_msg public.chat_messages)
RETURNS TABLE (copy_id uuid, is_open boolean)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH win0 AS (
    SELECT x.id, x.created_at,
           CASE WHEN x.audio_duration_ms IS NOT NULL THEN x.transcript ELSE x.body END AS txt
      FROM public.chat_messages x
     WHERE x.conversation_id = p_msg.conversation_id AND x.author_id = p_owner AND x.kind = 'message'
       AND x.deleted_at IS NULL AND x.context_conversation_id IS NULL
       AND (x.audio_duration_ms IS NULL OR x.transcript_status = 'done')
       AND public._mirror_in_scope(x, p_msg)
       AND (x.created_at, x.id) <= (p_msg.created_at, p_msg.id)
     ORDER BY x.created_at DESC, x.id DESC LIMIT 6),
  -- the six texts, tokenised and normalised ONCE (materialised: every copy below reads these rows, none recomputes them)
  win AS MATERIALIZED (
    SELECT w0.id, w0.created_at, public._mirror_tokens(w0.txt) AS toks, lower(normalize(COALESCE(w0.txt, ''))) AS norm
      FROM win0 w0),
  cut AS (   -- the oldest message of a FULL window; absent while fewer than 6 exist
    SELECT w.created_at AS c_at, w.id AS c_id
      FROM (SELECT v.id, v.created_at, count(*) OVER () AS n FROM win v) w
     WHERE w.n = 6 ORDER BY w.created_at, w.id LIMIT 1),
  cand_ids AS (
    (SELECT c.id
       FROM public.chat_messages c
      WHERE c.conversation_id = p_msg.conversation_id AND c.kind IN ('clarify', 'forward')
        AND c.forward_snapshot IS NOT NULL AND c.deleted_at IS NULL AND c.context_conversation_id IS NULL
        AND c.created_at <= p_msg.created_at
        AND (public._mirror_in_scope(c, p_msg)
             OR (p_msg.thread_root_id IS NOT NULL AND c.thread_root_id IS NULL AND c.id <> p_msg.thread_root_id))
      ORDER BY c.created_at DESC, c.id DESC LIMIT 2000)
    UNION
    -- the trigger and its own thread's root are classified whatever the cap cut
    (SELECT c.id
       FROM public.chat_messages c
      WHERE c.id IN (p_msg.id, COALESCE(p_msg.thread_root_id, p_msg.id)) AND c.conversation_id = p_msg.conversation_id
        AND c.kind IN ('clarify', 'forward') AND c.forward_snapshot IS NOT NULL
        AND c.deleted_at IS NULL AND c.context_conversation_id IS NULL)),
  cand AS (
    SELECT c.id, c.created_at, c.forward_snapshot AS snap
      FROM public.chat_messages c JOIN cand_ids i ON i.id = c.id)
  SELECT cd.id,
         CASE
           WHEN cd.id = p_msg.id OR (p_msg.thread_root_id IS NOT NULL AND cd.id = p_msg.thread_root_id) THEN true
           WHEN p_msg.thread_root_id IS NULL
                AND (NOT EXISTS (SELECT 1 FROM cut) OR (cd.created_at, cd.id) > (SELECT k.c_at, k.c_id FROM cut k)) THEN true
           -- only a copy not already open by position pays for matching; its words and title are read once, not once per window text
           ELSE EXISTS (
             SELECT 1
               FROM (SELECT public._mirror_snap_name_tokens(cd.snap) AS ntok,
                            public._mirror_title_phrase(cd.snap ->> 'conversation_title') AS phrase,
                            public._mirror_parse_ts(cd.snap ->> 'created_at') AS src
                     OFFSET 0) k,
                    win w
              WHERE public._mirror_copy_matches_arr(w.toks, w.norm, k.ntok, k.phrase, k.src, p_msg.created_at))
         END
    FROM cand cd;
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
    -- a folded copy that roots a mirror thread keeps its reply count, as an open one does
    'replies', CASE WHEN t.thread_root_id IS NULL THEN
                 (SELECT count(*) FROM public.chat_messages r
                   WHERE r.thread_root_id = t.id AND r.conversation_id = t.conversation_id AND r.deleted_at IS NULL)
               END,
    'folded', jsonb_build_object(
      'kind', t.kind,
      -- a system root has no author: no `from`, never "Deleted user"
      'from', CASE WHEN public._mirror_is_system_root(t.forward_snapshot ->> 'body', t.forward_snapshot ->> 'system_kind')
                   THEN NULL ELSE t.forward_snapshot ->> 'author_name' END,
      'in', t.forward_snapshot ->> 'conversation_title',
      'original_at', t.forward_snapshot ->> 'created_at',
      'speakers', (SELECT COALESCE(jsonb_agg(s.n ORDER BY s.o), '[]'::jsonb) FROM (
                     SELECT u.n, min(u.o) AS o
                       FROM unnest(ARRAY[CASE WHEN public._mirror_is_system_root(t.forward_snapshot ->> 'body', t.forward_snapshot ->> 'system_kind')
                                              THEN NULL ELSE t.forward_snapshot ->> 'author_name' END]
                                   || ARRAY(SELECT e ->> 'author_name'
                                              FROM jsonb_array_elements(z.thr) WITH ORDINALITY a(e, o)
                                             WHERE NOT public._mirror_is_system_root(e ->> 'body', e ->> 'system_kind') ORDER BY a.o)) WITH ORDINALITY u(n, o)
                      WHERE u.n IS NOT NULL GROUP BY u.n ORDER BY min(u.o) LIMIT 8) s),
      -- the copied message itself plus its thread; the stored total stands in for a thread the copy clipped
      'lines', 1 + COALESCE((t.forward_snapshot ->> 'thread_total')::integer, jsonb_array_length(z.thr)),
      -- a copy that is itself clipped keeps saying so: how many lines it kept
      'lines_kept', CASE WHEN COALESCE((t.forward_snapshot ->> 'thread_total')::integer, 0) > jsonb_array_length(z.thr)
                         THEN 1 + jsonb_array_length(z.thr) END)))
    FROM (SELECT CASE WHEN jsonb_typeof(t.forward_snapshot -> 'thread') = 'array' THEN t.forward_snapshot -> 'thread' ELSE '[]'::jsonb END AS thr) z;
$$;

-- 4. the job start -------------------------------------------------------------------------------------------------------------------

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
                                                    'body', t.forward_snapshot ->> 'body')
                                 -- P1619 review: when the quoted message was first written, as the reply path carries it
                                 || CASE WHEN t.forward_snapshot ->> 'created_at' IS NOT NULL
                                         THEN jsonb_build_object('sent_at', t.forward_snapshot ->> 'created_at') ELSE '{}'::jsonb END END,
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
    -- P1619 review: there is no fold list. A copy is folded exactly when it is NOT in v_open, so a copy the classifier never reached
    -- (past its candidate cap) is folded, never sent in full.
    SELECT COALESCE(array_agg(f.copy_id) FILTER (WHERE f.is_open), '{}') INTO v_open
      FROM public._mirror_fold_state(v_job.owner_id, v_msg) f;
    FOR v_pass IN 1..2 LOOP
      v_ids := ARRAY(
          SELECT s.id FROM (
            SELECT x.id, sum(CASE WHEN public._mirror_copy_is_folded(x, v_open) THEN public._mirror_folded_chars(x) ELSE public._mirror_row_chars(x) END) OVER (ORDER BY x.created_at DESC, x.id DESC
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
              SELECT x.id, sum(CASE WHEN public._mirror_copy_is_folded(x, v_open) THEN public._mirror_folded_chars(x) ELSE public._mirror_row_chars(x) END) OVER (ORDER BY x.created_at DESC, x.id DESC
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
    -- P1619 review: the flag is decided again from the rows that SURVIVED the lock pass, before the reservation. A session copy an erase
    -- or an edit held was skipped above; it must not keep the session reservation (0.225) or the session profile for an offer that
    -- no longer holds it. The profile and the reservation still come from this one flag.
    v_session := EXISTS (SELECT 1 FROM public.chat_messages x
                          WHERE x.id = ANY(v_ids || v_out_ids) AND x.deleted_at IS NULL
                            AND x.id = ANY(v_open)
                            AND x.forward_snapshot ->> 'session_thread' = 'true');

    -- Erasure takes this lock exclusively before it cancels derived jobs, so refs recorded below are seen
    -- by it. TRY, never wait: waiting here while holding the rows above could close a cycle with an erase
    -- that holds the lock and wants one of those rows. An erase under way means "busy"; the client retries.
    IF NOT pg_try_advisory_xact_lock_shared(hashtext('p1520_mirror_context')) THEN
      RETURN jsonb_build_object('status', 'busy');
    END IF;

    SELECT COALESCE(jsonb_agg(CASE WHEN public._mirror_copy_is_folded(t, v_open) THEN public._mirror_folded_context_item(t) ELSE public._mirror_context_item(t) END ORDER BY t.created_at, t.id), '[]'::jsonb)
      INTO v_ctx
      FROM public.chat_messages t WHERE t.id = ANY(v_ids) AND t.deleted_at IS NULL;
    IF v_msg.thread_root_id IS NOT NULL THEN
      SELECT COALESCE(jsonb_agg(CASE WHEN public._mirror_copy_is_folded(t, v_open) THEN public._mirror_folded_context_item(t) ELSE public._mirror_context_item(t) END ORDER BY t.created_at, t.id), '[]'::jsonb)
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
REVOKE ALL ON FUNCTION public._mirror_parse_ts(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_is_system_root(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_snap_name_tokens(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_copy_is_folded(public.chat_messages, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_date_hit_norm(text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_date_hit(text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_copy_matches_arr(text[], text, text[], text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_copy_matches(text, text[], text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_fold_state(uuid, public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_folded_context_item(public.chat_messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._mirror_begin_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mirror_begin_job(uuid) TO service_role;
-- The pure matchers read nothing; the service role may call them so the integration spec can pin the matching rules directly.
GRANT EXECUTE ON FUNCTION public._mirror_copy_matches(text, text[], text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_copy_matches_arr(text[], text, text[], text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_date_hit(text, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_parse_ts(text) TO service_role;
GRANT EXECUTE ON FUNCTION public._mirror_tokens(text) TO service_role;

DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public._mirror_tokens(text)', 'public._mirror_parse_ts(text)', 'public._mirror_is_system_root(text, text)',
                               'public._mirror_snap_name_tokens(jsonb)', 'public._mirror_copy_is_folded(public.chat_messages, uuid[])',
                               'public._mirror_date_hit_norm(text, timestamptz, timestamptz)', 'public._mirror_date_hit(text, timestamptz, timestamptz)',
                               'public._mirror_copy_matches_arr(text[], text, text[], text, timestamptz, timestamptz)',
                               'public._mirror_copy_matches(text, text[], text, timestamptz, timestamptz)',
                               'public._mirror_fold_state(uuid, public.chat_messages)',
                               'public._mirror_folded_context_item(public.chat_messages)',
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
  IF NOT public._mirror_copy_matches('what did Алиса say', ARRAY['Алиса Тест'], NULL, NULL, now()) THEN RAISE EXCEPTION 'P1619: a Cyrillic name must match'; END IF;
  IF public._mirror_copy_matches('mirror general user', ARRAY['Deleted user', 'mirror'], 'Team · General', NULL, now()) THEN RAISE EXCEPTION 'P1619: placeholder words must not match'; END IF;
  IF NOT public._mirror_copy_matches('Bob🙂 said hi', ARRAY['Bob Lee'], NULL, NULL, now()) THEN RAISE EXCEPTION 'P1619: an emoji must not stay glued to a name'; END IF;
  IF NOT public._mirror_copy_matches('राहुल ने क्या कहा', ARRAY['राहुल शर्मा'], NULL, NULL, now()) THEN RAISE EXCEPTION 'P1619: a Devanagari name must stay whole'; END IF;
  IF public._mirror_parse_ts('2026-13-45T10:00:00Z') IS NOT NULL OR public._mirror_parse_ts('2026-11-04T10:00:00Z') IS NULL THEN RAISE EXCEPTION 'P1619: the safe parse'; END IF;
END
$check$;
