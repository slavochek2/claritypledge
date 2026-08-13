-- P1076: Org invite link — silent attribution column on membership.
--
-- client-safe: additive only. One new nullable column + one new BEFORE INSERT
-- trigger on membership; no existing column, RLS policy, or grant is altered
-- except the SELECT grant below, which is narrowed to EXCLUDE the new column
-- (existing columns keep exactly the same read access they have today).
--
-- Design source: features/p1076_org_invite_link.md (Solution 3, Risks).
--
-- Why a trigger and not an RPC: P1010's membership INSERT is a deliberate
-- "act as yourself, on your own row" client insert gated entirely by RLS
-- (Decision 5, 20260724120000_p1010_organizations_membership.sql) — no RPC,
-- no SECURITY DEFINER for the mutation. Introducing an RPC just for this one
-- column would reverse that invariant. A BEFORE INSERT trigger keeps the
-- plain client INSERT and still guarantees server-side validation: a client
-- can send any invited_by value (or omit it), and the join always succeeds —
-- a value that does not resolve to an existing profiles row is silently
-- nulled out before the row is written, never rejected.
--
-- Why column-gated SELECT: membership already has a table-level
-- `GRANT SELECT ON public.membership TO authenticated, anon` (P1010). Adding
-- invited_by under that grant would make "who invited whom" trivially
-- queryable via `?select=invited_by` — directly contradicting the spec's
-- Non-Goal ("Do NOT display attribution anywhere ... never echo the raw
-- value back into the page"). Mirrors the existing profiles-PII column-gate
-- pattern (P877): REVOKE the table-level grant, re-GRANT SELECT on the
-- explicit safe column list. get_organization_members (SECURITY DEFINER)
-- is unaffected — it already builds its own column list and never selects
-- invited_by.

-- ============================================================================
-- 1. invited_by column
-- ============================================================================
ALTER TABLE public.membership
  ADD COLUMN invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================================
-- 2. BEFORE INSERT trigger — null out a forged/nonexistent invited_by
-- ============================================================================
-- new function
CREATE OR REPLACE FUNCTION public.membership_validate_invited_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.invited_by IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.invited_by) THEN
    NEW.invited_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER membership_validate_invited_by
  BEFORE INSERT ON public.membership
  FOR EACH ROW
  EXECUTE FUNCTION public.membership_validate_invited_by();

COMMENT ON COLUMN public.membership.invited_by IS
  'P1076: silent attribution — who shared the invite link that was used to join. Never displayed in the UI. A value that does not resolve to an existing profiles row is nulled by membership_validate_invited_by() before insert; the join itself never fails because of this column.';

-- ============================================================================
-- 3. Column-gate SELECT (never expose invited_by to anon/authenticated)
-- ============================================================================
REVOKE SELECT ON public.membership FROM authenticated, anon;
GRANT SELECT (id, org_id, user_id, role, accepted_at, terms_version)
  ON public.membership TO authenticated, anon;
