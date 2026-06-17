ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS reminder_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS feedback_attempted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_event_rsvps_reminder_dispatch
  ON public.event_rsvps (reminder_scheduled_at)
  WHERE reminder_scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_rsvps_feedback_dispatch
  ON public.event_rsvps (feedback_scheduled_at)
  WHERE feedback_scheduled_at IS NOT NULL;
