-- requires-frontend: 41759cede066f8e19fd320b7c1904bb23fc18f6e
--   (fail-safe placeholder: migrate.sh blocks the prod apply on it. Replace with the sha of the
--   commit that moves letters-service.ts off select('*') once that commit exists.)
-- diffed against: 20260417100100_p725_deliveries_receiver_slug.sql
--   (get_deliveries_with_progress: body identical to that definition and to the live prod/test
--   definition, minus the one token key; header normalised to pg_get_functiondef form.)
--
-- P1487: a letter delivery's invitation token is no longer readable by client roles.
--
-- The token is the recipient's bearer capability for one delivery. It reaches the recipient by
-- email; no client screen reads it back from the table (the reader takes it from the link it
-- arrived on, and every lookup by token goes through SECURITY DEFINER functions or edge
-- functions running as service_role). Until now the table-level SELECT grant exposed it to every
-- signed-in party the row policy admits, including the letter's sender. With P1487 the token no
-- longer yields a session or an account, but it still opens the recipient's side of the
-- delivery, so it is withdrawn from client reads as defense in depth.
--
-- Mechanism: RLS gates rows, not columns, and a column REVOKE is a no-op while a table-level
-- grant stands. So the table-level SELECT is replaced by a column list that omits the token.
-- anon keeps the same column list it had (its rows are still hidden by the row policy), so no
-- signed-out read changes behaviour other than this one column.
--
-- Consequence for clients: `select('*')` on this table now fails for anon/authenticated
-- (permission denied for the omitted column). Client reads name their columns
-- (src/app/data/letters-service.ts DELIVERY_COLUMNS). A column added to this table later is
-- NOT client-readable until it is added to the grant below in a new migration.
--
-- The sender's delivery-progress reader (get_deliveries_with_progress, SECURITY DEFINER) also
-- returned the token; it is redefined below without that one key and is otherwise byte-for-byte
-- the definition live on prod and test before this migration. No client reads the key.
--
-- Unchanged: INSERT/UPDATE/DELETE privileges and every row policy; service_role; the SECURITY
-- DEFINER functions that take a token as input (get_letter_for_reading, claim_letter_delivery,
-- the *_by_token RPCs) and return no token.

REVOKE SELECT ON TABLE public.letter_deliveries FROM anon, authenticated;

GRANT SELECT (
  id,
  letter_id,
  receiver_email,
  receiver_profile_id,
  invitation_expires_at,
  access_token_expires_at,
  status,
  stories_rated,
  opened_at,
  completed_at,
  created_at,
  receiver_name,
  read_at,
  saved_story_index,
  notified_at
) ON TABLE public.letter_deliveries TO anon, authenticated;

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
