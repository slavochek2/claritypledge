-- P275: Add point_positions column to clarity_live_turns
-- Live session positions are ephemeral game state that must be stored outside
-- point_positions table, which blocks writes from unverified guests (is_verified=false).
-- No RLS change needed — clarity_live_turns already allows writes from all authenticated users.

ALTER TABLE public.clarity_live_turns
  ADD COLUMN IF NOT EXISTS point_positions JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.clarity_live_turns.point_positions IS
  'Positions set by this participant during the round, keyed by point UUID. '
  'Structure: { "<point_id>": "<position_type>" }. '
  'Populated by P275/P272 live session position updates. '
  'Unverified guests use this column because point_positions table requires is_verified=true.';
