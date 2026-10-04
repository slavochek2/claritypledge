-- Migration: P1337 — the host sees who is transcribing right now
-- Created: 2026-10-04
-- Spec: features/p1337_event_journey_on_screen_steps_rotation_and_ending.md §6 (host panel marks)
-- Guaranteed by: e2e/integration/p1337-event-rounds-db.spec.ts ("host sees who is transcribing")
--
-- WHY. The founder, walking the host panel: "I should see who has transcribe enabled right now
-- … then I see if the whole table has transcribe enabled or not." The transcription roster is
-- readable only by members of the transcription room (is_transcribe_room_member, P1149), and the
-- host is usually not one — so the host panel had no way to know.
--
-- WHAT. One read-only function, host-gated exactly like the round RPCs (events.host_id =
-- auth.uid(), never is_admin). It returns profile ids only — no transcript, no message, no room
-- code — for members of THIS event's transcription rooms whose capture is live: consent given,
-- not ended, room not ended, and a device signal (last_seen_at) within the sweep's 10 minutes.
--
-- new function: get_event_transcribing_now(uuid) exists in no prior migration.
-- client-safe: additive; no table, column, policy or existing function changes.

CREATE OR REPLACE FUNCTION public.get_event_transcribing_now(p_event_id uuid)
RETURNS TABLE (profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT m.profile_id
    FROM public.transcribe_room_members m
    JOIN public.transcribe_rooms r ON r.id = m.room_id
   WHERE r.event_id = p_event_id
     AND r.ended_at IS NULL
     AND m.consent_given_at IS NOT NULL
     AND m.capture_ended_at IS NULL
     AND m.last_seen_at > now() - interval '10 minutes'
     AND EXISTS (
       SELECT 1 FROM public.events e
        WHERE e.id = p_event_id
          AND e.host_id = (SELECT auth.uid())
     );
$$;

REVOKE EXECUTE ON FUNCTION public.get_event_transcribing_now(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_event_transcribing_now(uuid) TO authenticated;
