-- P1010 follow-up: founder-confirmed name for the Chiang Mai organization.
--
-- client-safe: two guarded UPDATEs on public.organization rows. No column, RLS
--   policy, grant, or function is altered. Deployed clients read `name` as opaque
--   display text — nothing keys off its value (routing is by `slug`, unchanged).
-- new function: none.
--
-- Why a separate migration rather than editing the seed in 20260724120000: that
-- migration is already applied on TEST, so an in-place edit would never re-run
-- there. The seed IS also corrected so a fresh database inserts the right name
-- immediately — which makes both UPDATEs below no-ops on a fresh apply. They are
-- guarded on the exact superseded value so a later founder rename is never
-- silently reverted by a re-apply (.claude/rules/database.md — seeds must not
-- override user-set state).

UPDATE public.organization
   SET name = 'Clarity Practice Community · Chiang Mai'
 WHERE slug = 'cm'
   AND name = 'Clarity Community · Chiang Mai';

-- The About prose names the organization in its opening clause, so the rename has
-- to reach it too or About introduces itself by a name that appears nowhere else.
-- Still [FOUNDER DECISION: About copy] — this only tracks the rename, it does not
-- settle the wording.
UPDATE public.organization
   SET description = replace(description, 'Clarity Community · Chiang Mai', 'Clarity Practice Community · Chiang Mai')
 WHERE slug = 'cm'
   AND description LIKE '%Clarity Community · Chiang Mai%';
