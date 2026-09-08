-- P1264: the hike's route link, as its own column instead of a line buried in
-- events.description.
--
-- Public, unlike event_private_info.group_chat_url: this is decision-support for
-- someone who has not yet registered, and gating it would defeat the point. No
-- CHECK constraint — a host pasting a non-http value is expected to render no
-- block at all (guarded by safeLinkHref at render time), not to be rejected at
-- write time. There is also no UI form yet; only a programmatic write sets it.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS trail_url TEXT;

COMMENT ON COLUMN events.trail_url IS
  'P1264: optional public external route link (AllTrails/Komoot/etc). Nullable, no UI form yet — written programmatically. Guarded at render by safeLinkHref; a non-http(s) value renders no block rather than being rejected here.';
