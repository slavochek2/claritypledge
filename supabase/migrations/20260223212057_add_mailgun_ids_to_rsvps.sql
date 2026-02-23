-- Add mailgun_message_ids to event_rsvps to enable cancellation of scheduled emails
-- Stores { reminder: "msg-id", feedback: "msg-id" } — confirmation is immediate (no cancellation needed)
ALTER TABLE public.event_rsvps
  ADD COLUMN IF NOT EXISTS mailgun_message_ids JSONB;
