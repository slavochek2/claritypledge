-- diffed against: 20261021100000_p1515_artifact_sharing.sql (_canvas_box_tags), its only live body. The body below is
--   byte-for-byte its source except the ARRAY list.
-- P1535: the Clarity Canvas has nine boxes, not eleven. Unfair Advantage and Cost Structure are dropped.
--
-- client-safe: narrows one internal list; no signature, grant or policy changes. A point whose only box is a
--   dropped one is no longer inside its canvas, so its own visibility (private) decides who reads it: the
--   owner alone. The page already shows no such point (P1535).
--
-- WHAT CHANGES
--   1. _canvas_box_tags() lists the nine boxes of src/lib/canvas-boxes.ts CANVAS_BOX_TAGS (a drift test pins
--      the two). Body otherwise byte-for-byte 20261021100000_p1515_artifact_sharing.sql.

CREATE OR REPLACE FUNCTION public._canvas_box_tags()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'canvas:segments', 'canvas:problem', 'canvas:solution',
    'canvas:channels', 'canvas:revenue', 'canvas:metrics',
    'canvas:love', 'canvas:good-at', 'canvas:world-needs'
  ]::text[]
$$;

REVOKE ALL ON FUNCTION public._canvas_box_tags() FROM PUBLIC, anon, authenticated;
