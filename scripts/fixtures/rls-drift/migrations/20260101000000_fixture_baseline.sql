-- FIXTURE ONLY — never applied to any database.
--
-- Stands in for the repo's real migration history when self-testing
-- scripts/rls-drift-check.py. Mirrors the pre-P1046 reality that the two
-- drift origins were distinguishable from the files alone:
--
--   * The three "Anyone can update ..." policies WERE created by a migration
--     (and later dropped by one that prod never reflected) — so they are
--     prod-only drift, but they ARE in the files.
--   * "Anyone can read sessions" was applied out-of-band and appears in NO
--     migration — so it is prod-only AND absent from the files.
--
-- Deliberately omits "Anyone can read sessions". That omission is the assertion.

CREATE POLICY "Anyone can read feed ideas" ON public.clarity_feed_ideas
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update feed ideas" ON public.clarity_feed_ideas
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can update comments" ON public.clarity_idea_comments
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can update their own votes" ON public.clarity_idea_votes
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY clarity_sessions_select ON public.clarity_sessions
  FOR SELECT USING ((target_listener_id IS NULL) OR (creator_profile_id = auth.uid()));
