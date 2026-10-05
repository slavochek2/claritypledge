---
status: week
type: bug
rank: 23
severity: high
workstream: events
date_reported: 2026-10-06
created_date: 2026-10-06
drafted_by: opus
exec_model: opus
exec_effort: high
tags: [events, email, dispatcher, race]
disclosure: public
delivery_stage: create-bug
pipeline_ran: [create-bug]
---

# P1425: Event reminder email sent up to 13 times — dispatcher overwrites its own message ids from a stale snapshot

## Summary

`dispatch-event-emails` sent the 24h reminder for Clarity Night #2 (2026-10-06 11:30 UTC) **13 times** to
one attendee and to the founder's test profile, and **twice** to a second attendee. Every copy was
scheduled at Mailgun for the same delivery minute, so they landed in the inbox together. Founder's
report: *"something wrong with sending? i think it received so many emails??"*

Regression area: P947 (dispatcher + atomic claim), P1256 (cron revived), P1380 (starting-soon shares
the same JSONB).

## Root Cause

Confirmed by the prod send log timing (below), not just by reading the code.

`event_rsvps.mailgun_message_ids` is one JSONB object holding every email kind's id (`reminder`,
`feedback`, `starting_soon`, `starting_soon_for`). Every writer does read-modify-write of the
**whole object** from a snapshot taken when the row was selected:

1. `runDispatch` selects a row once, then calls `dispatchReminder` and `dispatchFeedback` in sequence
   with that same `rsvp` object.
2. `dispatchReminder` claims `reminder = PENDING`, sends, writes `{...snapshot, reminder: <id>}`.
3. `dispatchFeedback` builds `{...snapshot, feedback: PENDING}` from the **pre-reminder** snapshot and
   writes the whole object — erasing the reminder id just written. Its write-back does the same.
4. Next cron tick (every 30 min): `reminder` is null again → the reminder is re-claimed and re-sent.

Two things made it loop 13 times instead of once:

- **Feedback dispatched outside Mailgun's 72h window.** The query's OR matches the row on its
  *reminder* branch, but the JS `needsFeedback` check ignores the window, so feedback was sent with an
  `o:deliverytime` > 72h ahead. Mailgun rejected it (`Mailgun returned null message ID`), the key went
  back to null, and the cycle repeated every tick until the feedback time came within 72h.
- Even a *successful* feedback send erases the reminder id (attendee 2: feedback accepted at 08:30,
  reminder re-sent at 09:00).

**Prod evidence (read-only, `email_send_log`, 2026-10-03..05):**

| recipient (role) | reminder sends | distinct Mailgun ids | sent at (UTC) |
|---|---|---|---|
| attendee 1 | 13 | 13 | 10-03 10:00 → 16:00, every 30 min |
| founder test profile | 13 | 13 | 10-03 10:00 → 16:00, every 30 min |
| attendee 2 | 2 | 2 | 10-05 08:30, 09:00 |

Feedback: 22 `failed` rows 10-03 10:00–15:00 (11 ticks × 2 rows), first success 15:30 —
exactly 72h before `feedback_scheduled_at` (event 11:30 + 120 min + 2h = 10-06 15:30).

## Invariants

- **No writer replaces `mailgun_message_ids` wholesale from a snapshot.** Each send kind owns its key;
  a claim or write-back changes only its own key, atomically, conditional on that key's current
  value. (The deliberate full reset in `handleUpdate` is the one sanctioned exception.)
- **A send is only attempted when its own scheduled time is inside the dispatch window**, never
  because the row matched on a sibling kind's condition.

## Reproduction Steps

1. Event with a feedback-gated host, preparation on, starting > 72h + 4h from now (so the reminder is
   inside the 72h window but feedback is outside it).
2. RSVP → `reminder_scheduled_at`, `feedback_scheduled_at` set, `mailgun_message_ids` null.
3. Cron tick: reminder sent, feedback attempted and rejected by Mailgun.
4. Observe: `mailgun_message_ids` has no `reminder` key. Next tick sends the reminder again.

**Reproduction rate:** 100% for any RSVP where both kinds are dispatched in one tick, or feedback is
attempted beyond 72h.

## Expected Behavior

One reminder per RSVP, one feedback per RSVP. Feedback is not attempted before it is inside the 72h
window.

## Actual Behavior

Reminder re-sent every 30 minutes until feedback is accepted; then once more.

## Affected Files

- `supabase/functions/dispatch-event-emails/index.ts` — `dispatchReminder`, `dispatchFeedback`
  (claim + write-back from snapshot), `runDispatch` (`needsReminder`/`needsFeedback` ignore window)
- `supabase/functions/_shared/starting-soon.ts` — `dispatchStartingSoon` claim + write-back (same
  pattern; latent)
- `supabase/functions/send-event-emails/index.ts` — `handleUncancel` writes `rest` from snapshot
  (same pattern; latent)

## Severity

**High** — real attendees received the same email 13 times; recurs on every event with a
feedback-gated host.

## Fix Approach

1. One DB function `set_rsvp_message_id(rsvp_id, kind, expected, value)` that does a per-key
   compare-and-set with `jsonb_set` / `-` in a single UPDATE. All claim / write-back / clear paths use
   it; none writes the whole object.
2. `runDispatch` only dispatches a kind whose own `*_scheduled_at` is in `(now, now+72h]`.
3. A guard (test) that fails if any edge function writes `mailgun_message_ids:` in an `.update()`
   outside the sanctioned reset.

## Acceptance Criteria

- [ ] An RSVP with both reminder and feedback due in one tick ends with both ids stored; a second tick sends nothing
- [ ] An RSVP whose feedback is > 72h out: reminder sent once, feedback not attempted, no `failed` feedback row
- [ ] A failed feedback send does not erase the stored reminder id
- [ ] Starting-soon and uncancel paths no longer write the whole object
- [ ] Guard test fails on a reintroduced whole-object write, passes on the fixed code
- [ ] Regression test (live test DB) reproduces the double send before the fix and passes after