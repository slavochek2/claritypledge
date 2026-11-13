-- client-safe: _point_chat_erase_author is an internal function (no client grant) and keeps its signature and return type; the only change is that account erasure also deletes a private point whose publisher is already gone and whose last remaining holder is the person erasing
-- Migration: P1631 erasing the last holder of a kept point deletes it (spec Open Question 9: "if only the author holds a position, the point is deleted")
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-erase-last-holder-migration.test.ts (source contract), src/tests/integration/p1631-erase-keeps-held-points.test.ts
--
-- 20261113130000 keeps a private point E published when someone else holds a position on it, and clears the share row's shared_by. When the last of those holders later erases, no one holds the
-- point and no author remains, so it is orphaned. This adds one statement (marked lines `-- P1631 erase last holder`) to the newest _point_chat_erase_author that deletes exactly those points:
-- private, with a point_chat_shares row whose shared_by IS NULL (its author is gone), and no position by anyone other than the person being erased. It runs before the unchanged delete and
-- after the unchanged share update of 20261113130000, so a point the person erasing has just orphaned of its publisher is also covered by the original path.
-- Narrow by construction: a point with a live publisher is never touched; a point another person still holds is never touched.
-- Position test is `user_id IS DISTINCT FROM p_uid`, independent of whether erase_my_account already deleted the person's own positions.
--
-- diffed against:
--   _point_chat_erase_author(uuid)    20261113130000_p1631_erase_keeps_held_points.sql (its newest definition)

BEGIN;

CREATE OR REPLACE FUNCTION public._point_chat_erase_author(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- a point another person holds a position on is kept: its share row loses the publisher, so the delete below does not find it -- P1631 erase keeps held points
  UPDATE public.point_chat_shares s SET shared_by = NULL -- P1631 erase keeps held points
   WHERE s.shared_by = p_uid -- P1631 erase keeps held points
     AND EXISTS (SELECT 1 FROM public.point_positions pp WHERE pp.point_id = s.point_id AND pp.user_id IS DISTINCT FROM p_uid); -- P1631 erase keeps held points
  -- a kept point (its author is gone) whose only remaining holder is the person erasing is orphaned: it goes with them -- P1631 erase last holder
  DELETE FROM public.points op -- P1631 erase last holder
   WHERE op.visibility = 'private'::public.content_visibility -- P1631 erase last holder
     AND EXISTS (SELECT 1 FROM public.point_chat_shares os WHERE os.point_id = op.id AND os.shared_by IS NULL) -- P1631 erase last holder
     AND NOT EXISTS (SELECT 1 FROM public.point_positions lp WHERE lp.point_id = op.id AND lp.user_id IS DISTINCT FROM p_uid); -- P1631 erase last holder
  DELETE FROM public.points p
   WHERE p.visibility = 'private'::public.content_visibility
     AND p.id IN (SELECT s.point_id FROM public.point_chat_shares s WHERE s.shared_by = p_uid);
END;
$$;
REVOKE ALL ON FUNCTION public._point_chat_erase_author(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
