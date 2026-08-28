-- P1179: per-event extra entries for the room's "Links" menu.
--
-- Shape: a JSONB array of {tag, label?} objects. A TAG, never a path or URL —
-- that is what keeps the open-redirect invariant enforceable by construction
-- (src/app/data/event-links.ts resolves a tag to /stake/:tag and nothing else).
--
-- Default '[]' rather than NULL so every pre-existing row reads as "no extras"
-- without a backfill and without the render path needing a null branch. The
-- column is additive and inert after a code revert (spec: Rollback Strategy).
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Every pre-existing row must read as an empty list, not NULL. The DEFAULT above
-- already backfills on ALTER in PG11+, this is belt-and-braces for the assertion
-- in e2e/integration/p1179-events-links-column.spec.ts (DW-5).
UPDATE events SET links = '[]'::jsonb WHERE links IS NULL;

-- The column holds a JSON ARRAY and nothing else. Objects, scalars and strings
-- are rejected at write time so a malformed publish cannot reach the render path.
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_links_is_array;
ALTER TABLE events
  ADD CONSTRAINT events_links_is_array CHECK (jsonb_typeof(links) = 'array');

COMMENT ON COLUMN events.links IS
  'P1179: optional extra Links-menu entries, [{tag, label?}]. Written programmatically at publish time; no UI form. Tags only — never paths or URLs.';
