-- P1095: retire the dead points.context column.
--
-- requires-frontend: 5826463c
--   ("fix(p1095): drop 'context' from all three points select lists"). NOT
--   client-safe. Originally this marker named cce676d8, which removed only the
--   MAPPER lines and left `context` in three explicit PostgREST select lists
--   (docs-service once, stories-service twice) — so the marker pointed at a
--   commit that did not complete the job. Found in review 2026-09-03.
--   despite the column carrying no data: src/app/data/docs-service.ts named
--   `context` inside an explicit embedded column list on `points` before that
--   commit, and PostgREST answers a select naming a dropped column with 42703
--   for the WHOLE query. Applying this ahead of that bundle therefore does not
--   blank a field — it fails every story/doc read that embeds points. The
--   other six readers (feed card, point detail page, three live-session
--   renderers, letter preload) go through `select('*')` or a mapper and would
--   have degraded to undefined; docs-service is the one that hard-fails, which
--   is why the coupling is real. migrate.sh holds the prod apply until
--   cce676d8 is an ancestor of origin/main.
--
--   No client WRITE path breaks either way: createPoint's INSERT named
--   `context` before cce676d8, so it too must not run against the dropped
--   column — same marker, same reason.
--
-- Data loss: none. The prod non-null count is zero, verified with the
-- service-role key (bypasses RLS, so private rows are counted too), recorded in
-- the spec's Done-When.
--
-- Out-of-band cleanup, folded into this migration rather than filed
-- separately: TEST (gfjctyxqlwexxwsmkakq) carries a function,
-- create_point_with_position(text, position_type, text, text[], uuid), that
-- is NOT DEFINED IN ANY MIGRATION FILE (confirmed:
-- `grep -rli "point_with_position" supabase/migrations/` returns zero hits)
-- and references points.context in its INSERT. It does not exist on prod
-- (confirmed: absent from prod's PostgREST OpenAPI path listing) and has no
-- client caller (the only other reference,
-- `src/tests/p523-point-references.test.ts`, is fully commented out). It is
-- exercised only by `e2e/integration/p523-point-references-migration.spec.ts`,
-- which this commit marks `test.skip` (P1095 + P1217 retirement lane).
--
-- The DO block below drops that function by catalog lookup (any signature)
-- IF it exists — a no-op on prod, a cleanup on test — before the column drop,
-- so the DROP COLUMN never fails on a dependent function that Postgres can
-- see but this repo's migration history cannot.

DO $$
DECLARE
  v_oid oid;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_point_with_position'
  LIMIT 1;

  IF v_oid IS NOT NULL THEN
    EXECUTE format('DROP FUNCTION %s', v_oid::regprocedure);
    RAISE NOTICE 'P1095: dropped out-of-band function create_point_with_position (oid %)', v_oid;
  ELSE
    RAISE NOTICE 'P1095: create_point_with_position not present — nothing to clean up (expected on prod)';
  END IF;
END $$;

-- Record what is about to be destroyed. Prod's non-null count was measured as
-- zero with the service-role key (spec Done-When); TEST carried 3374 non-null
-- rows of seeded demo data at authoring time, which is why this is a NOTICE and
-- not a hard precondition. A DROP COLUMN is not recoverable from the row data,
-- so re-run the prod count immediately before applying rather than trusting the
-- number in the spec.
DO $$
DECLARE
  v_n bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'points' AND column_name = 'context'
  ) THEN
    EXECUTE 'SELECT count(*) FROM public.points WHERE context IS NOT NULL' INTO v_n;
    RAISE NOTICE 'P1095: dropping points.context with % non-null value(s)', v_n;
  END IF;
END $$;

ALTER TABLE public.points DROP COLUMN IF EXISTS context;

-- ============================================================================
-- Verification
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'points' AND column_name = 'context'
  ) THEN
    RAISE EXCEPTION 'P1095: points.context still present after DROP COLUMN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_point_with_position'
  ) THEN
    RAISE EXCEPTION 'P1095: create_point_with_position still present after cleanup';
  END IF;
END $$;
