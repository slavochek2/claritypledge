-- Directory ordering becomes explicit instead of alphabetical-by-name.
--
-- client-safe: one additive nullable column on public.organization plus two
--   guarded UPDATEs. No column is dropped or renamed, no RLS policy, grant or
--   function is altered. `GRANT SELECT ON public.organization TO anon,
--   authenticated` (20260724120000) is table-level, not column-gated, so the new
--   column is readable by deployed clients with no grant change. A client that
--   has not shipped the ORDER BY yet simply ignores it.
-- new function: none.
--
-- WHY. listPublicOrganizations() ordered by `name` ascending. That was a stable
-- rule only while the names happened to sort the way the founder wanted. When
-- · Chiang Mai was renamed to "Communication Activism Community · Chiang Mai"
-- (20260907120000), "Cl" < "Co" silently demoted it below "Clarity Practice
-- Community · Online" — a directory reordering nobody asked for, caused by a
-- copy edit. Ordering that is an accident of the copy will keep breaking every
-- time the copy changes.
--
-- Nullable, not NOT NULL DEFAULT: an unranked org must sort AFTER every ranked
-- one, which the client expresses as nulls-last. A numeric default would instead
-- tie every unranked org at one rank and reintroduce name as the real tiebreak.
-- Gaps of 10 leave room to insert between two orgs without renumbering.

ALTER TABLE public.organization
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

COMMENT ON COLUMN public.organization.display_order IS
  'Directory sort rank, ascending, nulls last (unranked orgs fall to the end and '
  'sort among themselves by name). Numbered in gaps of 10 so an org can be '
  'inserted between two others without renumbering. Founder-owned ordering — do '
  'not derive it from member counts or event activity.';

-- Guarded on display_order IS NULL so a re-apply cannot revert a later
-- founder reordering (.claude/rules/database.md).
UPDATE public.organization
   SET display_order = 10
 WHERE slug = 'cm'
   AND display_order IS NULL;

UPDATE public.organization
   SET display_order = 20
 WHERE slug = 'online'
   AND display_order IS NULL;
