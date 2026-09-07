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

**1. No reminder or feedback email has ever been sent — because the cron job that sends
them has failed on every single run since it was created.**

Measured on prod: the 2026-09-06 hike's 8 RSVPs each carry a correctly-computed
`reminder_scheduled_at` AND `feedback_scheduled_at`, with `mailgun_message_ids = {}` and
both `*_attempted_at` NULL.

> **ROOT CAUSE CORRECTED MID-SPEC — the first answer was wrong.** This spec originally
> concluded that *nothing had ever invoked* the dispatcher, on the evidence that
> `supabase/config.toml` has no schedule block and no migration carries a `cron.schedule`
> for it. Both of those are true, and the conclusion drawn from them was still false. A
> cron job **did** exist on prod — `dispatch-event-emails`, `active: true`, `0 */6 * * *`
> — invisible to the repo because it was created out-of-band and lives only in prod's
> `cron.job`, exactly as `tx_jobs_enqueue` did before P1064. The search was over the
> repo; the object was not in the repo. It was found only when a hostile review of the
> *fix* prompted a check of `cron.job` on both projects before deploying.

The actual defect, from `cron.job_run_details`:

```
328 runs · 0 succeeded · first 2026-06-17 · last 2026-09-07 06:00Z
ERROR:  column "Authorization" does not exist
```

The job builds its auth header as `json_build_object("Authorization", "Bearer <token>")`.
**Double quotes are identifier quotes in Postgres**, so the planner looked for a column
named `Authorization`, found none, and aborted before any HTTP request left the database.
Single quotes would have worked. One character class, ~3 months, every email.

**The failure was loud and unread.** 328 identical error rows sat in
`cron.job_run_details`. Nothing ever read that table, so a hard error was operationally
indistinguishable from silence — which is the actual lesson, and why the monitoring in
this spec reads that table directly rather than only inferring from unsent rows.

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

- **Replace the broken job.** `20260907140000_p1256_dispatch_event_emails_cron.sql` —
  pg_cron every 30 min calling a `SECURITY DEFINER` helper that reads its URL and the
  `CRON_SECRET` from Vault, matching the existing P1064 `tx_jobs_enqueue` pattern. 30 min
  rather than the old 6h because the look-ahead window makes any gap between runs an
  irrecoverable hole. Building the header in PL/pgSQL with `jsonb_build_object` and real
  string literals is also what makes the original quoting bug unrepresentable here.
- **Unschedule the broken one.** `20260907160000_p1256_unschedule_legacy_broken_cron.sql`.
  The replacement has a different job name (`dispatch_event_emails`, underscore), so
  without this a deploy leaves BOTH scheduled — the new one working, the old one going on
  erroring every 6 hours forever.
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

- **ROTATE THE CRON_SECRET.** The legacy job embedded its bearer token as a plaintext
  literal in `cron.job.command`, readable by anything that can read `cron.job` and present
  in every `pg_dump` taken since 2026-06-17. Unscheduling the job removes the row but does
  not undo the exposure. The replacement reads the value from Vault, so rotating it is a
  Vault update plus the edge function's `CRON_SECRET` secret — no code change.

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
- [x] Legacy broken job identified and an unschedule migration written + applied to test
- [x] `/day` reads `cron.job_run_details` directly; verified against prod with both
      controls in one output — a healthy job (288 ok / 0 failed) and the broken one
      (0 ok / 4 failed, error text shown)
- [ ] Edge function + migrations deployed to prod (founder approval)
- [ ] CRON_SECRET rotated after deploy
- [ ] Backfill invoked for `77756d40-…`; the 8 rows show a real `mailgun_message_ids.feedback`

## Invariants

- A backfill invocation is idempotent: the atomic `PENDING` claim on
  `mailgun_message_ids->>feedback` means a second run claims and sends nothing.
- `EVENT_GRACE_HOURS` and `public.event_grace_interval()` must change together, in
  one commit. `p1114-grace-hours-sync.test.ts` is what enforces it.
