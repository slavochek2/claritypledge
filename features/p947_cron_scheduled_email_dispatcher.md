---
status: week
type: task
rank: 1000947.0
created_date: '2026-06-17'
tags: [email, mailgun, events, cron]
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P947: Cron Scheduler for Deferred Event Emails (Reminder + Feedback)

## Problem

**Situation:** When an attendee RSVPs to an event, `send-event-emails` tries to schedule a reminder (24h before) and a feedback email (2h after) via Mailgun's `o:deliverytime` parameter.

**Complication:** Mailgun EU rejects any scheduled send more than 72 hours in advance (`"scheduled delivery time must not be farther than 72h0m0s from now"`). All current events are 4+ weeks out. Every reminder and feedback email silently fails at RSVP time — logged as `status: failed` in `email_send_log`. Attendees receive only the confirmation email.

**Question:** How do we reliably send reminder and feedback emails when the target send time is more than 72h away?

## Appetite

Low blast radius — the RSVP flow and existing email templates are untouched. Only the scheduling mechanism changes. Reversible (disable the cron job; emails simply don't send, same as current state). Low decision density — the send times are already defined (24h before, 2h after event end).

## Solution

Replace Mailgun's `o:deliverytime` scheduling with a DB-backed queue + daily cron dispatcher:

1. **At RSVP time** — store the target send datetimes in the `rsvps` table (columns likely already exist: check `reminder_mailgun_message_id` / `feedback_mailgun_message_id` and add `reminder_scheduled_at` / `feedback_scheduled_at` if missing). Do NOT call Mailgun for reminder/feedback at RSVP time.

2. **Cron job (Supabase Edge Function scheduled via `supabase.toml` or pg_cron)** — runs daily (or every 6h). Queries `rsvps` for rows where:
   - `reminder_scheduled_at` is within the next 72h AND `reminder_mailgun_message_id IS NULL`
   - OR `feedback_scheduled_at` is within the next 72h AND `feedback_mailgun_message_id IS NULL`

   For each matching row, calls Mailgun with `o:deliverytime` set to the stored datetime (now safely within 72h). Writes the returned message ID back to the row.

3. **Idempotency** — the `message_id IS NULL` guard prevents double-sends if the cron runs twice.

## Risks / Non-Goals

### Risks
- **Cron misses a window** — if the cron hasn't run within 72h of the send time, the email still fails. Mitigation: run every 6h (not daily); 72h window gives 12 opportunities.
- **Schema gap** — `reminder_scheduled_at` / `feedback_scheduled_at` columns may not exist. Mitigation: verify against migrations before writing code; add migration if missing.
- **Cancelled RSVPs** — cron could send a reminder after a cancellation. Mitigation: join against `rsvps.status` or a cancelled flag; skip if cancelled.

### Non-Goals
- Do NOT change the confirmation email (still sent immediately at RSVP — unchanged)
- Do NOT change email templates or content
- Do NOT build a general-purpose email queue (scope to reminder + feedback only)
- Do NOT add a UI for managing scheduled sends

### Alternatives Considered
- **Keep `o:deliverytime` for near-future events only** — fragile; requires knowing the event date at scheduling time and branching. Adds complexity for a partial fix.
- **Switch to Mailgun US endpoint** — domain is registered on EU; cross-region use unsupported.
- **Send reminder/feedback immediately at RSVP** — poor UX; a reminder sent 4 weeks early is useless, and feedback before the event is nonsensical.

### Rollback Strategy
Disable the cron job in `supabase.toml` (or drop the pg_cron entry). Emails simply won't send — identical to current broken state. No data loss.

## Done-When

- [ ] Attendees RSVPing to events >72h out receive a reminder email ~24h before the event
- [ ] Attendees RSVPing to events >72h out receive a feedback email ~2h after the event ends
- [ ] `email_send_log` shows `status: sent` for reminder and feedback rows (not `failed`)
- [ ] Sending the same RSVP twice does not trigger duplicate emails (idempotency)
- [ ] Cancelled RSVPs do not receive reminder or feedback emails
- [ ] Confirmation email behaviour is unchanged
