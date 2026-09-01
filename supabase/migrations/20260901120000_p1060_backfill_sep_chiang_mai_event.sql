-- P1060 follow-up: backfill the one Chiang Mai event created AFTER the snapshot.
--
-- client-safe: additive only — one UPDATE against one enumerated row. No schema
-- change, no policy change, no column dropped or retyped.
--
-- WHY THIS EXISTS. 20260828164500_p1060_events_org_id backfills eight Chiang Mai
-- events by explicit slug, classified against prod on 2026-08-28. That migration
-- had not yet been applied to prod when an eleventh event was created on
-- 2026-08-31: "Social Hike: Doi Pui - Ban Khun Chang Khian" (6 Sep). It is not in
-- the enumerated eight, so it would land org_id NULL — and it is Chiang Mai's only
-- remaining UPCOMING event, so /org/cm would show an empty Upcoming tab on the day
-- the column shipped. The parent migration's own guards do not catch this: it
-- asserts touched <= 8 and touched = present, both of which pass with a ninth
-- Chiang Mai event sitting untouched on disk. The spec anticipated exactly this
-- ("Re-verify before running… reconcile if any event was created or edited since").
--
-- Written as a NEW file rather than an edit to 20260828164500, which has already
-- been applied to the test database.
--
-- Location evidence (read-only /rest/v1/events, anon key, 2026-09-01):
--   location = https://www.google.com/maps/search/?api=1&query=Cafe+Leng+Doi+Pui
--   → Cafe Leng, Doi Pui — Doi Suthep–Pui National Park, Chiang Mai. Same trailhead
--     area as the two hikes already enumerated in the parent migration.
--
-- Re-verified 2026-09-01 against prod: 11 events total, all 8 named Chiang Mai
-- slugs present, both Ko Phangan slugs present and unclassified-by-design, and
-- EXACTLY ONE event in neither list — the row below. No other reconciliation is
-- outstanding.

DO $$
DECLARE
  sep_slug  TEXT := 'social-hike-doi-pui-ban-khun-chang-khian-2026-09-06-8b1c8a';
  cm_org_id UUID;
  touched   INT;
BEGIN
  SELECT id INTO cm_org_id FROM public.organization WHERE slug = 'cm';

  IF cm_org_id IS NULL THEN
    RAISE WARNING 'P1060 follow-up: no "cm" organization on this database — backfill skipped.';
    RETURN;
  END IF;

  -- Only writes a row that is still unassigned. If a human (or a later migration)
  -- has since given this event an org, that decision wins over this one.
  UPDATE public.events
     SET org_id = cm_org_id
   WHERE slug = sep_slug
     AND org_id IS NULL;
  GET DIAGNOSTICS touched = ROW_COUNT;

  -- Enumerated single row: more than one match means the slug is not unique and
  -- this migration is writing somewhere it was never classified against.
  IF touched > 1 THEN
    RAISE EXCEPTION 'P1060 follow-up: touched % rows for a single enumerated slug', touched;
  END IF;

  IF touched = 1 THEN
    RAISE NOTICE 'P1060 follow-up: backfilled 1 Chiang Mai event (%) to org "cm".', sep_slug;
  ELSE
    RAISE WARNING 'P1060 follow-up: 0 rows written — this database does not carry % as an unassigned event. Expected on test/local; UNEXPECTED on prod.', sep_slug;
  END IF;
END $$;
