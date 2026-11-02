-- P1592: event transcripts land in the event channel, one thread per round table (database layer).
-- Created: 2026-10-29
-- Spec: features/p1592_event_transcripts_land_in_round_threads.md
--
-- client-safe: no deployed client writes to transcribe_messages (verified by grep of src/, e2e/,
--   scripts/ and supabase/functions/: the only uses are the two READS at
--   src/app/data/transcribe-service.ts and src/app/data/api.ts; the P1236 server path writes through
--   record_transcribe_slice under the service role). So dropping the P1149 client INSERT policy and
--   revoking INSERT from authenticated changes nothing a deployed bundle does. Everything else is
--   additive: new columns with defaults, new tables no client can reach, new service-only functions, and
--   a get_my_chats() that only gains two columns at the END of its return (DROP + CREATE because a
--   RETURNS TABLE shape cannot change in place; the grant is re-applied in the same file). Deployed
--   readers pick columns by name, so the extra columns are ignored by them. forward_chat_message,
--   clarify_chat_message and _chat_forward_snapshot keep their signatures and only gain two snapshot keys.
--
-- diffed against: the latest definition of each function this file redefines:
--   record_transcribe_slice        20260908170200_p1236_c_record_slice_rpc.sql
--   erase_chat_data_for            20261020213000_p1520_mirror_v2.sql (body identical plus the P1592 steps:
--                                  speaker + round-thread locks first, then round titles rebuilt)
--   erase_my_account               20261019203000_p1512_clarity_chat.sql (body identical; the erase_chat_data_for
--                                  call moved above the event_room_members tombstone, nothing else)
--   host_set_round_seats           20261002193000_p1337_clear_stale_table_topics.sql (body identical; the
--                                  seat upsert reads its rows ORDER BY table_no, member id)
--   (transcribe_room_sweep_tick is NOT redefined: an earlier draft of this file called the retry from the
--    sweep; that call was moved to its own cron job and the sweep keeps its p1307 body byte for byte)
--   _chat_forward_snapshot         20261019203000_p1512_clarity_chat.sql
--   forward_chat_message           20261019203000_p1512_clarity_chat.sql  (body identical but the snapshot keys)
--   clarify_chat_message           20261023130000_p1547_review_fixes.sql  (body identical but the snapshot keys)
--   get_my_chats                   20261027120400_p1576_get_my_chats_merge_p1545.sql (body identical but the two
--                                  trailing columns)
--
-- WHY (spec Decisions D1-D10, Invariants):
--   * The server posts, never the browser. record_transcribe_slice stores the live row, decides ONCE where
--     the line goes (event channel / round thread / nowhere) and writes that on the same row; a poster then
--     derives conversation, thread and author from the stored row alone. The decision is stored because
--     host_set_round_seats deletes and re-inserts seats with no history: a retry after a re-seat must still
--     post into the ORIGINAL place.
--   * Posting never costs the room a line. The poster runs in a BEGIN ... EXCEPTION subtransaction: if it
--     fails, the live row (and the destination) survive, post_failed_at is stamped, and the sweep tick
--     retries. The failure is logged once per row (only on the NULL -> set transition), never per retry.
--   * Words reach only readers of the event channel. No read policy is widened: round-thread messages are
--     ordinary chat_messages rows in the event conversation, so chat_messages_select (conversation access +
--     created_at >= access since) already governs them. The poster never posts for a speaker who cannot read
--     the channel, and a speaker whose access began AFTER a thread's root was created posts to the channel
--     top level instead (ordinary sends refuse such a root, p1546, and the client cannot open it).
--   * Speech from a person who is not seated (before round 1, in the pool, marked out, after the rounds end) goes
--     into ONE thread per event channel, titled by _transcribe_outside_title() ("Outside rounds"); the channel top
--     level only when the speaker cannot open that thread (access began after its root was created, see above).
--     Its root is a system post like a round thread's, but with its own system_kind ('outside_rounds'):
--     it has no round and no names, so nothing that retitles, rosters, lists ("My rounds") or erases by round may
--     treat it as one, and a copy of it keeps its body as it is (copies of a round root are made name-free).
--     A Clarify of a line in it (or of its root) copies that message alone, never the thread: it holds an event's
--     worth of other people's speech.
--   * One message per stretch of talk: a new line is appended to the speaker's latest transcription message
--     in that exact place unless a rule in _transcribe_post_line says otherwise. Appends never set
--     edited_at (it belongs to a person editing their own message).
--
-- TRIGGERS ON chat_messages, audited for this change (all migrations grepped; none touches edited_at):
--   chat_messages_no_agent_copy   BEFORE INSERT WHEN forwarded_from_message_id IS NOT NULL -> never fires here
--   chat_messages_voice_guard     BEFORE INSERT/UPDATE OF audio_duration_ms WHEN it IS NOT NULL -> never fires
--   chat_messages_voice_clear     BEFORE UPDATE WHEN deleted_at IS NOT NULL (+ audio columns) -> never fires
--   chat_messages_mirror_voice_reply AFTER UPDATE OF transcript_status -> never fires (we do not touch it)
--   Mirror agent jobs are queued only by mirror_request_reply (an RPC the owner calls from a mirror chat) and
--   by the voice-transcript trigger above; _mirror_in_scope is a READ filter on mirror context. A posted
--   transcription lives in an event conversation, so no mirror job is ever enqueued by an insert or an append.
--
-- DESIGN CHOICES the spec left to /dev:
--   * Pause threshold between two lines of one message: 60 s (c_pause). The live slice cadence is 13 s, so
--     more than four missed slices in a row is a real pause rather than a slow slice.
--   * Equal first names in one title: the event room's own disambiguation is shortName() in
--     src/app/prototypes/events/rounds/use-event-rounds.ts ("Aleksandra P." = first name + last-name initial).
--     _transcribe_round_title applies exactly that ("Anna K."), and only to the people who collide.
--   * Retry: its own pg_cron job (transcribe_post_retry, every minute) calling the PROCEDURE
--     transcribe_post_retry_run(), which COMMITs per row (verified to work under pg_cron on the self-hosted
--     TEST before relying on it), so locks are never held for a whole batch. It looks at unposted rows from
--     the last 24 hours, oldest first, at most 200 per run. A row that has failed for a day is left for an
--     operator; without a bound a permanently failing oldest 200 would starve every newer row. The function
--     transcribe_post_retry_tick() is the same thing for tests and manual use (25 rows, no COMMIT).
--   * Bounded lock waits: posting and retrying run with lock_timeout = 2s. WHEN OTHERS does not catch
--     query_canceled, so a lock wait that ran into the request's statement_timeout would roll back the live row
--     and the slice counter; a 2 s lock_not_available is caught and the row waits for the retry.
--   * Kill switch: transcribe_channel_posting.enabled. Ships FALSE; turn it on after the frontend that carries
--     the new terms is live. While off, destinations are 'none' and the retry does nothing.
--   * Titles: one function (_transcribe_retitle_thread) builds every title from the member list, names in one
--     order (alphabetical, then profile id). Copies of a root (forward / clarify) carry "Round {n}" WITHOUT the
--     names, so account erasure has nothing to scrub in a copy.
--   * Thread members are people with a profile (chat_round_thread_members.profile_id is a key). A walk-in
--     seated at a table has no account and cannot read the channel, so they are neither listed nor named.
--   * Account erasure: erase_chat_data_for takes an exclusive "erasing" marker for the person, then its
--     round-thread locks, before it collects anything; posters and the seating trigger only TRY the marker
--     (shared) and leave an in-flight person out, so no name is written behind an erasure and none is missed by
--     it. It then removes the person from
--     chat_round_thread_members and rebuilds each affected root title from who remains ("Round {n}" if none),
--     without touching edited_at (section 11).
--   * Not done: an edit made from a stale draft while lines are being appended to the same message still
--     overwrites the appended lines (edit_chat_message has no compare-and-swap). Appends themselves are now
--     safe against edits and deletes; the stale-draft case needs a change to edit_chat_message.
--   * transcribe_messages stays readable to room members as before. The new columns (dest_*, chat_message_id,
--     posted_at, post_failed_at) are therefore visible to them: they are ids and timestamps of rows in a room
--     the reader already belongs to, and chat_messages RLS still decides whether the message can be opened.

-- ============================================================================
-- 1. Columns
-- ============================================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS system_kind text;
-- Dropped and re-added so a database that already holds the narrower list takes the wider one.
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_system_kind_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_system_kind_check CHECK (system_kind IS NULL OR system_kind IN ('round_thread', 'outside_rounds'));
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_transcription boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_messages.system_kind IS
  'P1592: set only on a thread root post (author NULL, body = the title): round_thread = one round table''s thread, outside_rounds = the event channel''s single thread for speech from people not seated in a round. Clients render the title alone.';
COMMENT ON COLUMN public.chat_messages.is_transcription IS
  'P1592: a line the server transcribed from a person''s microphone. Clients render a small "Transcribed" mark beside the author and time.';

