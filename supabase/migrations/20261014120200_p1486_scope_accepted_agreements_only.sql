-- P1486: an agreement makes two people related only once the partner has accepted it.
--
-- diffed against: 20260605150000_p878_search_profiles_rpc.sql
--   (p878_relationship_scope: the letter and witness arms are unchanged; the two agreement
--    arms are narrowed. Signature, volatility, invoker rights and search_path unchanged.)
--
-- client-safe: no deployed client calls this function — EXECUTE has been revoked from client
--   roles since P878, and `grep -rn p878_relationship_scope src supabase/functions` finds no
--   caller outside tests. Its only consumers are four SECURITY DEFINER RPCs (search_profiles,
--   create_agreement_with_profile, seal_and_send_letter, add_recipient_to_sealed_letter), whose
--   signatures and return shapes do not change.
--
-- Why. P878 meant the agreement arms to count agreements "accepted at some point"; P1446 states
-- the rule for every input to this function: it must be a fact the other party took part in.
-- The agreement arms now check acceptance directly. Details: .private/docs/security-log.md (P1486).

BEGIN;

CREATE OR REPLACE FUNCTION public.p878_relationship_scope(p_caller uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  -- Letters sent: I am sender, counterpart is receiver
  SELECT ld.receiver_profile_id
  FROM public.clarity_letters cl
  JOIN public.letter_deliveries ld ON ld.letter_id = cl.id
  WHERE cl.sender_id = p_caller
    AND ld.receiver_profile_id IS NOT NULL
    AND ld.receiver_profile_id != p_caller

  UNION

  -- Letters received: I am receiver, counterpart is sender
  SELECT cl.sender_id
  FROM public.letter_deliveries ld
  JOIN public.clarity_letters cl ON cl.id = ld.letter_id
  WHERE ld.receiver_profile_id = p_caller
    AND cl.sender_id != p_caller

  UNION

  -- Agreements: I am creator. Only agreements the partner accepted (P878 mitigation 5; P1486):
  -- active ones (only the accept path makes a row active, P1451), and ended ones that carry the
  -- partner's signature, which only the accept path writes.
  SELECT ca.partner_profile_id
  FROM public.clarity_agreements ca
  WHERE ca.creator_profile_id = p_caller
    AND ca.partner_profile_id IS NOT NULL
    AND (ca.status = 'active'
         OR (ca.status = 'terminated' AND ca.partner_signed_at IS NOT NULL))

  UNION

  -- Agreements: I am partner (accepted only — same rule as above)
  SELECT ca.creator_profile_id
  FROM public.clarity_agreements ca
  WHERE ca.partner_profile_id = p_caller
    AND (ca.status = 'active'
         OR (ca.status = 'terminated' AND ca.partner_signed_at IS NOT NULL))

  UNION

  -- Witnesses: I witnessed someone
  SELECT w.profile_id
  FROM public.witnesses w
  WHERE w.witness_profile_id = p_caller

  UNION

  -- Witnesses: someone witnessed me (witness_profile_id nullable — unregistered endorsers)
  SELECT w.witness_profile_id
  FROM public.witnesses w
  WHERE w.profile_id = p_caller
    AND w.witness_profile_id IS NOT NULL
$$;

-- Internal helper, unchanged access: never executable by client roles. CREATE OR REPLACE keeps
-- the existing ACL; both REVOKE forms are restated so a fresh database ends in the same state.
REVOKE EXECUTE ON FUNCTION public.p878_relationship_scope(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.p878_relationship_scope(uuid) FROM anon, authenticated;

COMMENT ON FUNCTION public.p878_relationship_scope(uuid) IS
  'P878: SETOF profile ids the caller shares a letter/agreement/witness relationship with. '
  'Agreements count only once the partner accepted (P1486). '
  'Internal helper — not executable by client roles.';

-- Post-conditions: the new rule is in force, the helper stays closed to client roles, and its
-- invoker rights and empty search_path are unchanged.
DO $$
DECLARE
  v_def text;
  v_secdef boolean;
  v_cfg text[];
BEGIN
  SELECT pg_get_functiondef(p.oid), p.prosecdef, p.proconfig
    INTO v_def, v_secdef, v_cfg
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'p878_relationship_scope';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'P1486: p878_relationship_scope not found';
  END IF;
  IF (length(v_def) - length(replace(v_def, 'partner_signed_at IS NOT NULL', '')))
     / length('partner_signed_at IS NOT NULL') <> 2 THEN
    RAISE EXCEPTION 'P1486: both agreement arms must require the partner''s acceptance';
  END IF;
  IF v_def ILIKE '%status IN (''active'', ''terminated'')%' THEN
    RAISE EXCEPTION 'P1486: the pre-P1486 agreement predicate is still present';
  END IF;
  IF v_secdef THEN
    RAISE EXCEPTION 'P1486: p878_relationship_scope must stay SECURITY INVOKER';
  END IF;
  IF v_cfg IS NULL OR NOT ('search_path=""' = ANY (v_cfg)) THEN
    RAISE EXCEPTION 'P1486: p878_relationship_scope must keep an empty search_path (got %)', v_cfg;
  END IF;
  IF has_function_privilege('anon', 'public.p878_relationship_scope(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.p878_relationship_scope(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'P1486: client roles must not execute p878_relationship_scope';
  END IF;
END;
$$;

COMMIT;
