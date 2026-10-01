---
status: backlog
type: story
rank: 1
workstream: events
created_date: '2026-10-01'
tags:
  - events
  - email
  - auth
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
driver: anomaly
blocked_by:
  - p1336
related:
  - p1336
  - p1256
---

# P1380: "Starting in 15 minutes" email and one-click sign-in links in event emails

## Problem
> **Founder framing, verbatim (2026-09-30):** "maybe we send a reminder email just before like 15 minutes before the event starts and clicking on that link by the way should log them in right automatically and then open this up"


Split from [P1336](p1336_registration_carries_opt_in_prep_and_survey.md) (founder decision
2026-10-01). Registrants who did not prepare, or who forget the start time, need a nudge that opens
the room (or their unfinished prep) already signed in. Today every event email links to the plain
event page and none sign in.

## Depends on

P1336 (prep flow, `event_preparations`, room gate with **Prepare now** / **Join the room without
preparing**). Ship after it.

## Emails

Today: confirmation on RSVP, 24h reminder, post-event feedback (one gated host only), plus
cancel/uncancel/update. Cron `dispatch-event-emails` runs every 30 min and hands Mailgun a
`deliverytime` up to 72h ahead.

| Email | Status | Change |
|---|---|---|
| Confirmation ("You're in") | **EXTEND** | add **Prepare now** button; its sign-in link opens `/events/:slug/prepare` |
| 24h reminder ("Tomorrow") | **EXTEND** | if prep incomplete: **Finish preparing** button (sign-in link → prep at resume step); else current copy. This is also what "Remind me by email" sends; no extra email |
| Starting in 15 minutes | **NEW** | via the existing 30-min `dispatch-event-emails` job: RSVPs whose event starts in (now+15m, now+45m], unclaimed → link to `/events/:slug/room` (the P1336 room gate handles prepared vs not) → Mailgun `deliverytime` = start − 15 min. Atomic PENDING claim like the reminder, in new columns named for it (e.g. `starting_soon_email_status` / `_claimed_at` / `_message_id`). Late RSVP (< 45 min to start, before start) → sent immediately. Stuck-claim reset threshold is minutes, not the reminder's. Cancelled events send nothing. |
| Feedback / cancel / uncancel / update | EXISTS | unchanged |

**Sign-in link:** a magic link (`otp_expiry = 3600`) cannot be minted when the email is scheduled —
Mailgun holds messages up to 72h. So each button points to a small **redirect endpoint** carrying a
ticket per (rsvp, purpose); on click it mints a fresh one-click magic link to the target. Expired or
used magic link → normal sign-in, destination preserved. No link is ever minted at scheduling time.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Event emails silently lost (P1256 fire-and-forget) | MITIGATE | AC below checks message ids per RSVP |
| Redirect ticket leaks = account access | MITIGATE | /architect: ticket scoped to (rsvp, purpose), expiry, single target |

Non-goals: prep flow itself (P1336); waitlist notices.

## Acceptance Criteria

- [ ] Confirmation has **Prepare now**; 24h reminder has **Finish preparing** only if incomplete; "Remind me" triggers no extra email; each RSVP on a test event has non-null message ids
- [ ] Starting-in-15 email is delivered at start−15 min (immediately for a late RSVP before start; never for a cancelled event); its link signs the person in and opens the room gate (prepared → room; else Prepare now / Join without preparing)
- [ ] An email button clicked >1h after scheduling still signs in one-click (link minted at click by the redirect endpoint); an expired/used link lands on normal sign-in, then the same target

## Pre-deploy Checklist

- [ ] Read prod OTP expiry (magic-link lifetime)
- [ ] `supabase functions deploy dispatch-event-emails` and `send-event-emails` (test, then prod)
- [ ] Post-deploy: RSVP on a test event, confirm confirmation id, scheduled reminder and starting-soon email rows
