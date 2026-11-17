-- P1700: email_send_log accepts the removal email's type.
-- Spec: features/p1700_removed_attendee_notice.md
--
-- diffed against: 20261001190000_p1380_starting_soon_arrivals_links.sql (the latest definition of this check).
-- diff: 'removal' added to the list; the other seven values are unchanged.
-- Without this, logEmailSend's insert for 'removal' fails the CHECK and logEmailSend swallows the error by design, so every
-- removal email would go unlogged, silently.
-- client-safe: widens a CHECK; no client writes email_send_log.

ALTER TABLE public.email_send_log DROP CONSTRAINT IF EXISTS email_send_log_email_type_check;
ALTER TABLE public.email_send_log
  ADD CONSTRAINT email_send_log_email_type_check
  CHECK (email_type IN ('confirmation','reminder','feedback','cancellation','update','uncancel','starting_soon','removal'));
