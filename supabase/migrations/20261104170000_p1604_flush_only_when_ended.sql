-- Migration: P1604 (13/13) — a flush report counts only for a seat whose capture has ended
-- Created: 2026-11-04
-- Spec: features/p1604_transcription_belongs_to_a_chat.md (final review: a delayed report must not mark a continued seat flushed)
-- Guaranteed by: e2e/integration/p1604-flush-and-sections.spec.ts
--
-- diffed against: 20261104130000_p1604_flush_release_sections.sql (report_audio_flushed: same signature, return type and grants; ONE change:
--   the report is stored only while the seat's capture has ended (capture_ended_at IS NOT NULL). A report that arrives after the seat was
--   continued (the person came back and is recording again) finds capture_ended_at NULL and is ignored, so it cannot mark the new capture
--   flushed and release the room's clean job while its audio is still being recorded. A report that arrives before the End is recorded
--   (the tail upload beat the End call) is ignored too, and the job simply waits its full 2-minute bound.)
--   Limit, stated: a stale report from an OLD capture that arrives after a LATER capture of the same seat has also ended is not
--   distinguishable by the server (it would need a capture generation carried by the client); the client's upload queue is serial and
--   reports only after its own last chunk, so this needs two tabs.
--
-- client-safe: function body only.

CREATE OR REPLACE FUNCTION public.report_audio_flushed(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.transcribe_room_members m SET audio_flushed_at = now()
   WHERE m.room_id = p_room_id AND m.profile_id = auth.uid() AND m.capture_ended_at IS NOT NULL;
  PERFORM public._transcribe_release_room_job(p_room_id);
END;
$$;
COMMENT ON FUNCTION public.report_audio_flushed(uuid) IS
  'P1604: the caller''s seat reports its last archive chunk uploaded, only while its capture has ended. When every seat of the room''s pending clean job has, the job is due now.';
REVOKE ALL ON FUNCTION public.report_audio_flushed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_audio_flushed(uuid) TO authenticated;
