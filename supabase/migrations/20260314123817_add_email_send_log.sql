-- P509: Email send tracking
-- Creates email_send_log table to persist every sendEmail() attempt
-- from the send-event-emails edge function.

CREATE TABLE IF NOT EXISTS email_send_log (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id            uuid        REFERENCES events(id),
  profile_id          uuid        REFERENCES profiles(id),
  email_type          text        NOT NULL,
  status              text        NOT NULL DEFAULT 'sent',
  mailgun_message_id  text,
  error_message       text,
  created_at          timestamptz DEFAULT now()
);

-- Constrain allowed values so bad writes surface immediately
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_send_log_email_type_check'
  ) THEN
    ALTER TABLE email_send_log
      ADD CONSTRAINT email_send_log_email_type_check
      CHECK (email_type IN ('confirmation','reminder','feedback','cancellation','update','uncancel'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_send_log_status_check'
  ) THEN
    ALTER TABLE email_send_log
      ADD CONSTRAINT email_send_log_status_check
      CHECK (status IN ('sent','failed'));
  END IF;
END;
$$;

-- Index for the most common query: "did this profile get this email type for this event?"
CREATE INDEX IF NOT EXISTS email_send_log_lookup_idx
  ON email_send_log (event_id, profile_id, email_type, status);

-- RLS ─────────────────────────────────────────────────────────────────────────
ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically; this policy covers the service role
-- when it writes via the supabase client (not the raw connection).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_send_log' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON email_send_log
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;

-- Authenticated users can read their own rows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_send_log' AND policyname = 'authenticated_read_own'
  ) THEN
    CREATE POLICY authenticated_read_own ON email_send_log
      FOR SELECT
      TO authenticated
      USING (profile_id = auth.uid());
  END IF;
END;
$$;
