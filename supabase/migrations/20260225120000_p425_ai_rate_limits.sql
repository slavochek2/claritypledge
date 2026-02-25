-- P425: AI rate limiting table for story-guide-chat edge function
-- Tracks per-user API calls for burst and sustained rate limiting.
-- Burst: max 10 calls per 5 minutes
-- Sustained: max 30 calls per 60 minutes

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  called_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_rate_limits_user_window_idx
  ON ai_rate_limits (user_id, called_at);

-- RLS: users can only read their own rate limit rows (edge function uses service role to insert)
ALTER TABLE ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_rate_limits_select_own" ON ai_rate_limits
  FOR SELECT USING (auth.uid() = user_id);

-- Only the edge function (service role) can insert/delete — no client-side RLS needed for INSERT