ALTER TABLE public.transcribe_messages
  ADD COLUMN IF NOT EXISTS dest_kind text
    CONSTRAINT transcribe_messages_dest_kind_check CHECK (dest_kind IS NULL OR dest_kind IN ('channel', 'round', 'none')),
  ADD COLUMN IF NOT EXISTS dest_event_id uuid,
  ADD COLUMN IF NOT EXISTS dest_round_id uuid REFERENCES public.event_rounds(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dest_table_no integer,
  ADD COLUMN IF NOT EXISTS chat_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_failed_at timestamptz;

COMMENT ON COLUMN public.transcribe_messages.dest_kind IS
  'P1592: where this line goes, decided ONCE when the row is written and never recomputed. NULL only on rows written before P1592.';
COMMENT ON COLUMN public.transcribe_messages.posted_at IS
  'P1592: idempotency marker. A row with posted_at set is never posted again.';
COMMENT ON COLUMN public.transcribe_messages.post_failed_at IS
  'P1592: first time posting this row failed. Logged only on the NULL -> set transition.';

-- the retry tick's whole working set
CREATE INDEX IF NOT EXISTS transcribe_messages_unposted
  ON public.transcribe_messages (spoken_at, id)
  WHERE posted_at IS NULL AND dest_kind IN ('channel', 'round');
CREATE INDEX IF NOT EXISTS transcribe_messages_chat_message
  ON public.transcribe_messages (chat_message_id) WHERE chat_message_id IS NOT NULL;

-- Nothing a client sends may ever reach this table: only the service-role path writes it (Invariants).
-- The policy is dropped AND the privilege revoked, so a future policy added by mistake still has no grant.
-- UPDATE and DELETE are revoked too: the stored destination and posted_at are load-bearing now, and only the
-- missing policy would otherwise stop a client rewriting them. Verified by grep that nothing in src/, e2e/,
-- scripts/, services/ or supabase/functions updates or deletes this table as a client (the service role does
-- not need these grants).
DROP POLICY IF EXISTS "room members can send their own messages" ON public.transcribe_messages;
REVOKE INSERT, UPDATE, DELETE ON public.transcribe_messages FROM PUBLIC, anon, authenticated;

-- Kill switch (spec Appetite: turning the posting off must leave the room page exactly as it is today).
-- One service-only row. It ships DISABLED and is switched on after the frontend carrying the new terms is
-- live. While off, _transcribe_decide_destination answers 'none', so nothing is posted and the retry tick
-- does nothing.
CREATE TABLE IF NOT EXISTS public.transcribe_channel_posting (
  singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.transcribe_channel_posting (singleton, enabled) VALUES (true, false) ON CONFLICT DO NOTHING;
ALTER TABLE public.transcribe_channel_posting ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.transcribe_channel_posting FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.transcribe_channel_posting TO service_role;

-- ============================================================================
-- 2. Round threads
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_round_threads (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL,
  round_id        uuid NOT NULL REFERENCES public.event_rounds(id)       ON DELETE CASCADE,
  table_no        integer NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  root_message_id uuid NOT NULL REFERENCES public.chat_messages(id)      ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- exactly one thread per round and table, enforced here, not by luck of timing
  CONSTRAINT chat_round_threads_round_table_key UNIQUE (round_id, table_no)
);
CREATE INDEX IF NOT EXISTS chat_round_threads_conversation ON public.chat_round_threads (conversation_id);
CREATE INDEX IF NOT EXISTS chat_round_threads_root         ON public.chat_round_threads (root_message_id);

CREATE TABLE IF NOT EXISTS public.chat_round_thread_members (
  thread_id    uuid NOT NULL REFERENCES public.chat_round_threads(id) ON DELETE CASCADE,
  profile_id   uuid NOT NULL REFERENCES public.profiles(id)           ON DELETE CASCADE,
  display_name text,
  PRIMARY KEY (thread_id, profile_id)
);
CREATE INDEX IF NOT EXISTS chat_round_thread_members_profile ON public.chat_round_thread_members (profile_id);

ALTER TABLE public.chat_round_threads        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_round_thread_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_round_threads        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_round_thread_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.chat_round_threads        TO service_role;
GRANT ALL ON TABLE public.chat_round_thread_members TO service_role;

-- The event channel's single "Outside rounds" thread: where a transcribing attendee who is not seated in a
-- running round is posted. Exactly one per conversation, enforced by the key, not by luck of timing. Same
-- shape and grants as chat_round_threads; it has no members table because it has no roster and no names.
CREATE TABLE IF NOT EXISTS public.chat_outside_round_threads (
  conversation_id uuid PRIMARY KEY REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  root_message_id uuid NOT NULL UNIQUE REFERENCES public.chat_messages(id)  ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_outside_round_threads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_outside_round_threads FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.chat_outside_round_threads TO service_role;

-- ============================================================================
-- 3. Snapshot: forwards and clarifies keep the two marks
-- ============================================================================
CREATE OR REPLACE FUNCTION public._chat_forward_snapshot(p_snap jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'author_name',      COALESCE(p_snap -> 'author_name', to_jsonb('Deleted user'::text)),
    'body',             COALESCE(p_snap -> 'body', 'null'::jsonb),
    'created_at',       COALESCE(p_snap -> 'created_at', 'null'::jsonb),
    'is_transcription', COALESCE(p_snap -> 'is_transcription', 'false'::jsonb),
    'system_kind',      COALESCE(p_snap -> 'system_kind', 'null'::jsonb));
$$;
REVOKE ALL ON FUNCTION public._chat_forward_snapshot(jsonb) FROM PUBLIC, anon, authenticated;


-- ============================================================================
-- 4. Internal helpers (no grants: only other definer functions call them)
-- ============================================================================

-- THE one place the name of the outside-rounds thread is defined (the root's body and the bar's label).
CREATE OR REPLACE FUNCTION public._transcribe_outside_title()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT 'Outside rounds'::text; $$;
REVOKE ALL ON FUNCTION public._transcribe_outside_title() FROM PUBLIC, anon, authenticated;

-- One lock per place (a conversation's top level, or one thread). Appends and the quiet swap take it, so two
-- writers to one place never interleave out of order.
CREATE OR REPLACE FUNCTION public._transcribe_lock_place(p_conversation uuid, p_thread_root uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended('p1592:place:' || p_conversation::text || ':' || COALESCE(p_thread_root::text, 'top'), 0));
$$;
REVOKE ALL ON FUNCTION public._transcribe_lock_place(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- "Round 2 · Anna & Ben". Pure. First names, as the event room shows them; people in this title who share a
-- first name get the event room's own short form (shortName in use-event-rounds.ts: "Anna K.").
CREATE OR REPLACE FUNCTION public._transcribe_round_title(p_round_no integer, p_names text[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  n      integer := COALESCE(array_length(p_names, 1), 0);
  v_out  text[] := '{}';
  v_part text[];
  v_cnt  integer;
  v_one  text;
  i      integer;
  j      integer;
BEGIN
  IF n = 0 THEN
    RETURN 'Round ' || p_round_no;
  END IF;
  FOR i IN 1..n LOOP
    v_part := regexp_split_to_array(btrim(p_names[i]), '\s+');
    v_cnt := 0;
    FOR j IN 1..n LOOP
      IF lower((regexp_split_to_array(btrim(p_names[j]), '\s+'))[1]) = lower(v_part[1]) THEN
        v_cnt := v_cnt + 1;
      END IF;
    END LOOP;
    IF v_cnt > 1 AND array_length(v_part, 1) >= 2 THEN
      v_one := v_part[1] || ' ' || left(v_part[array_length(v_part, 1)], 1) || '.';
    ELSE
      v_one := v_part[1];
    END IF;
    v_out := v_out || v_one;
  END LOOP;
  RETURN 'Round ' || p_round_no || ' · ' ||
    CASE WHEN n = 1 THEN v_out[1]
         ELSE array_to_string(v_out[1:n - 1], ', ') || ' & ' || v_out[n] END;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_round_title(integer, text[]) FROM PUBLIC, anon, authenticated;

-- Who belongs to a thread: everyone seated at that round + table right now (observers and people who are not
-- recording included), the people already on the thread (seating keeps no history, so the thread keeps its own
-- list), and the speaker whose line is being placed. Only people with an account (a member key is a profile).
CREATE OR REPLACE FUNCTION public._transcribe_thread_roster(
  p_round_id uuid, p_table_no integer, p_thread_id uuid, p_speaker uuid)
RETURNS TABLE (profile_id uuid, display_name text, rnk integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.profile_id, d.display_name, d.rnk FROM (
    SELECT DISTINCT ON (x.profile_id) x.profile_id, x.display_name, x.rnk FROM (
      SELECT rm.profile_id, rm.display_name,
             CASE s.role WHEN 'first' THEN 1 WHEN 'second' THEN 2 ELSE 3 END AS rnk
        FROM public.event_round_seats s
        JOIN public.event_room_members rm ON rm.id = s.room_member_id
       WHERE s.round_id = p_round_id AND s.table_no = p_table_no AND rm.profile_id IS NOT NULL
      UNION ALL
      SELECT tm.profile_id, COALESCE(tm.display_name, ''), 4
        FROM public.chat_round_thread_members tm
       WHERE tm.thread_id = p_thread_id
      UNION ALL
      SELECT rm.profile_id, rm.display_name, 5
        FROM public.event_rounds er
        JOIN public.event_room_members rm ON rm.event_id = er.event_id AND rm.profile_id = p_speaker
       WHERE er.id = p_round_id
    ) x
    WHERE btrim(x.display_name) <> ''
    ORDER BY x.profile_id, x.rnk
  ) d
  ORDER BY d.rnk, lower(d.display_name), d.profile_id;
$$;
REVOKE ALL ON FUNCTION public._transcribe_thread_roster(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The roster as the POSTER reads it: the pure roster above minus anyone whose account is being erased right now.
-- THE ERASING MARKER (P1592). erase_chat_data_for takes pg_advisory_xact_lock('p1592:erasing:<profile>')
-- EXCLUSIVE as its very first lock and keeps it to commit. Anyone who is about to WRITE a person's name onto a
-- thread (this function, the seating trigger) first does pg_try_advisory_xact_lock_shared on the same key and
-- never waits for it:
--   * try fails  = an erasure is in flight, and it may already have collected its threads: the person is left
--                  out (an erasure that has not finished never leaves a name behind it, because the person is
--                  tombstoned when it commits, and a skipped name is simply not written).
--   * try wins   = no erasure is in flight, and the shared lock is HELD to commit. An erasure that starts after
--                  this waits for this transaction to commit, and only then collects: it finds the thread, member
--                  row or seat this transaction wrote.
-- Both directions are closed without a timeout, so a slow erasure cannot delay a poster or a host.
-- Two statements on purpose, and they must NOT be merged into one: a single statement would read the names in
-- its snapshot before the locks were taken. Consequence, in the safe direction: a person whose seat commits
-- between the two reads is in the second but not in the locked set, so this line leaves them out (their name is
-- not written); the next line at the table, or their next seating change, restores them.
-- The locks are taken in the first, the roster is read in the second (a new
-- snapshot, after the locks), so an erasure that committed between the poster's snapshot and its lock is seen
-- (its tombstone clears profile_id, which the pure roster skips). VOLATILE: it takes locks.
CREATE OR REPLACE FUNCTION public._transcribe_thread_roster_locked(
  p_round_id uuid, p_table_no integer, p_thread_id uuid, p_speaker uuid)
RETURNS TABLE (profile_id uuid, display_name text, rnk integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_ok uuid[] := '{}';
  v_p  uuid;
BEGIN
  FOR v_p IN
    SELECT r.profile_id FROM public._transcribe_thread_roster(p_round_id, p_table_no, p_thread_id, p_speaker) r
     ORDER BY r.profile_id
  LOOP
    IF pg_try_advisory_xact_lock_shared(hashtextextended('p1592:erasing:' || v_p::text, 0)) THEN
      v_ok := v_ok || v_p;
    END IF;
  END LOOP;
  RETURN QUERY
    SELECT r.profile_id, r.display_name, r.rnk
      FROM public._transcribe_thread_roster(p_round_id, p_table_no, p_thread_id, p_speaker) r
     WHERE r.profile_id = ANY (v_ok)
     ORDER BY r.rnk, lower(r.display_name), r.profile_id;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_thread_roster_locked(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- The name-free title of a round-thread root, for COPIES (forward / clarify). A copy outlives the thread's
-- member list and erasure cannot find a person's name inside a copied title, so copies never carry names.
CREATE OR REPLACE FUNCTION public._transcribe_bare_root_title(p_message uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((SELECT 'Round ' || r.round_no
                     FROM public.chat_round_threads t JOIN public.event_rounds r ON r.id = t.round_id
                    WHERE t.root_message_id = p_message), 'Round');
$$;
REVOKE ALL ON FUNCTION public._transcribe_bare_root_title(uuid) FROM PUBLIC, anon, authenticated;

-- THE one place a root's title is rebuilt (posting, later seating and erasure all call it): from the thread's
-- own member list, names in one fixed order (alphabetical, then profile id), "Round {n}" when no named member
-- remains. The caller holds the thread lock. edited_at is never touched.
CREATE OR REPLACE FUNCTION public._transcribe_retitle_thread(p_thread uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_root  uuid;
  v_no    integer;
  v_names text[];
BEGIN
  SELECT t.root_message_id, r.round_no INTO v_root, v_no
    FROM public.chat_round_threads t JOIN public.event_rounds r ON r.id = t.round_id
   WHERE t.id = p_thread;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT array_agg(tm.display_name ORDER BY lower(tm.display_name), tm.profile_id) INTO v_names
    FROM public.chat_round_thread_members tm
   WHERE tm.thread_id = p_thread AND btrim(COALESCE(tm.display_name, '')) <> '';
  UPDATE public.chat_messages m
     SET body = public._transcribe_round_title(v_no, COALESCE(v_names, '{}'))
   WHERE m.id = v_root AND m.deleted_at IS NULL
     AND m.body IS DISTINCT FROM public._transcribe_round_title(v_no, COALESCE(v_names, '{}'));
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_retitle_thread(uuid) FROM PUBLIC, anon, authenticated;

-- Where does the line of this speaker go RIGHT NOW? Called once, when the live row is written; the answer is
-- stored on the row and never recomputed.
--   none     the room has no event, or the speaker cannot read the event's channel
--   round    seated: a seat in the event's LATEST round, that round not ended, not marked left, not sitting it out
--   channel  everything else (before round 1, in the pool, marked out, after the rounds end): the poster puts
--            these lines in the event channel's single outside-rounds thread
CREATE OR REPLACE FUNCTION public._transcribe_decide_destination(
  p_room_id uuid, p_member_id uuid,
  OUT o_kind text, OUT o_event_id uuid, OUT o_round_id uuid, OUT o_table_no integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid;
  v_conv    uuid;
  v_since   timestamptz;
  v_rm      uuid;
  v_round   public.event_rounds;
  v_table   integer;
BEGIN
  o_kind := 'none';
  -- the kill switch: while posting is off nothing is posted and the room page is exactly as before
  IF NOT COALESCE((SELECT p.enabled FROM public.transcribe_channel_posting p WHERE p.singleton), false) THEN
    RETURN;
  END IF;
  SELECT r.event_id, m.profile_id INTO o_event_id, v_profile
    FROM public.transcribe_room_members m
    JOIN public.transcribe_rooms r ON r.id = m.room_id
   WHERE m.id = p_member_id AND m.room_id = p_room_id;
  IF o_event_id IS NULL OR v_profile IS NULL THEN
    RETURN;
  END IF;

  -- May the speaker read the channel? The channel row is created lazily, so when it does not exist yet the
  -- same rule is evaluated straight from the event (host, or an RSVP inside the grace window) — exactly the
  -- 'event' branch of _chat_access_since.
  SELECT c.id INTO v_conv FROM public.chat_conversations c WHERE c.kind = 'event' AND c.event_id = o_event_id;
  IF v_conv IS NOT NULL THEN
    v_since := public._chat_access_since(v_conv, v_profile);
  ELSE
    SELECT CASE WHEN e.host_id = v_profile THEN '-infinity'::timestamptz
                ELSE (SELECT r.rsvped_at FROM public.event_rsvps r
                       WHERE r.event_id = e.id AND r.profile_id = v_profile
                         AND r.rsvped_at <= e.datetime + public.event_grace_interval())
           END
      INTO v_since
      FROM public.events e WHERE e.id = o_event_id;
  END IF;
  IF v_since IS NULL THEN
    RETURN;
  END IF;

  o_kind := 'channel';
  SELECT rm.id INTO v_rm FROM public.event_room_members rm
   WHERE rm.event_id = o_event_id AND rm.profile_id = v_profile;
  IF v_rm IS NULL THEN
    RETURN;
  END IF;
  SELECT er.* INTO v_round FROM public.event_rounds er
   WHERE er.event_id = o_event_id ORDER BY er.round_no DESC LIMIT 1;
  IF NOT FOUND OR v_round.ended_at IS NOT NULL THEN
    RETURN;
  END IF;
  SELECT s.table_no INTO v_table FROM public.event_round_seats s
   WHERE s.round_id = v_round.id AND s.room_member_id = v_rm;
  IF v_table IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.event_round_presence p
              WHERE p.event_id = o_event_id AND p.room_member_id = v_rm
                AND (p.left_at IS NOT NULL OR p.sits_out_round IS NOT DISTINCT FROM v_round.round_no)) THEN
    RETURN;
  END IF;
  o_kind := 'round';
  o_round_id := v_round.id;
  o_table_no := v_table;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_decide_destination(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. The poster: derives everything from the stored row
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_post_line(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- A 13 s slice cadence means more than four missed slices in a row is a real pause, not a slow slice.
  c_pause CONSTANT interval := interval '60 seconds';
  c_max   CONSTANT integer  := 4000;           -- chat_messages.body limit
  v_row        public.transcribe_messages;
  v_speaker    uuid;
  v_conv       uuid;
  v_since      timestamptz;
  v_round      public.event_rounds;
  v_thread     public.chat_round_threads;
  v_root       uuid;                           -- thread root the line goes under; NULL = channel top level
  v_out_root   uuid;                           -- the channel's outside-rounds thread root
  v_root_at    timestamptz;
  v_root_del   timestamptz;
  v_root_id    uuid;
  v_title      text;
  v_line       text;
  v_last       public.chat_messages;
  v_prev_at    timestamptz;
  v_n_rows     integer;
  v_same_room  boolean;
  v_msg        uuid;
  v_cnt        integer;
BEGIN
  -- Lock order everywhere: transcribe row, speaker, thread (or outside-rounds), place, then message rows.
  -- The row lock serialises this poster against the retry tick and against a second delivery of the same row.
  SELECT t.* INTO v_row FROM public.transcribe_messages t WHERE t.id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_row.posted_at IS NOT NULL THEN
    RETURN v_row.chat_message_id;               -- idempotent: never posted twice
  END IF;
  IF v_row.dest_kind IS NULL OR v_row.dest_kind = 'none' THEN
    RETURN NULL;                                -- written before P1592, or nowhere to post
  END IF;

  SELECT m.profile_id INTO v_speaker FROM public.transcribe_room_members m WHERE m.id = v_row.member_id;
  IF v_speaker IS NULL OR v_row.dest_event_id IS NULL THEN
    RAISE EXCEPTION 'transcribe post: row has no speaker or event' USING ERRCODE = '22023';
  END IF;
  -- Erasure of this speaker takes the same lock first: the poster either finishes before it or finds the
  -- account gone, never posting this person's words after the erasure scrubbed them.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || v_speaker::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_speaker) THEN
    RAISE EXCEPTION 'transcribe post: speaker no longer exists' USING ERRCODE = '42501';
  END IF;

  -- The text is cut to the body limit at whitespace (a 13 s slice is ~40 words; this guards the impossible).
  v_line := btrim(v_row.text);
  IF char_length(v_line) > c_max THEN
    v_line := regexp_replace(left(v_line, c_max), '\s+\S*$', '');
    IF v_line = '' THEN
      v_line := left(btrim(v_row.text), c_max);
    END IF;
  END IF;

  -- The event's channel, created here if nobody has opened it yet (same one-per-event rule as
  -- _chat_ensure_for_user).
  SELECT c.id INTO v_conv FROM public.chat_conversations c
   WHERE c.kind = 'event' AND c.event_id = v_row.dest_event_id;
  IF v_conv IS NULL THEN
    INSERT INTO public.chat_conversations (kind, event_id) VALUES ('event', v_row.dest_event_id)
    ON CONFLICT (event_id) WHERE kind = 'event' DO NOTHING;
    SELECT c.id INTO v_conv FROM public.chat_conversations c
     WHERE c.kind = 'event' AND c.event_id = v_row.dest_event_id;
  END IF;
  IF v_conv IS NULL THEN
    RAISE EXCEPTION 'transcribe post: event channel unavailable' USING ERRCODE = '42501';
  END IF;
  -- Words reach only readers of this channel.
  v_since := public._chat_access_since(v_conv, v_speaker);
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'transcribe post: speaker cannot read the event channel' USING ERRCODE = '42501';
  END IF;

  -- ---- the place -----------------------------------------------------------------------------------------
  v_root := NULL;
  IF v_row.dest_kind = 'round' THEN
    IF v_row.dest_round_id IS NULL OR v_row.dest_table_no IS NULL THEN
      RAISE EXCEPTION 'transcribe post: round destination is gone' USING ERRCODE = '22023';
    END IF;
    SELECT er.* INTO v_round FROM public.event_rounds er WHERE er.id = v_row.dest_round_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'transcribe post: round is gone' USING ERRCODE = '22023';
    END IF;

    -- Exactly one thread per (round, table): two first lines arriving together queue on this lock, and the
    -- UNIQUE constraint is the second line of defence.
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_row.dest_round_id::text || ':' || v_row.dest_table_no::text, 0));
    SELECT t.* INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_row.dest_round_id AND t.table_no = v_row.dest_table_no;
    IF NOT FOUND THEN
      v_title := 'Round ' || v_round.round_no;      -- provisional: the member refresh below sets the real title
      -- The root post: no author, an explicit marker, the title as its body.
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, v_title, 'message', 'round_thread', clock_timestamp())
      RETURNING id INTO v_root_id;
      INSERT INTO public.chat_round_threads (event_id, round_id, table_no, conversation_id, root_message_id)
      VALUES (v_row.dest_event_id, v_row.dest_round_id, v_row.dest_table_no, v_conv, v_root_id)
      ON CONFLICT (round_id, table_no) DO NOTHING
      RETURNING * INTO v_thread;
      IF NOT FOUND THEN
        -- Lost a race the lock should have prevented: drop the stray root and use the winner's thread.
        DELETE FROM public.chat_messages WHERE id = v_root_id;
        SELECT t.* INTO v_thread FROM public.chat_round_threads t
         WHERE t.round_id = v_row.dest_round_id AND t.table_no = v_row.dest_table_no;
      ELSE
        UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
      END IF;
    END IF;
    IF v_thread.conversation_id <> v_conv THEN
      RAISE EXCEPTION 'transcribe post: thread belongs to another conversation' USING ERRCODE = '22023';
    END IF;

    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del
      FROM public.chat_messages m WHERE m.id = v_thread.root_message_id;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'transcribe post: round thread root is not available' USING ERRCODE = '42501';
    END IF;

    -- Refresh the member list (union: later-seated people join; nobody is removed) and keep the title in step
    -- with it, through the one retitle function. The title is updated WITHOUT touching edited_at.
    INSERT INTO public.chat_round_thread_members (thread_id, profile_id, display_name)
    SELECT v_thread.id, r.profile_id, r.display_name
      FROM public._transcribe_thread_roster_locked(v_row.dest_round_id, v_row.dest_table_no, v_thread.id, v_speaker) r
    ON CONFLICT (thread_id, profile_id) DO UPDATE SET display_name = EXCLUDED.display_name;
    PERFORM public._transcribe_retitle_thread(v_thread.id);

    -- A speaker whose access began AFTER the root was created cannot open the thread: their line goes to the
    -- channel top level instead. A readability rule only; the stored destination is not changed.
    IF v_since <= v_root_at THEN
      v_root := v_thread.root_message_id;
    END IF;
  ELSIF v_row.dest_kind = 'channel' THEN
    -- Not seated: the line goes into the channel's ONE outside-rounds thread. Same pattern as a round thread:
    -- a lock so two first lines queue, the conversation key as the second line of defence, and a stray root
    -- dropped if the race was lost anyway. The lock sits in the thread-lock slot of the order above (after the
    -- speaker lock, before the place lock). It cannot form a cycle: this poster holds only its speaker lock when
    -- it asks for it, every other poster asks for the same single lock in the same slot, and erasure never takes
    -- it (erase_chat_data_for takes erasing, speaker and round-thread locks only). The root has no names, so
    -- erasure has nothing to retitle in it; step 2 there already erases the person's own lines inside it.
    PERFORM pg_advisory_xact_lock(hashtextextended('p1592:outside:' || v_conv::text, 0));
    SELECT t.root_message_id INTO v_out_root FROM public.chat_outside_round_threads t WHERE t.conversation_id = v_conv;
    IF NOT FOUND THEN
      INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, system_kind, created_at)
      VALUES (v_conv, NULL, public._transcribe_outside_title(), 'message', 'outside_rounds', clock_timestamp())
      RETURNING id INTO v_root_id;
      INSERT INTO public.chat_outside_round_threads (conversation_id, root_message_id)
      VALUES (v_conv, v_root_id)
      ON CONFLICT (conversation_id) DO NOTHING
      RETURNING root_message_id INTO v_out_root;
      IF NOT FOUND THEN
        DELETE FROM public.chat_messages WHERE id = v_root_id;
        SELECT t.root_message_id INTO v_out_root FROM public.chat_outside_round_threads t WHERE t.conversation_id = v_conv;
      ELSE
        UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
      END IF;
    END IF;
    SELECT m.created_at, m.deleted_at INTO v_root_at, v_root_del
      FROM public.chat_messages m WHERE m.id = v_out_root;
    IF NOT FOUND OR v_root_del IS NOT NULL THEN
      RAISE EXCEPTION 'transcribe post: outside-rounds thread root is not available' USING ERRCODE = '42501';
    END IF;
    -- Same readability rule as a round thread: a speaker whose access began AFTER the root was created cannot
    -- open it, so their line goes to the channel top level.
    IF v_since <= v_root_at THEN
      v_root := v_out_root;
    END IF;
  END IF;

  -- ---- one message per stretch ---------------------------------------------------------------------------
  PERFORM public._transcribe_lock_place(v_conv, v_root);
  v_msg := NULL;

  -- The candidate is read FOR UPDATE, so an edit or delete that is in flight finishes first and is seen here.
  SELECT m.* INTO v_last FROM public.chat_messages m
   WHERE m.conversation_id = v_conv
     AND m.thread_root_id IS NOT DISTINCT FROM v_root
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND
     AND v_last.author_id = v_speaker
     AND v_last.is_transcription
     AND v_last.edited_at IS NULL
     AND v_last.deleted_at IS NULL
     AND v_last.body IS NOT NULL
     AND char_length(v_last.body) + 1 + char_length(v_line) <= c_max THEN
    SELECT max(t.spoken_at), count(*)::integer, COALESCE(bool_and(t.room_id = v_row.room_id), false)
      INTO v_prev_at, v_n_rows, v_same_room
      FROM public.transcribe_messages t
     WHERE t.chat_message_id = v_last.id AND t.id <> v_row.id;
    IF v_n_rows > 0 AND v_same_room
       AND v_row.spoken_at >= v_prev_at
       AND v_row.spoken_at - v_prev_at <= c_pause THEN
      -- append; edited_at is deliberately not part of this statement. Every guard is repeated in the WHERE,
      -- so a line is never marked posted into a message that was edited or deleted a moment ago; if no row
      -- matches, a new message is inserted instead.
      UPDATE public.chat_messages m SET body = m.body || ' ' || v_line
       WHERE m.id = v_last.id
         AND m.author_id = v_speaker
         AND m.is_transcription
         AND m.edited_at IS NULL
         AND m.deleted_at IS NULL
         AND m.body IS NOT NULL
         AND char_length(m.body) + 1 + char_length(v_line) <= c_max;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      IF v_cnt = 1 THEN
        v_msg := v_last.id;
      END IF;
    END IF;
  END IF;

  IF v_msg IS NULL THEN
    INSERT INTO public.chat_messages (conversation_id, author_id, body, kind, thread_root_id, is_transcription, created_at)
    VALUES (v_conv, v_speaker, v_line, 'message', v_root, true, clock_timestamp())
    RETURNING id INTO v_msg;
    IF v_root IS NULL THEN
      UPDATE public.chat_conversations c SET last_message_at = clock_timestamp() WHERE c.id = v_conv;
    END IF;
  END IF;

  UPDATE public.transcribe_messages t SET chat_message_id = v_msg, posted_at = now() WHERE t.id = v_row.id;
  RETURN v_msg;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_post_line(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. record_transcribe_slice: same signature and return, now also decides + posts
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_transcribe_slice(
  p_room_id uuid,
  p_member_id uuid,
  p_text text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_kind  text;
  v_event uuid;
  v_round uuid;
  v_table integer;
  v_lt    text;
BEGIN
  -- unchanged from P1236: the counter moves FIRST so a bad pairing aborts before anything is written
  UPDATE public.transcribe_room_members
     SET slice_count = slice_count + 1
   WHERE id = p_member_id
     AND room_id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member does not belong to this room' USING ERRCODE = '42501';
  END IF;

  -- P1592: decide the destination ONCE, now. A failure in the decision must not cost the line either.
  BEGIN
    SELECT d.o_kind, d.o_event_id, d.o_round_id, d.o_table_no
      INTO v_kind, v_event, v_round, v_table
      FROM public._transcribe_decide_destination(p_room_id, p_member_id) d;
  EXCEPTION WHEN OTHERS THEN
    v_kind := 'none'; v_event := NULL; v_round := NULL; v_table := NULL;
    RAISE WARNING 'record_transcribe_slice: destination decision failed (sqlstate %), line kept on the room page only', SQLSTATE;
  END;

  -- spoken_at is deliberately absent: it takes the column DEFAULT now() (P1236). The destination columns are
  -- written in the same INSERT, outside the posting step that may fail.
  INSERT INTO public.transcribe_messages
    (room_id, member_id, text, is_final, dest_kind, dest_event_id, dest_round_id, dest_table_no)
  VALUES (p_room_id, p_member_id, btrim(p_text), true, v_kind, v_event, v_round, v_table)
  RETURNING id INTO v_id;

  -- Posting never costs the room a line: a failure rolls back only the posting, stamps the row, and the
  -- sweep tick retries it. Logged once, on the NULL -> set transition (never the transcript text).
  -- A lock wait inside posting must FAIL (lock_not_available, which WHEN OTHERS catches) rather than run into
  -- the request's statement_timeout: query_canceled is NOT caught by WHEN OTHERS, and it would roll back the
  -- live row and the counter with it. 2 s is well inside the 8 s statement budget.
  v_lt := current_setting('lock_timeout');
  PERFORM set_config('lock_timeout', '2s', true);
  BEGIN
    PERFORM public._transcribe_post_line(v_id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.transcribe_messages t SET post_failed_at = now()
     WHERE t.id = v_id AND t.post_failed_at IS NULL;
    IF FOUND THEN
      RAISE WARNING 'transcribe post failed for row % (sqlstate %), kept for retry', v_id, SQLSTATE;
    END IF;
  END;
  PERFORM set_config('lock_timeout', v_lt, true);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) IS
  'P1236 Decision 6 + P1592: writes one de-duplicated transcript row, advances the member''s slice counter, '
  'stores the line''s destination on the row and posts it into the event channel / round thread, all in one '
  'transaction. A posting failure never loses the row. service_role only. spoken_at is never a parameter.';

REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_transcribe_slice(uuid, uuid, text) TO service_role;

-- ============================================================================
-- 7. Retry tick (called from the existing sweep) and the destination label
-- ============================================================================
-- One retry, in its own subtransaction, with the same bounded lock wait as the live path. Failure is stamped
-- once and logged once, never per retry.
CREATE OR REPLACE FUNCTION public._transcribe_retry_one(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lt text := current_setting('lock_timeout');
BEGIN
  PERFORM set_config('lock_timeout', '2s', true);
  BEGIN
    PERFORM public._transcribe_post_line(p_id);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.transcribe_messages t SET post_failed_at = now()
     WHERE t.id = p_id AND t.post_failed_at IS NULL;
    IF FOUND THEN
      RAISE WARNING 'transcribe post failed for row % (sqlstate %), kept for retry', p_id, SQLSTATE;
    END IF;
  END;
  PERFORM set_config('lock_timeout', v_lt, true);
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_retry_one(uuid) FROM PUBLIC, anon, authenticated;

-- A small batch in the caller's transaction: for tests and manual use (a function cannot COMMIT). The
-- scheduled path is the procedure below, which commits per row.
CREATE OR REPLACE FUNCTION public.transcribe_post_retry_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT COALESCE((SELECT p.enabled FROM public.transcribe_channel_posting p WHERE p.singleton), false) THEN
    RETURN;
  END IF;
  FOR v_id IN
    SELECT t.id FROM public.transcribe_messages t
     WHERE t.posted_at IS NULL
       AND t.dest_kind IN ('channel', 'round')
       AND t.spoken_at > now() - interval '24 hours'
     ORDER BY t.spoken_at, t.id
     LIMIT 25
  LOOP
    PERFORM public._transcribe_retry_one(v_id);
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.transcribe_post_retry_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_post_retry_tick() TO service_role;

-- The scheduled retry (its own pg_cron job, NOT part of the room sweep): up to 200 unposted rows, oldest first,
-- one transaction PER ROW. Locks taken for one row are released at its COMMIT, so the batch never holds every
-- thread / place / conversation lock until the end and cannot deadlock a live slice or delay room ending.
-- SECURITY INVOKER and no SET clause on purpose: a SECURITY DEFINER procedure, or one with a SET clause, is
-- run atomically and COMMIT inside it fails. It is callable only by the role that runs cron.
CREATE OR REPLACE PROCEDURE public.transcribe_post_retry_run()
LANGUAGE plpgsql
AS $$
DECLARE
  v_ids uuid[];
  v_id  uuid;
BEGIN
  IF NOT COALESCE((SELECT p.enabled FROM public.transcribe_channel_posting p WHERE p.singleton), false) THEN
    RETURN;
  END IF;
  -- ids are gathered first: a cursor loop cannot COMMIT
  SELECT COALESCE(array_agg(x.id), '{}') INTO v_ids FROM (
    SELECT t.id FROM public.transcribe_messages t
     WHERE t.posted_at IS NULL
       AND t.dest_kind IN ('channel', 'round')
       AND t.spoken_at > now() - interval '24 hours'
     ORDER BY t.spoken_at, t.id
     LIMIT 200) x;
  COMMIT;
  FOREACH v_id IN ARRAY v_ids LOOP
    PERFORM public._transcribe_retry_one(v_id);
    COMMIT;
  END LOOP;
END;
$$;
REVOKE ALL ON PROCEDURE public.transcribe_post_retry_run() FROM PUBLIC, anon, authenticated;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('transcribe_post_retry')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transcribe_post_retry');
    PERFORM cron.schedule('transcribe_post_retry', '* * * * *', $job$ CALL public.transcribe_post_retry_run(); $job$);
  ELSE
    RAISE WARNING 'P1592: pg_cron not installed, transcribe_post_retry is NOT scheduled and unposted lines will not be retried';
  END IF;
END
$cron$;

-- Where is this line (or will it be, on retry)? The bar shows this, so it follows what actually happened:
-- a posted line reports the place it landed in (a line posted at the channel top level, because the speaker
-- cannot open the thread, reports the event's title); an unposted one reports its STORED destination.
CREATE OR REPLACE FUNCTION public.transcribe_message_destination(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row     public.transcribe_messages;
  v_msg     public.chat_messages;
  v_kind    text;
  v_label   text;
  v_round   public.event_rounds;
  v_thread  public.chat_round_threads;
  v_speaker uuid;
  v_root_kind text;
  v_late    boolean;
BEGIN
  SELECT t.* INTO v_row FROM public.transcribe_messages t WHERE t.id = p_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_kind := COALESCE(v_row.dest_kind, 'none');
  IF v_kind = 'none' THEN
    RETURN jsonb_build_object('kind', 'none', 'label', NULL::text);
  END IF;

  IF v_row.posted_at IS NOT NULL AND v_row.chat_message_id IS NOT NULL THEN
    SELECT m.* INTO v_msg FROM public.chat_messages m WHERE m.id = v_row.chat_message_id;
    IF FOUND THEN
      IF v_msg.thread_root_id IS NOT NULL THEN
        SELECT r.body, r.system_kind INTO v_label, v_root_kind FROM public.chat_messages r WHERE r.id = v_msg.thread_root_id;
        -- the outside-rounds thread is the channel's, not a round: kind 'channel', labelled by its own title
        RETURN jsonb_build_object('kind', CASE WHEN v_root_kind = 'outside_rounds' THEN 'channel' ELSE 'round' END, 'label', v_label);
      END IF;
      SELECT e.title INTO v_label FROM public.events e WHERE e.id = v_row.dest_event_id;
      RETURN jsonb_build_object('kind', 'channel', 'label', v_label);
    END IF;
  END IF;

  IF v_kind = 'round' AND v_row.dest_round_id IS NOT NULL THEN
    SELECT t.* INTO v_thread FROM public.chat_round_threads t
     WHERE t.round_id = v_row.dest_round_id AND t.table_no = v_row.dest_table_no;
    IF FOUND THEN
      SELECT r.body, public._chat_access_since(v_thread.conversation_id, m.profile_id) > r.created_at
        INTO v_label, v_late
        FROM public.chat_messages r
        LEFT JOIN public.transcribe_room_members m ON m.id = v_row.member_id
       WHERE r.id = v_thread.root_message_id;
      -- the poster's readability rule: a speaker whose access began after the root cannot open the thread, so the
      -- line will land on the channel top level, labelled by the event title
      IF COALESCE(v_late, false) THEN
        SELECT e.title INTO v_label FROM public.events e WHERE e.id = v_thread.event_id;
        RETURN jsonb_build_object('kind', 'channel', 'label', v_label);
      END IF;
    ELSE
      SELECT er.* INTO v_round FROM public.event_rounds er WHERE er.id = v_row.dest_round_id;
      SELECT m.profile_id INTO v_speaker FROM public.transcribe_room_members m WHERE m.id = v_row.member_id;
      SELECT public._transcribe_round_title(v_round.round_no,
               COALESCE(array_agg(r.display_name ORDER BY lower(r.display_name), r.profile_id), '{}'))
        INTO v_label
        FROM public._transcribe_thread_roster(v_row.dest_round_id, v_row.dest_table_no, NULL, v_speaker) r;
    END IF;
    RETURN jsonb_build_object('kind', 'round', 'label', v_label);
  END IF;

  -- not posted yet and not seated: the line will go to the outside-rounds thread (the label is its title, the way
  -- a round line's label is its thread's title; the bar has no room for the event title as well). The poster's
  -- readability rule applies here too: a speaker whose access began after that thread's root gets the channel.
  SELECT m.profile_id INTO v_speaker FROM public.transcribe_room_members m WHERE m.id = v_row.member_id;
  IF EXISTS (SELECT 1
               FROM public.chat_conversations c
               JOIN public.chat_outside_round_threads o ON o.conversation_id = c.id
               JOIN public.chat_messages r ON r.id = o.root_message_id
              WHERE c.kind = 'event' AND c.event_id = v_row.dest_event_id
                AND public._chat_access_since(c.id, v_speaker) > r.created_at) THEN
    SELECT e.title INTO v_label FROM public.events e WHERE e.id = v_row.dest_event_id;
    RETURN jsonb_build_object('kind', 'channel', 'label', v_label);
  END IF;
  RETURN jsonb_build_object('kind', 'channel', 'label', public._transcribe_outside_title());
END;
$$;
REVOKE ALL ON FUNCTION public.transcribe_message_destination(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transcribe_message_destination(uuid) TO service_role;

-- ============================================================================
-- 8. The quiet swap (service role only): bodies only, never edited_at, never insert/delete
-- ============================================================================
CREATE OR REPLACE FUNCTION public.apply_transcription_swap(p_room_id uuid, p_member_id uuid, p_updates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid;
  v_item    jsonb;
  v_id      uuid;
  v_body    text;
  v_conv    uuid;
  v_root    uuid;
  v_cnt     integer;
  v_n       integer := 0;
  v_has_exp boolean;
  v_exp     text;
BEGIN
  SELECT m.profile_id INTO v_profile FROM public.transcribe_room_members m
   WHERE m.id = p_member_id AND m.room_id = p_room_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member does not belong to this room' USING ERRCODE = '42501';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'array' THEN
    RAISE EXCEPTION 'updates must be a json array' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_updates) e LOOP
    BEGIN
      v_id   := (v_item ->> 'chat_message_id')::uuid;
      v_body := btrim(v_item ->> 'body');
      v_has_exp := (v_item ? 'expected_body') AND jsonb_typeof(v_item -> 'expected_body') = 'string';
      v_exp := v_item ->> 'expected_body';
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;
    -- fails toward the live text: anything empty or over the limit is skipped, never truncated or blanked
    CONTINUE WHEN v_id IS NULL OR v_body IS NULL OR v_body = '' OR char_length(v_body) > 4000;

    SELECT m.conversation_id, m.thread_root_id INTO v_conv, v_root FROM public.chat_messages m WHERE m.id = v_id;
    CONTINUE WHEN NOT FOUND;
    PERFORM public._transcribe_lock_place(v_conv, v_root);

    UPDATE public.chat_messages m SET body = v_body
     WHERE m.id = v_id
       AND m.is_transcription
       AND m.author_id = v_profile
       AND m.edited_at IS NULL
       AND m.deleted_at IS NULL
       AND m.body IS DISTINCT FROM v_body
       -- optional compare-and-swap: the worker sends the live body it aligned against, so a line appended
       -- after its read is never overwritten
       AND (NOT v_has_exp OR m.body = v_exp)
       AND EXISTS (SELECT 1 FROM public.transcribe_messages t
                    WHERE t.room_id = p_room_id AND t.member_id = p_member_id AND t.chat_message_id = m.id);
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    v_n := v_n + v_cnt;
  END LOOP;
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_transcription_swap(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transcription_swap(uuid, uuid, jsonb) TO service_role;

-- ============================================================================
-- 9. "My rounds"
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_my_round_threads(p_conversation uuid)
RETURNS TABLE (root_message_id uuid, round_no integer, title text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid   uuid := auth.uid();
  v_since timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(p_conversation, v_uid);
  IF v_since IS NULL THEN
    RETURN;                                    -- cannot read the conversation: nothing, not an error
  END IF;
  RETURN QUERY
  SELECT t.root_message_id, r.round_no, m.body, m.created_at
    FROM public.chat_round_threads t
    JOIN public.event_rounds r ON r.id = t.round_id
    JOIN public.chat_messages m ON m.id = t.root_message_id
   WHERE t.conversation_id = p_conversation
     AND m.deleted_at IS NULL
     AND m.created_at >= v_since
     AND EXISTS (SELECT 1 FROM public.chat_round_thread_members tm
                  WHERE tm.thread_id = t.id AND tm.profile_id = v_uid)
   ORDER BY r.round_no DESC, t.table_no;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_round_threads(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_round_threads(uuid) TO authenticated;

-- ============================================================================
-- 9b. Later seating: a person seated at a table that already has a thread joins it (and its title) without
--     having to speak. host_set_round_seats upserts seats, so this fires per inserted seat (and per moved one,
--     below); it is idempotent. It must never break or stall the host's seating:
--       * a person whose erasure is in flight is skipped without waiting (the erasing marker, see the roster
--         above), and a seat that was skipped names nobody;
--       * a thread lock is waited for at most 2 s, and after one timeout every later row only tries the lock, so a
--         stuck lock costs a multi-row seating one 2 s wait, never one per row (statement_timeout is 8 s). This is
--         not a hard total: several rows can each wait just under 2 s for locks that ARE released (one per
--         concurrent erasure at this event; a poster holds a thread lock for milliseconds), so the worst case
--         needs several erasures at one event at once.
--     LOCK ORDER. Seating waits only on thread locks; a poster waits on its speaker lock before any thread lock,
--     and erasure on its marker and speaker lock before any thread lock. Poster: speaker, thread, place, message rows. Erasure:
--     erasing marker (exclusive), speaker, thread locks in (round, table) order, message rows. Host seating: thread
--     locks in table order (host_set_round_seats reads its rows ORDER BY table_no; AFTER ROW triggers fire in
--     that order). The marker is only ever TRIED by posters and the trigger, so nobody waits for it while holding
--     a thread lock; the one transaction that waits for it (an erasure) holds no thread lock yet. The host takes
--     no speaker lock. That leaves thread locks taken in table order or one at a time: no cycle.
--     host_start_round needs no change: its seats belong to a round no other transaction can see until it
--     commits, so no thread lock on that round can be contended, and no thread exists to join.
-- ============================================================================
CREATE OR REPLACE FUNCTION public._transcribe_seat_joins_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_th      public.chat_round_threads;
  v_profile uuid;
  v_name    text;
  v_lt      text;
  v_got     boolean;
  v_key     bigint := hashtextextended('p1592:thread:' || NEW.round_id::text || ':' || NEW.table_no::text, 0);
BEGIN
  SELECT rm.profile_id INTO v_profile FROM public.event_room_members rm WHERE rm.id = NEW.room_member_id;
  IF v_profile IS NULL THEN
    RETURN NEW;                                   -- no account (or already erased)
  END IF;
  -- Erasure in flight: leave this person out, never wait. A win is held to commit, so an erasure that starts
  -- later waits for this transaction and then finds what it writes.
  IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('p1592:erasing:' || v_profile::text, 0)) THEN
    RETURN NEW;
  END IF;
  -- Read the member row AFTER the shared lock (a new statement, a new snapshot): an erasure that committed
  -- before we got the lock has tombstoned it, and the person is not named.
  SELECT rm.profile_id, rm.display_name INTO v_profile, v_name
    FROM public.event_room_members rm WHERE rm.id = NEW.room_member_id;
  IF v_profile IS NULL OR btrim(COALESCE(v_name, '')) = '' THEN
    RETURN NEW;                                   -- same rule as the roster: named members with an account
  END IF;

  -- Lock BEFORE looking for the thread. A first line creating this table's thread holds this lock and reads
  -- the seating as it was before this (uncommitted) seat; an unlocked lookup here would miss that thread too,
  -- and the seated person would be in neither. Waiting means the lookup sees the thread once it commits.
  v_lt := current_setting('lock_timeout');
  PERFORM set_config('lock_timeout', '2s', true);
  v_got := false;
  BEGIN
    IF current_setting('p1592.seat_lock_gave_up', true) = 'on' THEN
      v_got := pg_try_advisory_xact_lock(v_key);   -- already timed out once in this transaction: do not wait again
    ELSE
      PERFORM pg_advisory_xact_lock(v_key);
      v_got := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- set_config here runs after the failed block was rolled back, so it sticks (is_local = true)
    PERFORM set_config('p1592.seat_lock_gave_up', 'on', true);
    RAISE WARNING '_transcribe_seat_joins_thread: thread lock not won (sqlstate %), join skipped', SQLSTATE;
  END;
  IF NOT v_got THEN
    PERFORM set_config('lock_timeout', v_lt, true);
    RETURN NEW;                                   -- a skipped join names nobody
  END IF;

  -- The join below (member upsert, root retitle) still runs under the 2 s lock_timeout; restored on every exit.
  BEGIN
    SELECT t.* INTO v_th FROM public.chat_round_threads t
     WHERE t.round_id = NEW.round_id AND t.table_no = NEW.table_no;
    IF FOUND THEN
      INSERT INTO public.chat_round_thread_members (thread_id, profile_id, display_name)
      VALUES (v_th.id, v_profile, v_name)
      ON CONFLICT (thread_id, profile_id) DO UPDATE SET display_name = EXCLUDED.display_name;
      PERFORM public._transcribe_retitle_thread(v_th.id);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_transcribe_seat_joins_thread: skipped (sqlstate %)', SQLSTATE;
  END;
  PERFORM set_config('lock_timeout', v_lt, true);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._transcribe_seat_joins_thread() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transcribe_seat_joins_thread ON public.event_round_seats;
CREATE TRIGGER transcribe_seat_joins_thread AFTER INSERT ON public.event_round_seats
  FOR EACH ROW EXECUTE FUNCTION public._transcribe_seat_joins_thread();

-- host_set_round_seats is an upsert, so moving an already-seated person to another table is an UPDATE of
-- table_no, not an INSERT. Same function: the person joins the NEW table's thread if it exists (its title
-- follows), and stays a member of the old table's thread (seating has no history; they did sit there).
-- table_no is NOT NULL, so there is no "unseated" update to handle. WHEN cannot reference OLD on an INSERT
-- trigger, hence a second trigger rather than one with OR. An upsert that rewrites the same table fires nothing.
DROP TRIGGER IF EXISTS transcribe_seat_moves_thread ON public.event_round_seats;
CREATE TRIGGER transcribe_seat_moves_thread AFTER UPDATE OF table_no ON public.event_round_seats
  FOR EACH ROW WHEN (OLD.table_no IS DISTINCT FROM NEW.table_no)
  EXECUTE FUNCTION public._transcribe_seat_joins_thread();

-- host_set_round_seats: body identical to 20261002193000_p1337_clear_stale_table_topics.sql except `ORDER BY x.t,
-- x.m` on the seat upsert. The seating trigger above takes one thread lock per seat row and AFTER ROW triggers
-- fire in the order the rows were processed, which is the order of the SELECT (measured on TEST with mixed
-- inserts and updates). Ordered by table_no the host takes thread locks in the same order as erasure, so the
-- two cannot deadlock. No speaker lock is taken here (see the lock order above the trigger).
-- Signature, security, search_path and grants unchanged.
CREATE OR REPLACE FUNCTION public.host_set_round_seats(p_round_id uuid, p_seats jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event uuid;
  v_host uuid;
  v_round_no int;
  v_last int;
BEGIN
  SELECT r.event_id, r.round_no, e.host_id INTO v_event, v_round_no, v_host
    FROM public.event_rounds r JOIN public.events e ON e.id = r.event_id
   WHERE r.id = p_round_id;
  IF v_host IS NULL OR v_host IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'only the host can change seats' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('p1337_round:' || v_event::text, 0));

  SELECT max(r.round_no) INTO v_last FROM public.event_rounds r WHERE r.event_id = v_event;
  IF v_round_no IS DISTINCT FROM v_last THEN
    RAISE EXCEPTION 'only the current round can be changed' USING ERRCODE = '22023';
  END IF;

  PERFORM public.p1337_assert_valid_seats(v_event, p_seats);

  -- A table whose people changed loses its marked statement: nobody now at that table chose
  -- it, and the mark is what links a recording to a statement. Compared BEFORE the seats move.
  DELETE FROM public.event_round_tables tt
   WHERE tt.round_id = p_round_id
     AND (SELECT array_agg(s.room_member_id ORDER BY s.room_member_id)
            FROM public.event_round_seats s
           WHERE s.round_id = p_round_id AND s.table_no = tt.table_no)
         IS DISTINCT FROM
         (SELECT array_agg(x.m ORDER BY x.m)
            FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
           WHERE x.t = tt.table_no);

  DELETE FROM public.event_round_seats s
   WHERE s.round_id = p_round_id
     AND s.room_member_id NOT IN (SELECT x.m FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text));

  INSERT INTO public.event_round_seats AS s (round_id, room_member_id, table_no, role)
  SELECT p_round_id, x.m, x.t, x.r FROM jsonb_to_recordset(p_seats) AS x(m uuid, t int, r text)
   ORDER BY x.t, x.m
  ON CONFLICT (round_id, room_member_id) DO UPDATE
    SET role = EXCLUDED.role,
        confirmed_at = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.confirmed_at END,
        position_moved = CASE WHEN s.table_no = EXCLUDED.table_no THEN s.position_moved END,
        table_no = EXCLUDED.table_no;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.host_set_round_seats(uuid, jsonb) TO authenticated;

-- ============================================================================
-- 10. Forward, clarify and the chat list: the two marks travel
-- ============================================================================
CREATE OR REPLACE FUNCTION public.forward_chat_message(
  p_source              uuid,
  p_target_conversation uuid,
  p_note                text DEFAULT NULL,
  p_client_id           uuid DEFAULT NULL
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_author    text;
  v_note      text;
  v_snapshot  jsonb;
  v_orig_id   uuid;
  v_since     timestamptz;
  v_row       public.chat_messages;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_assert_can_post(p_target_conversation, v_uid);
  v_since := public._chat_access_since(p_target_conversation, v_uid);

  -- Idempotent retry (see send_chat_message): same author + client id returns the earlier forward.
  -- This runs BEFORE the source checks on purpose: a retry whose source was deleted (or erased) in
  -- the meantime must hand back the forward that was already stored, not "message not available".
  -- Permission to post in the target was just checked, and the stored row must still be visible.
  IF p_client_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF FOUND THEN
      IF v_row.conversation_id <> p_target_conversation THEN
        RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
      END IF;
      IF v_row.created_at < v_since THEN
        RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
      END IF;
      RETURN v_row;
    END IF;
  END IF;

  -- The forwarder must be able to READ the source right now. FOR SHARE takes a row lock that
  -- conflicts with erase_chat_data_for's UPDATE of the same row: an in-flight erase finishes first
  -- (and the deleted_at test below then refuses), or this transaction commits first and the erase
  -- that was waiting scrubs the copy we are about to make.
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;

  IF v_src.kind = 'message' THEN
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- D5: a forward reveals nothing about the source chat. The snapshot is built from an explicit
    -- allowlist (author_name, body, created_at, is_transcription, system_kind), never by copying whatever a source snapshot holds.
    -- P1592: plus the two marks the reader needs to render the copy as it was (a transcription keeps its
    -- label; a system post keeps showing its title alone, never "Deleted user"). A copy of a round-thread
    -- root carries "Round {n}" WITHOUT the names: erasure cannot find a name inside a copied title.
    v_snapshot := jsonb_build_object(
      'author_name', v_author,
      'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,
      'created_at', v_src.created_at,
      'is_transcription', v_src.is_transcription,
      'system_kind', v_src.system_kind);
    v_orig_id := v_src.author_id;
  ELSE
    -- forwarding a forward / clarify keeps pointing at the original author; the source chat's
    -- title, kind, refs and any thread are NOT carried (allowlist again)
    v_snapshot := public._chat_forward_snapshot(v_src.forward_snapshot);
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, client_id, created_at)
  VALUES
    (p_target_conversation, v_uid, v_note, 'forward', v_snapshot, v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, p_client_id, clock_timestamp())
  ON CONFLICT (author_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.chat_messages m WHERE m.author_id = v_uid AND m.client_id = p_client_id;
    IF v_row.conversation_id <> p_target_conversation THEN
      RAISE EXCEPTION 'chat: client id already used' USING ERRCODE = '22023';
    END IF;
    IF v_row.created_at < v_since THEN
      RAISE EXCEPTION 'chat: conversation not available' USING ERRCODE = '42501';
    END IF;
    RETURN v_row;
  END IF;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = p_target_conversation;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.forward_chat_message(uuid, uuid, text, uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.clarify_chat_message(p_source uuid, p_note text DEFAULT NULL)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_src       public.chat_messages;
  v_since     timestamptz;
  v_src_kind  text;
  v_author    text;
  v_root      uuid;
  v_thread    jsonb;
  v_base      jsonb;
  v_orig_id   uuid;
  v_mirror    uuid;
  v_title     text;
  v_title_ref text;
  v_src_conv  public.chat_conversations;
  v_row       public.chat_messages;
  v_note      text;
  v_total     integer;
  v_outside   boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  -- The clarifier's own words on top of the copy: ONE message (quote + note), like a forward's note.
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'chat: message too long' USING ERRCODE = '22023';
  END IF;
  -- FOR SHARE: see forward_chat_message (serialises with an in-flight erase).
  SELECT m.* INTO v_src FROM public.chat_messages m
   WHERE m.id = p_source
     AND m.created_at >= COALESCE(public._chat_access_since(m.conversation_id, v_uid), 'infinity'::timestamptz)
     FOR SHARE;
  IF NOT FOUND OR v_src.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'chat: message not available' USING ERRCODE = '42501';
  END IF;
  v_since := public._chat_access_since(v_src.conversation_id, v_uid);
  v_mirror := public._chat_ensure_mirror(v_uid);

  v_root := COALESCE(v_src.thread_root_id, v_src.id);
  -- P1592: the Outside rounds thread holds an event's worth of many speakers' lines. A copy of a line in it (or of
  -- its root) carries that message alone, never the thread: the same as a top-level unseated line before this change.
  SELECT (r.system_kind = 'outside_rounds') INTO v_outside FROM public.chat_messages r WHERE r.id = v_root;
  v_outside := COALESCE(v_outside, false);
  -- P1546: a mirror thread can now hold mirror agent answers and private asks. Neither is ever copied (as
  -- _mirror_refuse_agent_copy refuses a direct copy): a copied answer would keep text derived from other
  -- people's words where erasure's derived_refs cannot find it.
  -- Lock the thread rows first (a separate statement, so the aggregate below reads a snapshot taken
  -- AFTER any erase that was holding them has committed).
  PERFORM 1 FROM public.chat_messages x
   WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.created_at >= v_since
   ORDER BY x.created_at, x.id
   FOR SHARE;
  -- P1547: the NEWEST 100 entries (stored oldest first), and how many there were, so the mirror can say
  -- "showing the last N of M replies" truthfully.
  SELECT count(*) INTO v_total FROM public.chat_messages x
   WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
     AND x.id <> v_src.id
     AND x.conversation_id = v_src.conversation_id
     AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
     AND x.deleted_at IS NULL
     AND x.created_at >= v_since;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'author_ref', public._chat_author_ref(t.author_id),
           'author_name', COALESCE(tp.name, 'Deleted user'),
           -- P1592: a copied round-thread root carries "Round {n}" without the names
           'body', CASE WHEN t.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(t.id) ELSE t.body END,
           'created_at', t.created_at,
           'is_transcription', t.is_transcription,
           'system_kind', t.system_kind) ORDER BY t.created_at, t.id), '[]'::jsonb)
    INTO v_thread
    FROM (SELECT x.* FROM public.chat_messages x
           WHERE NOT v_outside AND (x.id = v_root OR x.thread_root_id = v_root)
             AND x.id <> v_src.id
             AND x.conversation_id = v_src.conversation_id
             AND x.kind <> 'agent' AND x.context_conversation_id IS NULL
             AND x.deleted_at IS NULL
             AND x.created_at >= v_since
           ORDER BY x.created_at DESC, x.id DESC
           LIMIT 100) t
    LEFT JOIN public.profiles tp ON tp.id = t.author_id;

  IF v_src.kind = 'message' THEN
    SELECT * INTO v_src_conv FROM public.chat_conversations c WHERE c.id = v_src.conversation_id;
    SELECT COALESCE(p.name, 'Deleted user') INTO v_author
      FROM (SELECT 1) one LEFT JOIN public.profiles p ON p.id = v_src.author_id;
    -- "Clarified from <author> in <title>": the title as the CLARIFIER sees the chat.
    IF v_src_conv.kind = 'dm' THEN
      SELECT COALESCE(p.name, 'Deleted user'),
             public._chat_author_ref(CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END)
        INTO v_title, v_title_ref
        FROM (SELECT 1) one
        LEFT JOIN public.profiles p
               ON p.id = CASE WHEN v_src_conv.dm_user_a = v_uid THEN v_src_conv.dm_user_b ELSE v_src_conv.dm_user_a END;
    ELSIF v_src_conv.kind = 'group' THEN
      SELECT o.name || ' · General' INTO v_title FROM public.organization o WHERE o.id = v_src_conv.org_id;
    ELSIF v_src_conv.kind = 'event' THEN
      SELECT e.title INTO v_title FROM public.events e WHERE e.id = v_src_conv.event_id;
    ELSE
      v_title := COALESCE(v_src_conv.title, 'Mirror');
    END IF;
    v_base := jsonb_build_object(
      'author_name', v_author,
      'body', CASE WHEN v_src.system_kind = 'round_thread' THEN public._transcribe_bare_root_title(v_src.id) ELSE v_src.body END,
      'created_at', v_src.created_at,
      'is_transcription', v_src.is_transcription,
      'system_kind', v_src.system_kind,
      'conversation_kind', v_src_conv.kind,
      'conversation_title', v_title);
    -- the other person's opaque ref, so erasing THEM can blank their name out of this title
    IF v_title_ref IS NOT NULL THEN
      v_base := v_base || jsonb_build_object('conversation_title_ref', v_title_ref);
    END IF;
    v_orig_id := v_src.author_id;
  ELSE
    v_base := v_src.forward_snapshot - 'thread';
    v_orig_id := v_src.forward_author_id;
  END IF;

  INSERT INTO public.chat_messages
    (conversation_id, author_id, body, kind, forward_snapshot, forward_author_id,
     forwarded_from_message_id, attachment_kind, attachment_id, created_at)
  VALUES
    (v_mirror, v_uid, v_note, 'clarify', v_base || jsonb_build_object('thread', v_thread, 'thread_total', v_total), v_orig_id,
     v_src.id, v_src.attachment_kind, v_src.attachment_id, clock_timestamp())
  RETURNING * INTO v_row;

  UPDATE public.chat_conversations c SET last_message_at = v_row.created_at WHERE c.id = v_mirror;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.clarify_chat_message(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clarify_chat_message(uuid, text) TO authenticated;


-- Wiring note: the DROP is needed because RETURNS TABLE gains two trailing columns; the grant below is the
-- same as before. The body is the P1576 merge of get_my_chats, unchanged except for lm.system_kind and
-- lm.is_transcription.
DROP FUNCTION IF EXISTS public.get_my_chats();
CREATE OR REPLACE FUNCTION public.get_my_chats()
RETURNS TABLE (
  conversation_id      uuid,
  kind                 text,
  title                text,
  other_id             uuid,
  other_name           text,
  other_slug           text,
  other_avatar_url     text,
  other_avatar_color   text,
  other_deleted        boolean,
  org_id               uuid,
  org_slug             text,
  org_name             text,
  event_id             uuid,
  event_slug           text,
  event_title          text,
  event_datetime       timestamptz,
  owner_first_name     text,
  last_message_id      uuid,
  last_author_id       uuid,
  last_author_name     text,
  last_body            text,
  last_message_kind    text,
  last_message_deleted boolean,
  last_message_at      timestamptz,
  unread_count         integer,
  manual_unread        boolean,
  archived             boolean,
  last_read_at         timestamptz,
  is_partner           boolean,
  members_since        timestamptz,
  can_send             boolean,
  blocked_by_me        boolean,
  last_system_kind     text,
  last_is_transcription boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'chat: not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public._chat_ensure_for_user(v_uid);

  RETURN QUERY
  SELECT
    c.id,
    c.kind,
    c.title,
    op.id,
    op.name,
    op.slug,
    op.avatar_url,
    op.avatar_color,
    (c.kind = 'dm' AND op.id IS NULL),
    org.id,
    org.slug,
    org.name,
    ev.id,
    ev.slug,
    ev.title,
    ev.datetime,
    split_part(ow.name, ' ', 1),
    lm.id,
    lm.author_id,
    lm.author_name,
    -- A clarify shows the clarifier's note when there is one, else the copied words from the snapshot;
    -- delete and erase clear both.
    CASE WHEN lm.deleted_at IS NOT NULL THEN 'Message deleted'
         WHEN lm.audio_duration_ms IS NOT NULL THEN 'Voice message'
         WHEN lm.kind = 'clarify' THEN COALESCE(lm.body, lm.forward_snapshot ->> 'body')
         ELSE lm.body END,
    lm.kind,
    (lm.deleted_at IS NOT NULL),
    lm.created_at,
    -- P1545: an EMPTY channel the person has never opened counts unread 1 while it is in their Inbox
    -- (a group always; an event from 24 h before it starts until the grace window after). Opening it
    -- (mark_chat_read) sets last_read_at, which ends it. Real unread messages always win.
    CASE
      WHEN COALESCE(un.n, 0) > 0 THEN un.n
      WHEN lm.id IS NULL AND st.last_read_at IS NULL
           AND (c.kind = 'group'
                OR (c.kind = 'event' AND ev.datetime IS NOT NULL
                    AND now() >= ev.datetime - interval '24 hours'
                    AND now() <= ev.datetime + public.event_grace_interval()))
        THEN 1
      ELSE 0
    END,
    COALESCE(st.manual_unread, false),
    COALESCE(st.archived, false),
    st.last_read_at,
    (c.kind = 'dm' AND op.id IS NOT NULL AND public._chat_shared_reason(v_uid, op.id) = 'partner'),
    NULLIF(mine.since, '-infinity'::timestamptz),
    -- false for a 1:1 once either side has blocked the other (or the other account is gone); the
    -- blocked side only learns "cannot send", never who blocked whom
    (c.kind <> 'dm' OR (op.id IS NOT NULL AND NOT public._chat_blocked_either(v_uid, op.id))),
    (c.kind = 'dm' AND op.id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.chat_blocks b WHERE b.blocker_id = v_uid AND b.blocked_id = op.id)),
    -- P1592: lets the list render a round thread's root post as its title alone and mark a transcription
    lm.system_kind,
    lm.is_transcription
  FROM public._chat_my_conversations(v_uid) mine
  JOIN public.chat_conversations c ON c.id = mine.id
  LEFT JOIN public.chat_member_state st ON st.conversation_id = c.id AND st.profile_id = v_uid
  LEFT JOIN public.profiles op
         ON c.kind = 'dm'
        AND op.id = CASE WHEN c.dm_user_a = v_uid THEN c.dm_user_b ELSE c.dm_user_a END
  LEFT JOIN public.events ev ON ev.id = c.event_id
  LEFT JOIN public.organization org ON org.id = COALESCE(c.org_id, ev.org_id)
  LEFT JOIN public.profiles ow ON ow.id = c.owner_id
  LEFT JOIN LATERAL (
    SELECT m.id, m.author_id, ap.name AS author_name, m.body, m.kind, m.forward_snapshot, m.deleted_at, m.created_at,
           m.audio_duration_ms, m.system_kind, m.is_transcription
      FROM public.chat_messages m
      LEFT JOIN public.profiles ap ON ap.id = m.author_id
     WHERE m.conversation_id = c.id
       AND m.thread_root_id IS NULL
       AND m.created_at >= mine.since
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*)::integer AS n
      FROM public.chat_messages m
     WHERE m.conversation_id = c.id
       AND m.thread_root_id IS NULL
       AND m.deleted_at IS NULL
       AND m.author_id IS DISTINCT FROM v_uid
       AND m.created_at >= mine.since
       AND m.created_at > COALESCE(st.last_read_at, '-infinity'::timestamptz)
  ) un ON true
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC, c.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_chats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chats() TO authenticated;

-- ============================================================================
-- 11. Erasure: no round-thread title keeps an erased person's name
-- ============================================================================
-- Hooked into erase_chat_data_for (not a trigger): erase_my_account calls it before it tombstones the room
-- members and before the profile row is deleted, so the member and seat rows still name the person when it
-- runs, and the locks it takes are held through the profile delete. A trigger on the member table would fire during the cascade, after the rows are gone, and
-- could not tell which titles to rebuild. Body below is the latest definition
-- (20261020213000_p1520_mirror_v2.sql) plus steps 0 and 7. Grants as before: none for clients.
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
  v_threads uuid[];
  v_th      public.chat_round_threads;
  v_key     record;
BEGIN
  IF p_uid IS NULL THEN
    RAISE EXCEPTION 'erase_chat_data_for: no subject' USING ERRCODE = '22023';
  END IF;

  -- 0. (P1592) LOCKS FIRST, before any message row is touched. Order: the ERASING MARKER (exclusive, see
  -- _transcribe_thread_roster_locked: posters and the seating trigger only try it shared and never wait, and
  -- a holder of the shared side is waited for HERE, before any thread lock is held), then speaker, thread,
  -- place, message rows. The speaker lock keeps the poster from committing this person's words after step 2
  -- scrubbed them. Then the thread lock of EVERY (round, table) this person is a member of or is seated at, whether or not a
  -- thread exists yet, taken in (round, table) order (host_set_round_seats seats in the same order). Only THEN
  -- are the threads collected, so a poster that holds a table's lock commits first and its thread is found
  -- here, and a poster that comes later waits and reads a roster without this person: the member list rows
  -- are deleted in step 7 and the seat is tombstoned (profile_id NULL, which the roster skips) in the same
  -- transaction, before any lock is released.
  -- The seat lookup joins event_room_members on profile_id, so erase_my_account must call this BEFORE it
  -- tombstones those rows (it does: redefined below). Locks are held to the end of the transaction, which
  -- includes the profile delete. The channel's outside-rounds lock is deliberately NOT taken: the thread has no
  -- roster and no names to rebuild, and a poster takes it only after its speaker lock, so erasure never waits on it.
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:erasing:' || p_uid::text, 0));   -- exclusive marker, first
  PERFORM pg_advisory_xact_lock(hashtextextended('p1592:speaker:' || p_uid::text, 0));
  FOR v_key IN
    SELECT k.round_id, k.table_no FROM (
      SELECT t.round_id, t.table_no FROM public.chat_round_threads t
        JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
      UNION
      SELECT s.round_id, s.table_no FROM public.event_round_seats s
        JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
    ) k ORDER BY k.round_id, k.table_no
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('p1592:thread:' || v_key.round_id::text || ':' || v_key.table_no::text, 0));
  END LOOP;
  SELECT COALESCE(array_agg(x.id ORDER BY x.round_id, x.table_no), '{}') INTO v_threads FROM (
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.chat_round_thread_members tm ON tm.thread_id = t.id WHERE tm.profile_id = p_uid
    UNION
    SELECT t.id, t.round_id, t.table_no FROM public.chat_round_threads t
      JOIN public.event_round_seats s ON s.round_id = t.round_id AND s.table_no = t.table_no
      JOIN public.event_room_members rm ON rm.id = s.room_member_id WHERE rm.profile_id = p_uid
  ) x;

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

  -- 6. (P1520) AI work derived from their words. The exclusive lock waits for every job still reading its
  -- context (_mirror_begin_job holds it shared) and keeps new ones out until this commits, so no job can
  -- record refs this step does not see. Jobs first: a completion that commits while this waits leaves a
  -- reply the next statement then scrubs.
  PERFORM pg_advisory_xact_lock(hashtext('p1520_mirror_context'));
  UPDATE public.mirror_jobs j
     SET state = 'cancelled', error_code = 'erased', finished_at = now()
   WHERE j.state IN ('queued', 'running') AND j.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_jobs_cancelled', n);
  UPDATE public.chat_messages m
     SET body = NULL, deleted_at = COALESCE(m.deleted_at, now()), derived_refs = NULL
   WHERE m.kind = 'agent' AND m.derived_refs @> ARRAY[v_ref];
  GET DIAGNOSTICS n = ROW_COUNT; v_out := v_out || jsonb_build_object('mirror_replies_erased', n);

  -- 7. (P1592) round-thread titles carry first names. The threads were collected and locked in step 0. Drop
  -- this person from each member list and rebuild the title through the same function the poster uses
  -- ("Round {n}" if nobody named remains). edited_at is never touched. Copies of a root (forward / clarify)
  -- carry "Round {n}" only, so there is nothing to scrub in them.
  FOR v_th IN SELECT t.* FROM public.chat_round_threads t WHERE t.id = ANY (v_threads) ORDER BY t.round_id, t.table_no LOOP
    DELETE FROM public.chat_round_thread_members tm WHERE tm.thread_id = v_th.id AND tm.profile_id = p_uid;
    PERFORM public._transcribe_retitle_thread(v_th.id);
  END LOOP;
  v_out := v_out || jsonb_build_object('chat_round_threads_retitled', COALESCE(array_length(v_threads, 1), 0));

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_chat_data_for(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- erase_my_account — body is byte-for-byte 20261019203000_p1512_clarity_chat.sql except that
-- `PERFORM public.erase_chat_data_for(v_uid)` now runs BEFORE the event_room_members tombstone (see the
-- comment at the call). Signature, security, search_path and grants unchanged.
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

    -- ---- Clarity Chat (P1512): messages, mirror, read state, blocks ------------------------
    -- (P1592) MOVED ABOVE the room-member tombstone below, no other change to this function. The round-thread
    -- part of erase_chat_data_for finds the person's table seats through event_room_members.profile_id, which
    -- the tombstone clears; run after it, the seat lookup matched nothing.
    PERFORM public.erase_chat_data_for(v_uid);

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

-- ============================================================================
-- Post-conditions
-- ============================================================================
DO $check$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_transcribe_slice(uuid, uuid, text)',
    'public.transcribe_message_destination(uuid)',
    'public.apply_transcription_swap(uuid, uuid, jsonb)',
    'public.transcribe_post_retry_tick()',
    'public.transcribe_post_retry_run()',
    'public._transcribe_post_line(uuid)',
    'public._transcribe_retry_one(uuid)',
    'public._transcribe_decide_destination(uuid, uuid)',
    'public._transcribe_thread_roster(uuid, integer, uuid, uuid)',
    'public._transcribe_thread_roster_locked(uuid, integer, uuid, uuid)',
    'public._transcribe_round_title(integer, text[])',
    'public._transcribe_retitle_thread(uuid)',
    'public._transcribe_bare_root_title(uuid)',
    'public._transcribe_seat_joins_thread()',
    'public._transcribe_lock_place(uuid, uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'P1592: % is client-callable', v_fn;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.transcribe_messages', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.transcribe_messages', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.chat_round_threads', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.chat_round_thread_members', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('authenticated', 'public.transcribe_channel_posting', 'SELECT, INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.chat_round_threads', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'P1592: a client holds a privilege it must not have';
  END IF;
END
$check$;
