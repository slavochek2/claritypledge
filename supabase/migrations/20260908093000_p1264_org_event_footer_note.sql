-- P1264: a standing note the organiser appends to every one of their event pages.
--
-- Lives on `organization`, not on `events`, because the text is a property of the
-- GROUP rather than of any one hike: it is the same words on every event the org
-- runs, and writing it per-event means retyping it and letting the copies drift.
-- It started life as a hand-typed "PS." paragraph at the end of one event's
-- description, which also forced it ABOVE the group-chat button, since anything
-- inside the description renders before the blocks that follow it.
--
-- Nullable with no default: an org without one renders no block at all.
--
-- Visibility: this column inherits `organization`'s EXISTING gate, it does not
-- widen it. RLS on `organization` is `USING (visibility = 'public')` (P1010), so
-- a PRIVATE org's note is not world-readable — the row simply does not come back
-- and getEventOrgFooterNote returns null with no explicit check of its own. An
-- earlier draft of this comment said the column was "public like the rest of
-- organization", which was wrong: organization is public-by-default, not
-- public-unconditionally.
ALTER TABLE organization
  ADD COLUMN IF NOT EXISTS event_footer_note TEXT;

COMMENT ON COLUMN organization.event_footer_note IS
  'P1264: optional standing note rendered as the last block on every event page for this org. Markdown, rendered through renderMarkdownSafe. Nullable — no note, no block.';
