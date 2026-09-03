-- P1095: retire the dead points.context column.
--
-- requires-frontend: 5826463c
--   ("fix(p1095): drop 'context' from all three points select lists").
--
--   NOT client-safe, despite the column carrying no data. Three read paths
--   named `context` inside an EXPLICIT embedded column list on `points`, and
--   PostgREST answers a select naming a dropped column with 42703 for the
--   WHOLE query:
--     src/app/data/docs-service.ts        STORY_WITH_AUTHOR_AND_POINTS_SELECT (getDoc)
--     src/app/data/stories-service-real.ts  getStoryWithPoints
--     src/app/data/stories-service-real.ts  getStoriesByAuthorWithPoints
--
--   NONE OF THE THREE HARD-FAILS. Each logs the PostgrestError and then
--   substitutes an empty collection: getDoc returns the doc with `stories: []`
--   (docs-service.ts:315-320), and both stories-service readers fall through
--   `if (pointsError) logDbError(...)` (stories-service-real.ts:281, :419) to
--   `(storyPoints || [])`. So applying this ahead of the client bundle does
--   not blank one field and does not raise anything a user would see as an
--   outage — it SILENTLY DEGRADES every doc, story-detail and profile read to
--   ZERO POINTS. That is worse than a hard failure: the pages still render,
--   just without their points, and only a Sentry breadcrumb records why.
--   An earlier version of this header claimed docs-service hard-fails. It
--   does not. Corrected in review, 2026-09-03.
--
--   The other six readers (feed card, point detail page, three live-session
--   renderers, letter preload) went through `select('*')` or a mapper and
--   would have degraded to undefined — real, but not what makes the coupling
--   mandatory. The three explicit select lists are.
--
--   This marker originally named cce676d8, which removed only the MAPPER
--   lines and left all three select lists intact — a commit that did not
--   complete the job. 5826463c is the one that does, and migrate.sh holds the
--   prod apply until 5826463c is an ancestor of origin/main.
--
--   POST-SHIP REPAIR REQUIRED: /ship cherry-picks, so 5826463c can never
--   become an ancestor of origin/main under this id. After this branch ships,
--   find the cherry-picked commit on main by its subject line, repoint this
--   marker at it, and verify with
--   `git merge-base --is-ancestor <new-sha> main`. Two live instances of the
--   same breakage were repaired on main in 6f33d915; the systemic fix is
--   backlog spec P1106. Until the marker is repointed, migrate.sh exits 1 on
--   the ENTIRE pending set, not just this file.
--
--   The client WRITE path is not silent, and is covered by the same marker:
--   before cce676d8 createPoint's INSERT named `context`; PostgREST rejects
--   an insert naming an unknown column with PGRST204, and createPoint logs
--   and returns null, so point creation fails outright.
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
