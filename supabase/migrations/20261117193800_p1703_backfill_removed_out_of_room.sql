-- P1703 backfill: people a host removed before 20261117193700_p1703_removal_leaves_room.sql shipped are marked out of
-- the room too, for every event whose room is still open.
-- Spec: features/p1703_removal_also_leaves_the_room.md
--
-- Why: the host's Remove list shows registered people only, so a person removed earlier can never be removed again, and
-- their room entry would stay "here" for the rest of a still-open event (Opus spec review).
--
-- Scope: events still inside their room window (now() < datetime + event_grace_interval(), the same test join_event_room
-- uses). Closed rooms are history and are not rewritten.
--
-- Skipped: a member whose presence row was written after the removal (updated_at >= removed_at). That is the host's own
-- later choice ("Back in", or a mark-out already made), and a backfill must not override it (.claude/rules/database.md:
-- never override user-set state). An already-out row is never touched (the DO UPDATE's WHERE).
--
-- Idempotent: a second run writes nothing. Triggers: the presence trigger (_transcribe_log_presence_change) fires per row
-- exactly as for a mark-out, and catches its own errors.
--
-- client-safe: data only; no function, policy or grant changes.

INSERT INTO public.event_round_presence AS p (event_id, room_member_id, left_at)
SELECT m.event_id, m.id, now()
  FROM public.event_removals x
  JOIN public.event_room_members m ON m.event_id = x.event_id AND m.profile_id = x.user_id
  JOIN public.events e ON e.id = x.event_id
 WHERE now() < e.datetime + public.event_grace_interval()
   AND NOT EXISTS (
     SELECT 1 FROM public.event_round_presence q
      WHERE q.event_id = m.event_id AND q.room_member_id = m.id AND q.updated_at >= x.removed_at
   )
ON CONFLICT (event_id, room_member_id) DO UPDATE
  SET left_at = now(),
      updated_at = now()
  WHERE p.left_at IS NULL;
