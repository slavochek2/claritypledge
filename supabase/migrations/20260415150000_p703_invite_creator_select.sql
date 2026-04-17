-- P703: Allow session creator to SELECT their own clarity_live_invites
--
-- Problem: checkOpenInviteForReceiver() uses the anon Supabase client (RLS active).
-- The current SELECT policy only allows the recipient to read their own invites:
--   USING (auth.uid() = target_user_id)
--
-- The session creator needs to read invite state to:
-- 1. Disable "Start a clarity session" button when an invite is already pending (UAT-6)
-- 2. Show "Invite sent to {listener}" on the waiting screen
--
-- Fix: Add a second SELECT policy for the session creator.
-- Both policies coexist — Supabase OR-combines them (row visible if either matches).
CREATE POLICY "live_invites_creator_select"
  ON clarity_live_invites FOR SELECT
  USING (
    auth.uid() IN (
      SELECT creator_profile_id FROM clarity_sessions WHERE id = session_id
    )
  );
