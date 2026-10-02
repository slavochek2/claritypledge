-- new function
-- client-safe: P1347 is unshipped; no deployed client calls clear_topic_rating yet.
-- P1347 (founder, 2026-10-02): "should I be able to unmark… I click on the three stars and it
-- removes my rating". Tapping your current star again takes your rating back. Only your own
-- row is removed; the topic's result disappears for you again, as before you voted.

CREATE FUNCTION public.clear_topic_rating(p_topic_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign in required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.topic_ratings WHERE topic_id = p_topic_id AND user_id = auth.uid();
END;
$$;
REVOKE EXECUTE ON FUNCTION public.clear_topic_rating(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_topic_rating(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_topic_rating(uuid) TO authenticated;
