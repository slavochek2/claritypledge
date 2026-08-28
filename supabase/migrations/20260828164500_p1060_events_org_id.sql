-- P1060: Events belong to an organization.
--
-- Three things, in this order (the order is load-bearing — the backfill must run
-- BEFORE org #2 is seeded, so every row it touches is unambiguously Chiang Mai's):
--   1. events.org_id — nullable FK → organization, indexed
--   2. backfill the 8 named Chiang Mai events by EXPLICIT SLUG (never a location match)
--   3. seed "Clarity Practice Community · Online" (slug: online) + its organizer row
--
-- client-safe: additive only — one nullable column, one index, one INSERT ... ON
-- CONFLICT DO NOTHING. No column is dropped, retyped or revoked, and no policy is
-- touched, so a deployed client that has never heard of org_id is unaffected.
--
-- EVENTS RLS IS UNCHANGED BY THIS MIGRATION — stated here because the spec's Risks
-- section requires it in the migration comment (P1060, "MITIGATE — RLS drift"). The
-- events SELECT policy stays `USING (true)` (20260118_create_events.sql:41): an
-- org-scoped event is exactly as world-readable as an orgless one. Org scoping in
-- this spec is a QUERY FILTER, not a policy. The readable-by-all / joinable-by-some
-- split arrives with p1183, not here.

-- ============================================================================
-- 1. The edge (D1 — nullable)
-- ============================================================================
-- Nullable on purpose: /events/new is open to any logged-in user with no org
-- context, and the 2 Ko Phangan events below genuinely belonged to no
-- organization because none existed. NOT NULL would force every ad-hoc event
-- into a community it is not part of.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organization(id);

CREATE INDEX IF NOT EXISTS idx_events_org_id ON public.events(org_id);

COMMENT ON COLUMN public.events.org_id IS
  'P1060: the Clarity Organization this event belongs to. NULL = belongs to no organization (an ad-hoc event from /events/new). Not a visibility control — events RLS is USING (true) regardless.';

-- ============================================================================
-- 2. Backfill — EXPLICIT SLUG ENUMERATION, with a row-count assertion (D2)
-- ============================================================================
-- Classified against prod on 2026-08-28 (read-only /rest/v1/events, anon key):
-- 10 events exist, 8 are Chiang Mai's and 2 are on Ko Phangan. A
-- `location LIKE '%Chiang Mai%'` heuristic would MISCLASSIFY FOUR of the eight —
-- 3 rows store a Google Maps URL instead of an address, one stores a Thai-script
-- street address, and one resolves only by following a shortened link. So this is
-- a literal list, never a classifier.
--
-- On the assertion: the spec asks the migration to "assert it touched exactly 8
-- rows and fail loudly if not". Taken literally that hard-fails on any database
-- that never carried the prod rows (a fresh test project has none of these
-- slugs), which would make the migration unappliable to test and so untestable.
-- The assertion is therefore written as: the UPDATE must touch EXACTLY the named
-- rows that are PRESENT, it must never touch more than the 8 named, and a
-- database that does not carry all 8 says so loudly instead of passing quietly.
-- The 2 Ko Phangan slugs are re-asserted NULL afterwards, so "backfilled the
-- wrong set" fails here rather than becoming a permanent false historical claim.
DO $$
DECLARE
  cm_slugs TEXT[] := ARRAY[
    'clarity-dinner-1-exploring-coordination-understanding-2026-02-12-ld5e',
    'ai-run-1',
    'ai-running-club-chiang-mai-2-sun-may-24-2026-05-17-b0rc',
    'ai-running-club-chiang-mai-3-sun-may-31-2026-05-24-gfmi',
    'how-well-do-your-ai-clients-and-partners-understand-your-business-model-2026-06-08-bpl3',
    'clarity-hike-doi-pui-peak-double-loop-2026-06-21-w4k2mj',
    'clarity-hike-buddha-footprint-doi-pui-peak-2026-07-05-76dde6',
    'social-hike-buddhas-footprint-trail-2026-08-30-9099c3'
  ];
  kp_slugs TEXT[] := ARRAY[
    'clarity-run-phaeng-noi-waterfall-loop-2026-02-25-jizou5',
    'clarity-lab-koh-phangan-2026-03-12-ad3385'
  ];
  cm_org_id  UUID;
  present    INT;
  touched    INT;
  kp_wrong   INT;
BEGIN
  SELECT id INTO cm_org_id FROM public.organization WHERE slug = 'cm';

  IF cm_org_id IS NULL THEN
    RAISE WARNING 'P1060: no "cm" organization on this database — backfill skipped (0 of 8). Apply the p1010 seed first if this is unexpected.';
    RETURN;
  END IF;

  SELECT count(*) INTO present FROM public.events WHERE slug = ANY(cm_slugs);

  UPDATE public.events SET org_id = cm_org_id WHERE slug = ANY(cm_slugs);
  GET DIAGNOSTICS touched = ROW_COUNT;

  -- The literal 8: the enumerated set. Touching more than 8 rows means the list
  -- matched something it should not have, and is a hard failure.
  IF touched > 8 THEN
    RAISE EXCEPTION 'P1060 backfill touched % rows; the enumerated Chiang Mai set is exactly 8', touched;
  END IF;

  -- Touched must equal what was present. A mismatch means a concurrent write or a
  -- constraint silently dropped a row — not something to backfill past.
  IF touched <> present THEN
    RAISE EXCEPTION 'P1060 backfill touched % rows but % of the 8 named slugs are present — refusing to write a partial historical claim', touched, present;
  END IF;

  IF touched <> 8 THEN
    RAISE WARNING 'P1060: backfilled % of the 8 named Chiang Mai events — this database does not carry the full prod set. Backfill correctness is UNVERIFIED here.', touched;
  ELSE
    RAISE NOTICE 'P1060: backfilled exactly 8 Chiang Mai events to org "cm".';
  END IF;

  -- The 2 Ko Phangan events stay NULL, deliberately: they belonged to no
  -- organization because none existed. Assert it rather than assume it.
  SELECT count(*) INTO kp_wrong
  FROM public.events WHERE slug = ANY(kp_slugs) AND org_id IS NOT NULL;
  IF kp_wrong > 0 THEN
    RAISE EXCEPTION 'P1060: % Ko Phangan event(s) carry an org_id — they must stay NULL (D2)', kp_wrong;
  END IF;
END $$;

-- ============================================================================
-- 3. Organization #2 (D3, D7) — seeded AFTER the backfill
-- ============================================================================
-- blurb is NULL on purpose (D7): the founder does not yet know who · Online is
-- for, and a blurb guessed now is a positioning claim made before the
-- positioning exists. org-header.tsx already guards `{org.blurb && …}`, so NULL
-- renders as absence with no code change. NOT a placeholder string — the
-- Non-Goal "Do NOT invent the · Online blurb" resolves to exactly this NULL.
INSERT INTO public.organization (slug, name, blurb, visibility, has_events) VALUES
  ('online', 'Clarity Practice Community · Online', NULL, 'public', true)
ON CONFLICT (slug) DO NOTHING;

-- Organizer membership, resolved by PUBLIC PROFILE SLUG (never email), same
-- pattern and same slug as the p1010 'cm' seed. INSERT ... SELECT so a missing
-- profile yields zero rows instead of failing the migration.
INSERT INTO public.membership (org_id, user_id, role, terms_version)
SELECT o.id, p.id, 'organizer', '5'
FROM public.organization o
JOIN public.profiles p ON p.slug = 'slava'
WHERE o.slug = 'online'
ON CONFLICT (org_id, user_id) DO NOTHING;
