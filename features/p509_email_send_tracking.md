---
status: backlog
type: task
rank: 38
workstream: foundation
created_date: 2026-03-14T00:00:00.000Z
tags:
  - events
  - email
  - observability
---

# P509: Email send tracking and backfill

## Problem

When the `send-event-emails` edge function fails to send via Mailgun, the email is silently lost — logged to console but with no persistent record and no recovery path. After the AI event (Mar 12), all 11 feedback emails were missed due to a past-event guard bug. There was no way to discover this without manually querying the DB.

## Solution

1. **New `email_send_log` table** — tracks every email send attempt:
   - `id`, `event_id`, `profile_id`, `email_type` (confirmation/reminder/feedback), `status` (queued/sent/failed), `mailgun_message_id`, `error_message`, `created_at`
   - Populated by the edge function on every `sendEmail()` call (success or failure)

2. **Backfill script** (`scripts/resend-feedback.sh`) — queries for participants who never got their feedback email (no `email_send_log` row with `email_type=feedback` and `status=sent`) and resends via Mailgun.

## Technical Notes

- Edge function `send-event-emails/index.ts` — after each `sendEmail()` call, INSERT into `email_send_log`
- Use service role key (already available in edge function) to bypass RLS
- Backfill script reads `.env.local` for Mailgun creds, queries prod via REST API
- No auto-retry — manual backfill is sufficient at current event volume (~3 events, ~30 emails/year)

## Acceptance Criteria

- [ ] `email_send_log` table exists with columns: id, event_id, profile_id, email_type, status, mailgun_message_id, error_message, created_at
- [ ] Every `sendEmail()` call in the edge function writes a row (success → status=sent, failure → status=failed with error_message)
- [ ] Backfill script can identify participants missing feedback emails and resend them
- [ ] RLS policy: service role can read/write; authenticated users can read their own rows

## Testing

- Deploy edge function, RSVP to test event → verify `email_send_log` row appears
- Simulate Mailgun failure → verify failed row logged with error
- Run backfill script → verify it identifies and resends missing emails
