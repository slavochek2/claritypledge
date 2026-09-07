---
status: in-progress
type: bug
rank: 5
created_date: '2026-09-07'
tags:
  - events
  - email
  - infrastructure
delivery_stage: dev
pipeline_ran:
  - create-spec
  - dev
---

# P1256: event emails were never dispatched, and the grace window closed mid-event

## Problem

Three defects, found together after the 2026-09-06 hike.

**1. No reminder or feedback email has ever been sent.** `dispatch-event-emails` has
been deployed since P947 (2026-06-10), but nothing has ever invoked it. P947's
deployment plan called for a `[functions.dispatch-event-emails]` `schedule` block in
`supabase/config.toml`; that block was never added, and it would not have worked
anyway — `config.toml` drives the local stack, and P947's own trade-off note records
that `supabase start` does not run cron schedules. There is no `cron.schedule` for it
either. Measured on prod before any change: the 2026-09-06 hike's 8 RSVPs each carry a
correctly-computed `reminder_scheduled_at` AND `feedback_scheduled_at`, with
`mailgun_message_ids = {}` and both `*_attempted_at` NULL.

**2. The miss is unrecoverable by cron alone.** `runDispatch` selects on
`scheduled_at > now()` (it hands Mailgun a future `o:deliverytime`), so it only looks
forward. Once a scheduled moment passes unsent, no later run can ever see that row.
The past is an absorbing state.

**3. Two different clocks disagreed about when an event ends.** `EventDetail`
computed `isPast` from `datetime + durationMinutes`; the `/events` list used a flat
`EVENT_GRACE_HOURS = 5` from `datetime` and ignored duration entirely. For the hike
(09:00 local, `duration_minutes = 240`) RSVP closed at 13:00 while the event stayed in
"upcoming" until 14:00 — and the group was still walking through both. A hike can
occupy most of a day.

## Appetite

Small. Three contained fixes plus one prod recovery action.

## Solution

- **Schedule it.** `20260907140000_p1256_dispatch_event_emails_cron.sql` — pg_cron
  every 30 min calling a `SECURITY DEFINER` helper that reads its URL and the
  `CRON_SECRET` from Vault, matching the existing P1064 `tx_jobs_enqueue` pattern.
  30 min rather than P947's 6h because the look-ahead window makes any gap between
  runs an irrecoverable hole; 30 min shrinks it from 6 hours.
- **Recover the miss.** An opt-in `backfill_event_id` body on the same edge
  function: `runDispatch`'s feedback branch with the forward-only time filter
  replaced by an explicit event id. Not wired into the cron — a scheduled job that
  retroactively mails everyone behind it is how a backlog becomes a mass send.
  Keeps every other guard (CRON_SECRET, host gate, 30-min drift check, atomic
  PENDING claim, send log), so a double invocation sends nothing twice.
- **One clock, 12 hours.** `EVENT_GRACE_HOURS` 5 → 12, and `EventDetail.isPast`
  now reads that same constant instead of `durationMinutes`. `durationMinutes` keeps
  its real jobs there: the displayed time range and the calendar export's DTEND.
- **Stop duplicating the number in SQL.** The P1114 canary
  (`p1114-grace-hours-sync.test.ts`) fired on the constant change and surfaced four
  RPC bodies carrying `interval '5 hours'`. All four now call one
  `public.event_grace_interval()`.

## Risks / Non-Goals

- **Vault prerequisite.** The cron migration is inert until
  `dispatch_event_emails_url` and `dispatch_event_emails_cron_secret` exist in that
  database's Vault. Missing config raises a WARNING and no-ops rather than erroring
  every 30 minutes forever.
- **Non-goal: the missed reminders.** Backfill covers feedback only. A "your event
  is tomorrow" email for an event that already happened is worse than silence.
- **Non-goal: per-event durations.** The 12h window is measured from event START,
  not start+duration, because the list query is a SQL `.gte('datetime', cutoff)` and
  cannot add a per-row duration without a computed column. One rule both surfaces can
  evaluate beats a more precise rule only one of them can.

## Done-When

- [x] Cron migration applied and `event_grace_interval()` returns `12:00:00` on test
- [x] `EVENT_GRACE_HOURS = 12`, and `EventDetail.isPast` reads it
- [x] Four P1114 RPCs call `event_grace_interval()`; canary updated to 12
- [x] Backfill row-selection filter verified against prod: returns exactly the 8
      unsent rows, excluding the 9th RSVP that has no `feedback_scheduled_at`
- [x] Full suite green (3794 passed), `tsc --noEmit` clean, `deno check` clean
- [ ] Edge function + migrations deployed to prod (founder approval)
- [ ] Backfill invoked for `77756d40-…`; the 8 rows show a real `mailgun_message_ids.feedback`

## Invariants

- A backfill invocation is idempotent: the atomic `PENDING` claim on
  `mailgun_message_ids->>feedback` means a second run claims and sends nothing.
- `EVENT_GRACE_HOURS` and `public.event_grace_interval()` must change together, in
  one commit. `p1114-grace-hours-sync.test.ts` is what enforces it.
