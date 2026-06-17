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

Replace Mailgun's `o:deliverytime` scheduling with a DB-backed queue + cron dispatcher:

1. **Schema** — add two columns to `event_rsvps` via migration:
   - `reminder_scheduled_at TIMESTAMPTZ` — target send time (24h before event)
   - `feedback_scheduled_at TIMESTAMPTZ` — target send time (2h after event ends)
   - Do NOT add new per-email message ID columns. The existing `mailgun_message_ids JSONB` column (keys `reminder`, `feedback`) stores message IDs after dispatch.

2. **At RSVP time** — compute and store `reminder_scheduled_at` / `feedback_scheduled_at` in `event_rsvps`. Do NOT call Mailgun for reminder/feedback at RSVP time.

3. **`handleUpdate` ownership** — when the host edits an event, `handleUpdate` must update `reminder_scheduled_at` / `feedback_scheduled_at` to the new times AND NULL the relevant `mailgun_message_ids` keys (so the cron re-dispatches with the new time). `handleUpdate` must NOT call Mailgun to reschedule directly — the cron is the sole dispatcher for reminder/feedback.

4. **Cron job (Supabase Edge Function, scheduled every 6h via `supabase.toml`)** — queries for rows to dispatch:
   ```sql
   SELECT r.* FROM event_rsvps r
   JOIN events e ON e.id = r.event_id
   WHERE e.status != 'cancelled'
     AND (
       (r.reminder_scheduled_at <= NOW() + INTERVAL '72 hours'
        AND (r.mailgun_message_ids->>'reminder') IS NULL
        AND r.reminder_scheduled_at > NOW())
       OR
       (r.feedback_scheduled_at <= NOW() + INTERVAL '72 hours'
        AND (r.mailgun_message_ids->>'feedback') IS NULL
        AND r.feedback_scheduled_at > NOW())
     )
   ```
   The JOIN on `events.status != 'cancelled'` is required — without it, a host cancellation leaves queue entries that fire anyway (since `handleCancel` has nothing to cancel in Mailgun before dispatch).

5. **Atomic claim before dispatch** — for each row, UPDATE `mailgun_message_ids` to set the relevant key to `"PENDING"` WHERE the key is currently NULL, using `UPDATE ... RETURNING`. Only rows whose UPDATE returns a result proceed to Mailgun. This closes the TOCTOU gap: two concurrent cron runs both attempt the claim; only one succeeds per row. After Mailgun returns the real message ID, replace `"PENDING"` with the actual ID. Add `reminder_attempted_at` / `feedback_attempted_at` columns to detect stuck PENDING rows (present for >1 cron interval with no real ID = retry eligible).

6. **Individual RSVP cancellation** — when an attendee cancels their RSVP, the row is deleted (existing RLS: `FOR DELETE USING auth.uid() = profile_id`). The cron query finds no row → no email sent. No status flag needed.

## Risks / Non-Goals

### Risks
- **Host cancels event between RSVP and cron dispatch** — MITIGATE: cron JOIN on `events.status != 'cancelled'` (step 4 above). Without this, cancelled-event reminders still fire.
- **Cron misses a window** — ACCEPT: run every 6h; 72h window gives 12 opportunities. A one-off miss is tolerable at current event volume.
- **Stuck PENDING rows** — MITIGATE: `reminder_attempted_at` / `feedback_attempted_at` columns; cron treats rows with PENDING older than one interval as retry-eligible.
- **`handleUpdate` still calls Mailgun directly** — MITIGATE: Non-Goal below. The implementing agent must strip Mailgun scheduling calls from `handleUpdate` for reminder/feedback; leave cancellation of already-dispatched IDs intact.

### Non-Goals
- Do NOT change the confirmation email (still sent immediately at RSVP — unchanged)
- Do NOT change email templates or content
- Do NOT build a general-purpose email queue (scope to reminder + feedback only)
- Do NOT add a UI for managing scheduled sends
- Do NOT add a status column to `event_rsvps` — cancellation = row deletion (existing pattern)

### Alternatives Considered
- **Keep `o:deliverytime` for near-future events only** — fragile; requires branching on event date proximity. Partial fix only.
- **Switch to Mailgun US endpoint** — domain is registered on EU; cross-region use unsupported.
- **Send reminder/feedback immediately at RSVP** — useless UX for events weeks out.

### Rollback Strategy
Disable the cron job in `supabase.toml`. Emails won't send — identical to current broken state. The new schema columns are additive and nullable; no data loss on rollback.

## Done-When

- [ ] Attendees RSVPing to events >72h out receive a reminder email ~24h before the event
- [ ] Attendees RSVPing to events >72h out receive a feedback email ~2h after the event ends
- [ ] `email_send_log` shows `status: sent` for reminder and feedback rows (not `failed`)
- [ ] Host cancelling an event stops pending reminder/feedback emails from being sent
- [ ] Sending the same RSVP twice does not trigger duplicate emails (idempotency via atomic claim)
- [ ] Host editing event date causes reminders/feedback to be rescheduled to the new time
- [ ] Confirmation email behaviour is unchanged
