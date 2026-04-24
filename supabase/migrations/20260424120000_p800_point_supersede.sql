-- new function
-- P800: Point supersede — schema + invariant trigger
--
-- Adds points.superseded_by (pointer to the replacement point) plus a
-- BEFORE INSERT OR UPDATE trigger that enforces the four invariants from
-- features/p800_point_supersede_schema.md:
--
--   1. target row exists
--   2. source and target share the same variant — i.e. both either carry
--      the 'misunderstanding' system_tag or both do not (helper function)
--   3. target is a head (target.superseded_by IS NULL)
--   4. no cycle (walk from NEW.superseded_by, hard cap 100 hops; reject
--      if NEW.id is reachable). Defense-in-depth — invariant 3 already
--      prevents cycle formation, but the walk guards against concurrent
--      writes and future relaxation of invariant 3.
--
-- RLS posture: points has no UPDATE policy (migration 20260204, lines
-- 343-354 — "Points are not editable after creation"). Authenticated
-- PostgREST clients cannot UPDATE points at all. This trigger runs only
-- on service_role writes (migrations, SECURITY DEFINER functions) and
-- rejects invalid writes before they commit.

BEGIN;

-- ============================================================================
-- 1. Column + index
-- ============================================================================

ALTER TABLE points
  ADD COLUMN IF NOT EXISTS superseded_by UUID
    REFERENCES points(id) ON DELETE SET NULL
    DEFAULT NULL;

-- Reverse lookup: "what point supersedes <id>?" — used by the version-history
-- backward walk on point detail page.
CREATE INDEX IF NOT EXISTS idx_points_superseded_by
  ON points(superseded_by)
  WHERE superseded_by IS NOT NULL;

-- ============================================================================
-- 2. Variant-match helper
-- ============================================================================
-- Returns true iff both tag arrays agree on membership of 'misunderstanding'.
-- IS NOT DISTINCT FROM handles NULL arrays safely (both NULL → true).

CREATE OR REPLACE FUNCTION same_variant_misunderstanding(
  src_tags text[],
  tgt_tags text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('misunderstanding' = ANY(src_tags))
         IS NOT DISTINCT FROM
         ('misunderstanding' = ANY(tgt_tags));
$$;

-- ============================================================================
-- 3. Invariant enforcement trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_supersede_invariants()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_row         points%ROWTYPE;
  walker_id          UUID;
  walker_next        UUID;
  hops               INTEGER := 0;
  MAX_HOPS  CONSTANT INTEGER := 100;
BEGIN
  -- Null is always allowed (means: this point is a head).
  IF NEW.superseded_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Invariant 0: direct self-reference forbidden.
  IF NEW.superseded_by = NEW.id THEN
    RAISE EXCEPTION
      'P800: point % cannot supersede itself', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invariant 1: target row must exist.
  SELECT * INTO target_row FROM points WHERE id = NEW.superseded_by;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'P800: superseded_by target % does not exist', NEW.superseded_by
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Invariant 2: same variant (misunderstanding membership must agree).
  IF NOT same_variant_misunderstanding(NEW.system_tags, target_row.system_tags) THEN
    RAISE EXCEPTION
      'P800: cross-variant supersede rejected — source and target must share misunderstanding tag membership'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invariant 3: target must be a head (target.superseded_by IS NULL).
  IF target_row.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION
      'P800: superseded_by target % is not a head (already superseded by %) — supersede only a current head',
      target_row.id, target_row.superseded_by
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invariant 4: no cycle. Walk from NEW.superseded_by forward; reject
  -- if NEW.id is reachable within MAX_HOPS. Given invariant 3, the walk
  -- should terminate at NULL after one hop in normal operation — the
  -- loop guards against concurrent writes and future invariant relaxation.
  walker_id := NEW.superseded_by;
  WHILE walker_id IS NOT NULL AND hops < MAX_HOPS LOOP
    IF walker_id = NEW.id THEN
      RAISE EXCEPTION
        'P800: cycle detected — % would close a supersede loop', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT superseded_by INTO walker_next FROM points WHERE id = walker_id;
    walker_id := walker_next;
    hops := hops + 1;
  END LOOP;

  IF hops >= MAX_HOPS THEN
    RAISE EXCEPTION
      'P800: supersede chain exceeds % hops — refusing to write', MAX_HOPS
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. Trigger binding
-- ============================================================================

DROP TRIGGER IF EXISTS trg_enforce_supersede_invariants ON points;
CREATE TRIGGER trg_enforce_supersede_invariants
  BEFORE INSERT OR UPDATE OF superseded_by ON points
  FOR EACH ROW
  EXECUTE FUNCTION enforce_supersede_invariants();

COMMENT ON COLUMN points.superseded_by IS
  'P800: points to the successor point in this (st-group, variant) chain. '
  'NULL = this point is the current head. Write-gated by RLS (no UPDATE policy on points) '
  'and by trg_enforce_supersede_invariants (rejects cross-variant, non-head target, cycles, '
  'self-reference, and chains > 100 hops).';

COMMIT;
