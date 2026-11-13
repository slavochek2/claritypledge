-- client-safe: _clarify_row_text keeps its signature, return type, volatility, search_path and (absent) client grants; it only returns a text where it used to return NULL, for a chat message that is a live point card
-- Migration: P1631 Clarify on a point card
-- Created: 2026-11-13
-- Spec: features/p1631_mirror_drafts_reviewable_point_set.md
-- Guaranteed by: src/tests/p1631-clarify-scope.test.ts (source contract), src/tests/integration/p1631-clarify-scope.test.ts (behaviour on the test database)
--
-- The bug. A published point is a chat message with attachment_kind 'point' and an empty body. Clarify on that card failed at once: _clarify_begin needs `_clarify_row_text(v_src) IS NOT NULL`, a card has
-- no text, so the draft failed `source_gone` (the edge function answered GONE, the screen said "Couldn't make a point"). The same blindness dropped published cards from the surrounding chat.
--
-- The fix. _clarify_row_text(x) also returns the point's statement, as 'Point: <statement>', for a LIVE card (deleted_at IS NULL, attachment_kind 'point') whose body, and voice transcript, are empty.
-- The prefix tells the model the row is a published point, not something a person typed. The card then works as the pressed message, as a thread row and as surrounding chat.
--
-- Who may be shown the statement. The function is called only from SECURITY DEFINER functions, each of which has already required that the presser can read the card row (created_at >= their
-- _chat_access_since). The statement is added only when that is also true of the point itself: the point is PUBLIC, or this very card is a published share of it (point_chat_shares.message_id = x.id).
-- A published share is readable by exactly the people who can read the card (20261112150000: points_select_chat_shared), so whoever can read the card row can read its point; a private point that merely
-- sits on a card without a share row (never produced by publish) yields NULL, as before. A Clarify draft card exists only in its owner's Mirror and has no share row and no card in another chat.
--
-- Callers (grep of all migrations; every definition is the one in 20261110153000 and later bodies of the callers below): _clarify_begin (source, thread rows, surrounding chat), _clarify_cited_rows
-- (the cited ids are checked against rows sent, so a card can now be cited), clarify_start_chat (the anchor needs a row with text, so a card may be an anchor). Nothing else calls it.
--
-- diffed against:
--   _clarify_row_text(chat_messages)  20261110153000_p1631_clarify_drafts.sql (its only definition): that body byte for byte, except the last line of the SELECT, which no longer closes the COALESCE (it is the
--                                      line marked `-- P1631 point card`, followed by the added lines and the closing `);`). Nothing else is changed.

BEGIN;

CREATE OR REPLACE FUNCTION public._clarify_row_text(x public.chat_messages)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(NULLIF(btrim(x.body), ''),
                  CASE WHEN x.audio_duration_ms IS NOT NULL AND x.transcript_status = 'done' THEN NULLIF(btrim(x.transcript), '') END, -- P1631 point card
                  CASE WHEN x.attachment_kind = 'point' AND x.deleted_at IS NULL THEN -- P1631 point card
                    (SELECT 'Point: ' || NULLIF(btrim(p.statement), '') FROM public.points p -- P1631 point card
                      WHERE p.id = x.attachment_id -- P1631 point card
                        AND (p.visibility = 'public'::public.content_visibility -- P1631 point card
                             OR EXISTS (SELECT 1 FROM public.point_chat_shares s WHERE s.point_id = p.id AND s.message_id = x.id))) -- P1631 point card
                  END); -- P1631 point card
$$;
REVOKE ALL ON FUNCTION public._clarify_row_text(public.chat_messages) FROM PUBLIC, anon, authenticated;

COMMIT;
