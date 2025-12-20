-- Migration: Add explanation_requested_at to chat_messages
-- Purpose: Allow message authors to request listeners to explain back their message
-- Design: Timestamp (not boolean) for audit trail. NULL = no pending request.

-- Add column to track when explanation was requested
ALTER TABLE public.clarity_chat_messages
ADD COLUMN explanation_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create trigger to clear request when verification is created
-- This ensures the request is "answered" when someone explains back
CREATE OR REPLACE FUNCTION clear_explanation_request()
RETURNS TRIGGER AS $$
BEGIN
  -- Clear the request on the message being verified
  UPDATE public.clarity_chat_messages
  SET explanation_requested_at = NULL
  WHERE id = NEW.message_id
    AND explanation_requested_at IS NOT NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_verification_created
  AFTER INSERT ON public.clarity_verifications
  FOR EACH ROW
  EXECUTE FUNCTION clear_explanation_request();

COMMENT ON COLUMN public.clarity_chat_messages.explanation_requested_at IS
  'Timestamp when message author requested listener to explain back. NULL = no request. Cleared when verification is created.';
