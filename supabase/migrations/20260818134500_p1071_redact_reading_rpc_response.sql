-- P1071: get_letter_for_reading must not disclose the recipient's address,
-- nor echo back the invitation token that authenticates the very response.
--
-- requires-frontend: 60c444db58cfb292a0eac69bc07a9e130aa89510
--   The shape detector in check-migration-client-safety.sh does not flag
--   CREATE OR REPLACE FUNCTION -- its own header calls the list non-exhaustive.
--   This IS client-breaking all the same: a deployed client still reading
--   delivery.receiver_email would find it undefined and its wrong-user guard
--   would silently skip, which is precisely the P717 failure mode
--   (docs/decisions.md 2026-04-16). Hence the explicit coupling.
--
-- Reconciles two requirements that have contradicted each other since P717:
--   P651 required receiver_email removed from this response (privacy).
--   P717 restored it, because the client's wrong-user guard compared it to the
--   signed-in user's address; without it the guard compared against undefined
--   and never fired.
-- Both hold once the comparison happens here: the caller receives the verdict,
-- never the address. P717's counter-argument ("the link was emailed to that
-- address, so the holder already knows it") is sound for the ordinary reader
-- but does not cover a forwarded or logged link -- that is the exposure closed.
--
-- diffed against: 20260417100300_p725_reading_rpc_sender_slug.sql
--   (the last migration to redefine this function)
--
-- Base: pg_get_functiondef() of the live function, not an older migration
-- (P952 regression guarded by src/tests/sd-guard-completeness.test.ts).
-- Everything outside the delivery jsonb is preserved verbatim, including the
-- P697 avatar fields, the P725 sender_slug, and the dropped expiry predicate.

CREATE OR REPLACE FUNCTION public.get_letter_for_reading(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_letter_id    UUID;
  v_delivery_id  UUID;
  v_letter       JSONB;
  v_snapshots    JSONB;
  v_delivery     JSONB;
  v_caller_email TEXT;
BEGIN
  SELECT cl.id, ld.id
  INTO v_letter_id, v_delivery_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_letter_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- P1071: the caller's own address, for the wrong-user comparison below.
  -- Read from auth.users rather than auth.jwt() -- the JWT copy goes stale
  -- after an email change, and this decides a security guard.
  -- Stays NULL for an anonymous caller (no auth.uid() -> no row).
  SELECT u.email INTO v_caller_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  -- Letter + sender profile fields (P697: avatar, P717: parent guards, P725: slug)
  SELECT jsonb_build_object(
    'id',                   cl.id,
    'source_doc_id',        cl.source_doc_id,
    'sender_id',            cl.sender_id,
    'sender_display_name',  COALESCE(p.name, 'Someone'),
    'sender_slug',          p.slug,
    'sender_avatar_url',    p.avatar_url,
    'sender_avatar_color',  p.avatar_color,
    'sender_has_pledged',   COALESCE(p.has_pledged, false),
    'mode',                 cl.mode,
    'status',               cl.status,
    'sealed_at',            cl.sealed_at,
    'created_at',           cl.created_at
  ) INTO v_letter
  FROM clarity_letters cl
  LEFT JOIN profiles p ON p.id = cl.sender_id
  WHERE cl.id = v_letter_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'letter_id',    lss.letter_id,
      'story_id',     lss.story_id,
      'version_id',   lss.version_id,
      'position',     lss.position,
      'point_config', lss.point_config,
      'visibility',   lss.visibility
    ) ORDER BY lss.position
  ), '[]'::jsonb) INTO v_snapshots
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = v_letter_id;

  SELECT jsonb_build_object(
    'id',                       ld.id,
    'letter_id',                ld.letter_id,
    -- P1071: receiver_email and invitation_token are deliberately absent.
    -- If a future guard needs the address, add another verdict field -- do not
    -- restore the column. Note here what any omission would break, so the next
    -- reader does not rediscover it by watching a guard fail silently (P717).
    'is_intended_recipient',    CASE
                                  -- No signed-in caller: guard does not apply.
                                  -- Anonymous reading through an invitation link
                                  -- is the intended product behaviour and the
                                  -- reason this function is anon-executable.
                                  WHEN v_caller_email IS NULL THEN NULL
                                  -- Nothing to compare (one-to-many link
                                  -- deliveries carry no receiver_email).
                                  -- Not a failed match.
                                  WHEN ld.receiver_email IS NULL THEN NULL
                                  ELSE lower(v_caller_email) = lower(ld.receiver_email)
                                END,
    'receiver_profile_id',      ld.receiver_profile_id,
    'receiver_name',            ld.receiver_name,
    'invitation_expires_at',    ld.invitation_expires_at,
    'access_token_expires_at',  ld.access_token_expires_at,
    'status',                   ld.status,
    'stories_rated',            ld.stories_rated,
    'opened_at',                ld.opened_at,
    'completed_at',             ld.completed_at,
    'created_at',               ld.created_at
  ) INTO v_delivery
  FROM letter_deliveries ld
  WHERE ld.id = v_delivery_id;

  RETURN jsonb_build_object(
    'letter',    v_letter,
    'snapshots', v_snapshots,
    'delivery',  v_delivery
  );
END;
$function$;

COMMENT ON FUNCTION public.get_letter_for_reading(uuid) IS
  'P1071: anon-executable letter read by invitation token. Returns no '
  'receiver_email and no invitation_token; is_intended_recipient carries the '
  'wrong-user comparison (NULL = guard does not apply).';
