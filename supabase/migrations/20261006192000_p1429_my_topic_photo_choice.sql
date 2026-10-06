-- new function
-- P1429 A1 (review round, Opus): the "Hide my photo" box showed the voter's choice only as read off
-- their votes. Someone who hid it before voting (or after clearing their votes) saw it unticked on
-- return while the server held "hidden" — the page said the opposite of what the next vote would do.
-- This returns the stored choice (topic_vote_prefs, which clients cannot read) to its owner only.
-- client-safe: a new function; nothing existing changes.

CREATE OR REPLACE FUNCTION public.get_my_topic_photo_choice()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.show_photo FROM public.topic_vote_prefs p WHERE auth.uid() IS NOT NULL AND p.user_id = auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_topic_photo_choice() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_topic_photo_choice() TO authenticated;
