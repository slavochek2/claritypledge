-- P1066: require an authenticated identity before authorization comparisons.
--
-- Each function below gains an explicit refusal on its own line, ahead of any
-- comparison against the caller's identity, so that requirement is stated
-- rather than inferred. The rest of every body is unchanged from the live
-- definition it replaces.
--
-- Also drops two overloads left live by earlier signature changes, and removes
-- the anon EXECUTE grant where no unauthenticated call site exists. Both revoke
-- forms are issued because these functions carry a PUBLIC grant and a
-- role-direct anon grant at the same time.
--
-- diffed against: the LIVE catalog rather than a migration file. Every body below was taken from
--   pg_get_functiondef(oid) keyed on oid::regprocedure (so overloads resolve individually) and
--   confirmed identical on prod and test by md5 before editing; the per-function hashes are
--   recorded in .private/docs/security-log.md. The migration corpus is deliberately NOT the
--   baseline: prod carries an object no migration produces and one that survived a recorded DROP,
--   so filename order would have mis-resolved these bodies. Only the additions stated above differ
--   from the md5'd source.
--
-- Rationale and review notes: .private/docs/security-log.md.
--
-- client-safe: every call site for these five is behind a logged-in user. The four
-- letter RPCs are reached only through letters-service.ts, which awaits requireAuth()
-- first; accept_agreement is reached from a handler that returns early without a
-- current user, and from a server-side function running as service_role, whose
-- role-direct grant a PUBLIC revoke does not touch. Deployed clients are unaffected.
--
-- Integration test: e2e/integration/20260813170000_p1066_null_identity_authz_guards.spec.ts

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. get_letter_overview(uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_letter_overview(p_letter_id uuid)
 RETURNS TABLE(letter jsonb, stories jsonb, deliveries jsonb, predictions jsonb, ratings jsonb, point_responses jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sender_id          UUID;
  v_status             TEXT;
  v_letter_json        JSONB;
  v_stories_json       JSONB;
  v_deliveries_json    JSONB;
  v_predictions_json   JSONB;
  v_ratings_json       JSONB;
  v_point_resp_json    JSONB;
  v_snapshot_story_ids UUID[];
  v_visible_point_ids  UUID[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT cl.sender_id, cl.status
  INTO v_sender_id, v_status
  FROM clarity_letters cl
  WHERE cl.id = p_letter_id;

  IF v_sender_id IS NULL OR v_sender_id != auth.uid() OR v_status != 'sealed' THEN
    RETURN;
  END IF;

  SELECT jsonb_build_object(
    'id',        cl.id,
    'title',     cd.title,
    'status',    cl.status,
    'sender_id', cl.sender_id,
    'sender',    jsonb_build_object(
      'profile_id',  sp.id,
      'name',        COALESCE(NULLIF(sp.name, ''), 'Author'),
      'slug',        sp.slug,
      'avatar_url',  sp.avatar_url,
      'has_pledged', COALESCE(sp.has_pledged, false)
    )
  )
  INTO v_letter_json
  FROM clarity_letters cl
  JOIN clarity_docs cd ON cd.id = cl.source_doc_id
  LEFT JOIN profiles sp ON sp.id = cl.sender_id
  WHERE cl.id = p_letter_id;

  SELECT COALESCE(array_agg(lss.story_id), '{}')
  INTO v_snapshot_story_ids
  FROM letter_story_snapshots lss
  WHERE lss.letter_id = p_letter_id;

  -- Visible point IDs: filter by hidden only (recipient parity).
  -- The `superseded_by` filter was removed — recipient view freezes at seal
  -- time and does not honor live supersession; the sender view now matches.
  SELECT COALESCE(array_agg(DISTINCT (pt_elem->>'id')::UUID), '{}')
  INTO v_visible_point_ids
  FROM letter_story_snapshots lss,
       LATERAL jsonb_array_elements(
         COALESCE(lss.point_config->'points', '[]'::jsonb)
       ) AS pt_elem
  WHERE lss.letter_id = p_letter_id
    AND COALESCE((pt_elem->>'hidden')::boolean, false) IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        COALESCE(lss.point_config->'hidden', '[]'::jsonb)
      ) AS hid(id)
      WHERE hid.id = (pt_elem->>'id')
    );

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'story_id',  lss.story_id,
        'position',  lss.position,
        'title',     (lss.point_config->>'storyTitle'),
        'content',   COALESCE(lss.point_config->>'storyText', ''),
        'hashtags',  COALESCE(s.tags, '{}'),
        'points',    (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id',         pt_elem->>'id',
                'text',       pt_elem->>'text',
                'hashtag',    COALESCE(
                                (SELECT p.tags[1]
                                 FROM points p
                                 WHERE p.id = (pt_elem->>'id')::UUID),
                                ''
                              ),
                'sort_order', ordinality - 1
              )
              ORDER BY ordinality
            ),
            '[]'::jsonb
          )
          FROM jsonb_array_elements(
            COALESCE(lss.point_config->'points', '[]'::jsonb)
          ) WITH ORDINALITY AS t(pt_elem, ordinality)
          WHERE (pt_elem->>'id')::UUID = ANY(v_visible_point_ids)
        )
      )
      ORDER BY lss.position
    ),
    '[]'::jsonb
  )
  INTO v_stories_json
  FROM letter_story_snapshots lss
  LEFT JOIN stories s ON s.id = lss.story_id
  WHERE lss.letter_id = p_letter_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id',  ld.id,
        'display_name', COALESCE(
                          NULLIF(ld.receiver_name, ''),
                          NULLIF(p.name, ''),
                          NULLIF(ld.receiver_email, ''),
                          'Recipient'
                        ),
        'full_display_name', COALESCE(
                          NULLIF(p.name, ''),
                          NULLIF(ld.receiver_name, ''),
                          NULLIF(ld.receiver_email, ''),
                          'Recipient'
                        ),
        'profile_slug',    p.slug,
        'profile_id',      ld.receiver_profile_id,
        'avatar_url',      p.avatar_url,
        'has_pledged',     COALESCE(p.has_pledged, false),
        'has_responded',   (ld.status = 'completed'),
        'completed_at',    ld.completed_at
      )
      ORDER BY ld.created_at
    ),
    '[]'::jsonb
  )
  INTO v_deliveries_json
  FROM letter_deliveries ld
  LEFT JOIN profiles p ON p.id = ld.receiver_profile_id
  WHERE ld.letter_id = p_letter_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id', lp.delivery_id,
        'story_id',    lp.story_id,
        'prediction',  lp.prediction
      )
    ),
    '[]'::jsonb
  )
  INTO v_predictions_json
  FROM letter_predictions lp
  WHERE lp.letter_id = p_letter_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id',     ld.id,
        'story_id',        sv.story_id,
        'listener_rating', sv.listener_rating
      )
    ),
    '[]'::jsonb
  )
  INTO v_ratings_json
  FROM story_verifications sv
  JOIN letter_deliveries ld
    ON ld.receiver_profile_id = sv.listener_id
    AND ld.letter_id = p_letter_id
  WHERE sv.source = 'letter'
    AND sv.speaker_id = v_sender_id
    AND sv.story_id = ANY(v_snapshot_story_ids);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'delivery_id', lpr.delivery_id,
        'point_id',    lpr.point_id,
        'position',    lpr.position
      )
    ),
    '[]'::jsonb
  )
  INTO v_point_resp_json
  FROM letter_point_responses lpr
  JOIN letter_deliveries ld ON ld.id = lpr.delivery_id
  WHERE ld.letter_id = p_letter_id
    AND lpr.point_id = ANY(v_visible_point_ids);

  RETURN QUERY SELECT
    v_letter_json,
    v_stories_json,
    v_deliveries_json,
    v_predictions_json,
    v_ratings_json,
    v_point_resp_json;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. claim_letter_delivery(uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_letter_delivery(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_delivery_id UUID;
  v_letter_id UUID;
  v_current_receiver UUID;
  v_sender_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Validate token + expiry + letter status
  SELECT ld.id, ld.letter_id, ld.receiver_profile_id, cl.sender_id
  INTO v_delivery_id, v_letter_id, v_current_receiver, v_sender_id
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
    AND cl.status = 'sealed'
  LIMIT 1;

  IF v_delivery_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Block sender from claiming their own letter
  IF v_sender_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'cannot_claim_own_letter');
  END IF;

  -- If already claimed by a different user, reject
  IF v_current_receiver IS NOT NULL AND v_current_receiver != auth.uid() THEN
    RETURN jsonb_build_object('error', 'delivery_claimed_by_other');
  END IF;

  -- Claim: set receiver_profile_id + mark as opened
  UPDATE letter_deliveries
  SET
    receiver_profile_id = auth.uid(),
    status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
    opened_at = COALESCE(opened_at, now())
  WHERE id = v_delivery_id;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery_id,
    'letter_id', v_letter_id,
    'claimed', true
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. reveal_prediction(uuid, uuid)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_prediction(p_delivery_id uuid, p_story_id uuid)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receiver_id UUID;
  v_letter_id UUID;
  v_prediction SMALLINT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Get delivery info
  SELECT receiver_profile_id, letter_id
  INTO v_receiver_id, v_letter_id
  FROM letter_deliveries
  WHERE id = p_delivery_id;

  IF v_receiver_id IS NULL OR v_receiver_id != auth.uid() THEN
    RETURN NULL;
  END IF;

  -- Check that receiver has rated this story (source='letter' verification exists)
  IF NOT EXISTS (
    SELECT 1 FROM story_verifications
    WHERE story_id = p_story_id
      AND source = 'letter'
      AND listener_id = auth.uid()
  ) THEN
    RETURN NULL;
  END IF;

  -- Return the prediction
  SELECT prediction INTO v_prediction
  FROM letter_predictions
  WHERE letter_id = v_letter_id
    AND story_id = p_story_id
    AND (delivery_id = p_delivery_id OR delivery_id IS NULL)
  ORDER BY delivery_id NULLS LAST  -- prefer delivery-specific prediction
  LIMIT 1;

  RETURN v_prediction;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. mark_inbox_item_read(uuid)
--
-- The comparison below is against a nullable column, so it cannot carry the
-- identity requirement on its own. The explicit refusal does.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_inbox_item_read(p_delivery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receiver_profile_id UUID;
  v_sender_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Look up delivery + parent letter sender
  SELECT
    d.receiver_profile_id,
    l.sender_id
  INTO v_receiver_profile_id, v_sender_id
  FROM letter_deliveries d
  JOIN clarity_letters l ON l.id = d.letter_id
  WHERE d.id = p_delivery_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  -- Authorize: must be receiver or sender
  IF auth.uid() IS DISTINCT FROM v_receiver_profile_id
     AND auth.uid() IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'Not authorized to mark this item as read' USING ERRCODE = '42501';
  END IF;

  -- Idempotent: only set if not already read
  UPDATE letter_deliveries
    SET read_at = now()
    WHERE id = p_delivery_id
      AND read_at IS NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. accept_agreement(uuid, text, uuid, text)
--
-- The partner identity is now bound to the caller's own identity for every
-- request that carries one.
--
-- service_role is exempt because the inline sign-up path creates the partner
-- account server-side and calls this before that account has a session, so
-- auth.uid() is legitimately NULL there (supabase/functions/create-and-sign).
-- That role already bypasses RLS entirely, so trusting it here grants nothing
-- it did not already have. The role claim is part of the signed JWT and is not
-- settable by a browser client.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_agreement(p_agreement_id uuid, p_token text, p_partner_id uuid, p_partner_display_name text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
    END IF;
    IF p_partner_id IS NULL OR p_partner_id <> auth.uid() THEN
      RAISE EXCEPTION 'Not authorized to accept on behalf of another profile' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE clarity_agreements
  SET
    partner_profile_id     = p_partner_id,
    partner_signed_at      = now(),
    status                 = 'active',
    partner_display_name   = COALESCE(p_partner_display_name, partner_display_name)
  WHERE id               = p_agreement_id
    AND invitation_token = p_token
    AND status           = 'pending'
    AND creator_profile_id != p_partner_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Drop overloads left live by earlier signature changes.
--
-- Both are separately granted and separately reachable, and while two arities
-- coexist a call naming only the shared arguments cannot be resolved.
--
-- get_inbox_items(uuid) is absent from test and present on prod, so this is a
-- no-op in one environment and the whole point in the other. An identical DROP
-- is already recorded as applied on prod while the function is still there —
-- verify against live pg_proc after this runs rather than trusting the run.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_inbox_items(uuid);
DROP FUNCTION IF EXISTS public.accept_agreement(uuid, text, uuid);

-- ---------------------------------------------------------------------------
-- 7. Remove anon EXECUTE. Every call site for these five is authenticated.
--
-- Both forms are required. These functions carry `=X/postgres` (PUBLIC) and
-- `anon=X/postgres` (role-direct) simultaneously: revoking from anon alone
-- leaves PUBLIC, of which anon is a member, and revoking from PUBLIC alone
-- leaves the role-direct grant.
--
-- authenticated and service_role hold role-direct grants and survive a PUBLIC
-- revoke; the GRANTs below re-assert them regardless.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_letter_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_letter_overview(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_letter_overview(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_letter_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_letter_delivery(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_letter_delivery(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reveal_prediction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reveal_prediction(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.reveal_prediction(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mark_inbox_item_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_inbox_item_read(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_inbox_item_read(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.accept_agreement(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_agreement(uuid, text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_agreement(uuid, text, uuid, text) TO authenticated, service_role;

COMMIT;
