-- diffed against: 20261014140000_p1487_delivery_token_server_only.sql (get_deliveries_with_progress: body is that definition plus the two keys below); mark_delivery_seen_by_sender is a new function
-- P1545 second pass: a sender-side "seen" mark, separate from the recipient's read mark.
--
-- Today letter_deliveries.read_at is written by mark_inbox_item_read for BOTH parties: the recipient opening the
-- letter and the sender viewing activity. Once a recipient has opened the letter, read_at is set, so the sender
-- never sees that recipient's LATER progress as new. The Artifacts rows now carry a dot for "something new"
-- (Sent included), so the sender needs a mark of their own:
--   1. letter_deliveries.sender_seen_at: when the sender last looked at this delivery. NULL = never.
--   2. mark_delivery_seen_by_sender(delivery): sender-only, sets sender_seen_at = now() every call (NOT only when
--      null: later progress must be able to become new again).
--   3. get_deliveries_with_progress (the sender's reader) also returns sender_seen_at and last_progress_at, the
--      latest of: completion, the newest point response, the newest kept explain-back, and the moment the
--      recipient opened the letter once they have started. A delivery is NEW for the sender when it has progress
--      and (sender_seen_at is null or last_progress_at is later). The client does that comparison.
-- read_at, mark_inbox_item_read and get_inbox_items are NOT changed: the recipient side stays on read_at.
--
-- client-safe: a new nullable column that no deployed client reads or writes (the column-level SELECT grant of
--   20261014140000 does not include it, so it is reachable only through the SECURITY DEFINER reader below);
--   mark_delivery_seen_by_sender is a new function nothing deployed calls; get_deliveries_with_progress keeps its
--   name, argument list and return type (jsonb) and gains two keys, which a deployed client ignores.

ALTER TABLE public.letter_deliveries
  ADD COLUMN IF NOT EXISTS sender_seen_at timestamptz;

-- Back-fill: start every delivery where today's shared mark leaves it, so switching on adds no "new" mark the
-- sender did not already have. Without this, every past delivery with progress would show as new at once.
UPDATE public.letter_deliveries
   SET sender_seen_at = read_at
 WHERE sender_seen_at IS NULL AND read_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_delivery_seen_by_sender(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sender_id uuid;
BEGIN
  SELECT l.sender_id
  INTO v_sender_id
  FROM public.letter_deliveries d
  JOIN public.clarity_letters l ON l.id = d.letter_id
  WHERE d.id = p_delivery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  -- Sender only: unlike mark_inbox_item_read, the recipient may not write this mark. A NULL auth.uid() never matches.
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'Only the letter sender may mark a delivery as seen' USING ERRCODE = '42501';
  END IF;

  UPDATE public.letter_deliveries
  SET sender_seen_at = now()
  WHERE id = p_delivery_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_delivery_seen_by_sender(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivery_seen_by_sender(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_deliveries_with_progress(p_letter_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_result  JSONB;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                   ld.id,
      'letter_id',            ld.letter_id,
      'receiver_email',       ld.receiver_email,
      'receiver_profile_id',  ld.receiver_profile_id,
      'receiver_name',        ld.receiver_name,
      'receiver_slug',        p.slug,
      'invitation_expires_at',ld.invitation_expires_at,
      'access_token_expires_at', ld.access_token_expires_at,
      'status',               ld.status,
      'stories_rated',        ld.stories_rated,
      'opened_at',            ld.opened_at,
      'completed_at',         ld.completed_at,
      'read_at',              ld.read_at,
      'created_at',           ld.created_at,
      'sender_seen_at',       ld.sender_seen_at,
      'last_progress_at',     GREATEST(
        ld.completed_at,
        (SELECT MAX(lpr.created_at) FROM letter_point_responses lpr WHERE lpr.delivery_id = ld.id),
        (SELECT MAX(eb.created_at) FROM story_explain_backs eb WHERE eb.delivery_id = ld.id AND eb.deleted_at IS NULL),
        CASE WHEN ld.status IN ('in_progress', 'completed') THEN ld.opened_at END
      ),
      'steps_completed',      LEAST(
        COALESCE(ld.stories_rated, 0) + (
          SELECT COUNT(*)
          FROM letter_point_responses lpr
          WHERE lpr.delivery_id = ld.id
        ),
        (SELECT COUNT(*) FROM letter_story_snapshots lss WHERE lss.letter_id = ld.letter_id) +
        COALESCE(
          (SELECT SUM(jsonb_array_length(lss2.point_config->'points'))
           FROM letter_story_snapshots lss2
           WHERE lss2.letter_id = ld.letter_id),
          0
        )
      ),
      'total_steps',          (
        (SELECT COUNT(*) FROM letter_story_snapshots lss WHERE lss.letter_id = ld.letter_id) +
        COALESCE(
          (SELECT SUM(jsonb_array_length(lss2.point_config->'points'))
           FROM letter_story_snapshots lss2
           WHERE lss2.letter_id = ld.letter_id),
          0
        )
      )
    )
    ORDER BY ld.created_at
  ), '[]'::jsonb)
  INTO v_result
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  LEFT JOIN profiles p ON p.id = ld.receiver_profile_id
  WHERE ld.letter_id = ANY(p_letter_ids)
    AND cl.sender_id = v_user_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_deliveries_with_progress(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_deliveries_with_progress(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_deliveries_with_progress(uuid[]) TO authenticated, service_role;
