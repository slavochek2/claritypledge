-- P1487: claiming a letter delivery requires being the account it was addressed to.
--
-- client-safe: no grant or response shape a deployed client relies on changes. The function keeps
--   its signature and grants; a refused claim returns {error: ...} exactly like the existing
--   refusals, which the client already treats as "not claimed" (and reports unknown reasons).
--   The reader page shows its "different account" screen before it would ever claim, so the
--   addressed recipient never reaches the new refusal.
-- diffed against: 20260813170000_p1066_null_identity_authz_guards.sql
--   (claim_letter_delivery: that definition is byte-identical to prod and test before this
--   migration; changes are the addressed-recipient check and the conditional claim write.)
--
-- Measured before writing (prod, read-only): every claimed delivery is held by the account whose
-- email equals the delivery's address, and no unclaimed delivery lacks an address — so no
-- existing holder is affected and no product flow claims across addresses.

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
  v_receiver_email TEXT;
  v_caller_email TEXT;
  v_caller_confirmed TIMESTAMPTZ;
  v_claimed UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized: authentication required' USING ERRCODE = '42501';
  END IF;

  -- Validate token + expiry + letter status
  SELECT ld.id, ld.letter_id, ld.receiver_profile_id, cl.sender_id, ld.receiver_email
  INTO v_delivery_id, v_letter_id, v_current_receiver, v_sender_id, v_receiver_email
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

  -- P1487: only the account the delivery was addressed to may claim it — its CONFIRMED
  -- email must equal the delivery's address (case-insensitive). Re-claiming a delivery the
  -- caller already holds stays idempotent.
  IF v_current_receiver IS DISTINCT FROM auth.uid() AND v_receiver_email IS NOT NULL THEN
    SELECT u.email, u.email_confirmed_at INTO v_caller_email, v_caller_confirmed
    FROM auth.users u WHERE u.id = auth.uid();
    IF v_caller_confirmed IS NULL
       OR lower(btrim(v_caller_email)) IS DISTINCT FROM lower(btrim(v_receiver_email)) THEN
      RETURN jsonb_build_object('error', 'not_intended_recipient');
    END IF;
  END IF;

  -- Claim: set receiver_profile_id + mark as opened. P1487: conditional, so a concurrent claim
  -- by another account between the read above and this write cannot be overwritten.
  UPDATE letter_deliveries
  SET
    receiver_profile_id = auth.uid(),
    status = CASE WHEN status = 'sent' THEN 'opened' ELSE status END,
    opened_at = COALESCE(opened_at, now())
  WHERE id = v_delivery_id
    AND (receiver_profile_id IS NULL OR receiver_profile_id = auth.uid())
  RETURNING id INTO v_claimed;

  IF v_claimed IS NULL THEN
    RETURN jsonb_build_object('error', 'delivery_claimed_by_other');
  END IF;

  RETURN jsonb_build_object(
    'delivery_id', v_delivery_id,
    'letter_id', v_letter_id,
    'claimed', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_letter_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_letter_delivery(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_letter_delivery(uuid) TO authenticated, service_role;
