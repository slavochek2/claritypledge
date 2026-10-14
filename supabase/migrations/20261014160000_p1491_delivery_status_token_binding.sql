-- P1491: the token-based delivery-status RPC is the recipient's progress path only.
--
-- diffed against: 20260630130000_p977_p979_restore_dropped_sd_guards.sql
--   (update_delivery_status_by_token — the definition live on prod. Every existing guard is kept
--   verbatim: sealed-letter lookup, the P684 one-to-many sign-in requirement and the P979
--   forward-only rank guard. The P683 decision also stands: invitation expiry does not gate the
--   recipient's own progress, because create-and-open-letter spends the invitation in the same
--   write that binds the delivery.)
--
-- Changes, aligned with claim_letter_delivery (20260813170000), the other path that binds a
-- recipient account to a delivery:
--   1. The letter's sender is not a recipient of it: a call made as the sender changes nothing
--      and returns false. (The client ignores the result; no product path calls this as sender.)
--   2. A delivery with no recipient account yet is bound to the signed-in caller only while its
--      invitation is unexpired — the same window claim_letter_delivery uses. After that the
--      progress still records, binding nobody.
--   3. A signed-in caller whose account conflicts with the delivery's bound recipient changes
--      nothing and returns false (claim_letter_delivery refuses the same caller).
--   4. The delivery row is locked (FOR UPDATE) before any of these decisions, so a binding or
--      status write that commits while this call waits is re-read, never overwritten with a
--      stale value or moved backward.
--
-- Signed-out callers (policy, unchanged from P642): a signed-out holder of a one-to-one
-- delivery's token may record forward-only progress on it — the recipient may open the emailed
-- link signed out — but never binds an account, since there is none. One-to-many still requires
-- sign-in (P684).
--
-- Locking note: claim_letter_delivery reads the row without a lock and then writes it. With this
-- function holding the row lock, a claim that commits first is seen here; a claim that runs
-- second waits for this call's commit but acts on its own earlier read. That is a pre-existing
-- property of the claim function, left unchanged here.
--
-- client-safe: same signature, same grants (re-asserted below); every deployed client call
--   (letter-reading-page.tsx, useLetterReadingState.ts) is a recipient-side status write that
--   behaves as before. The calls whose effect changes are the sender's own, binding after
--   expiry, and a signed-in account other than the bound recipient — none of which is a
--   product flow (the reader claims first; a mismatched account is already refused by the claim).
--
-- NOTE for the parked P1181 branch: it redefines this function from the P979 body. Rebase its
-- redefinition onto this one before it ships, or it will drop changes 1 and 2.

CREATE OR REPLACE FUNCTION public.update_delivery_status_by_token(
  p_token UUID,
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id      UUID;
  v_letter_id        UUID;
  v_current_status   TEXT;
  v_current_rank     INTEGER;
  v_new_rank         INTEGER;
  v_sender_id        UUID;
  v_current_receiver UUID;
  v_invite_open      BOOLEAN;
BEGIN
  SELECT ld.id, ld.letter_id, ld.status, cl.sender_id, ld.receiver_profile_id,
         (ld.invitation_expires_at IS NULL OR ld.invitation_expires_at > now())
  INTO v_delivery_id, v_letter_id, v_current_status, v_sender_id, v_current_receiver,
       v_invite_open
  FROM letter_deliveries ld
  JOIN clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.invitation_token = p_token
    AND cl.status = 'sealed'
  LIMIT 1
  FOR UPDATE OF ld;

  IF v_delivery_id IS NULL THEN
    RETURN false;
  END IF;

  -- P684: reject anonymous callers on one-to-many letters only
  IF (SELECT mode FROM clarity_letters WHERE id = v_letter_id) = 'one-to-many'
     AND auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required for one-to-many responses';
  END IF;

  -- P1491: recipient-side only — the sender cannot record progress on their own letter.
  IF auth.uid() IS NOT NULL AND auth.uid() = v_sender_id THEN
    RETURN false;
  END IF;

  -- P1491: a signed-in caller must not conflict with the delivery's bound recipient.
  IF auth.uid() IS NOT NULL AND v_current_receiver IS NOT NULL
     AND v_current_receiver <> auth.uid() THEN
    RETURN false;
  END IF;

  -- P979 (restored P651): forward-only guard. Reject backward transitions so a
  -- token holder can't drive their own delivery's status backward (e.g.
  -- completed → opened), corrupting the sender's progress display.
  v_current_rank := CASE v_current_status
    WHEN 'sent' THEN 1 WHEN 'opened' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;
  v_new_rank := CASE p_status
    WHEN 'sent' THEN 1 WHEN 'opened' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'completed' THEN 4 ELSE 0 END;

  IF v_new_rank <= v_current_rank THEN
    RETURN true; -- no-op, not an error
  END IF;

  UPDATE letter_deliveries
  SET
    status = p_status,
    opened_at = CASE WHEN p_status = 'opened' AND opened_at IS NULL THEN now() ELSE opened_at END,
    completed_at = CASE WHEN p_status = 'completed' AND completed_at IS NULL THEN now() ELSE completed_at END,
    -- P1491: bind an unbound delivery only inside the invitation window (as claim_letter_delivery).
    receiver_profile_id = CASE
      WHEN v_current_receiver IS NULL AND v_invite_open THEN auth.uid()
      ELSE receiver_profile_id
    END
  WHERE id = v_delivery_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.update_delivery_status_by_token(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_delivery_status_by_token(UUID, TEXT) FROM anon, authenticated;
-- The recipient path works signed out (one-to-one letters), so anon keeps EXECUTE — see
-- scripts/anon-execute-allowlist.txt.
GRANT EXECUTE ON FUNCTION public.update_delivery_status_by_token(UUID, TEXT) TO anon, authenticated, service_role;
