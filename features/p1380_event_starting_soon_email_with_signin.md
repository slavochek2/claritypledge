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

# P1380: "Starting in 15 minutes" email with arrival check-in, and one-click sign-in links in event emails

## Problem
> **Founder framing, verbatim (2026-09-30):** "maybe we send a reminder email just before like 15 minutes before the event starts and clicking on that link by the way should log them in right automatically and then open this up"


Split from [P1336](done/2026-06-10/p1336_registration_carries_opt_in_prep_and_survey.md) (founder decision
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

## Which events, and where each click lands (agent proposal 2026-10-01 — confirm at /dev)

**Scope: only events with Preparation on** (`events.preparation_enabled`, the per-event switch
P1336 added: on by default for Clarity Nights, off for hikes). Those are the events that have a
preparation and use the event room. Every other event keeps today's emails unchanged: no
**Prepare now** / **Finish preparing** buttons and no starting-soon email. Keying on the switch,
not on the title, means a host who turns Preparation on for another format gets the same emails.

| Email | Button | Signed in, it opens |
|---|---|---|
| Confirmation | **Prepare now** | `/events/:slug/prepare` → the plan ("Your preparation · N steps · about N min") |
| 24h reminder, prep not complete | **Prepare now** (never started) / **Finish preparing** (started) — the reminder is *about* preparing: subject and first line say "{N} minutes to prepare before tomorrow", event details below | `/events/:slug/prepare` → the step they stopped at (the plan if never started) |
| 24h reminder, prepared | today's reminder plus one line "You're prepared ✓"; event-page link | the event page |
| 24h reminder, event with Preparation off | today's reminder, unchanged | the event page |
| Starting in 15 minutes | **Join the room** | `/events/:slug/room` → prepared: straight to the room; not prepared: the P1336 gate (**Prepare now** / **Join the room without preparing**); a preparation opened there ends on **Join the room** |

The starting-soon email goes to every registrant of such an event, prepared or not: its job is
"it is starting, here is the room". Subject and body copy: [FOUNDER DECISION: copy].

### Arrival check-in — we know who was actually there (founder idea 2026-10-01; proposal, confirm at /dev)

> Founder, verbatim: "it should say I guess did you arrive at event already - yes no ... the beauty
> of confirmation is that then we know exactly who was there, and not only who clicked in event
> room because the person might not be in the actual room."

- **The email says why first.** (DRAFT copy, founder to approve) *"Clarity Night starts in 15
  minutes. We use our app to guide you through the evening — your conversation partners, the
  rounds, your positions — so when you've arrived, it opens with one tap."*
- **Then the question, with both answers as buttons in the email:** **Have you arrived at
  {venue}?** — **I'm here** / **Not yet**. One tap answers; nobody lands on a page just to be asked.
  - **I'm here** → signed in, the registration is stamped *arrived*, then the room (prepared →
    straight in; not → the P1336 gate).
  - **Not yet** → a "See you soon" page: the venue, its address and a map link, a big **I'm here
    now** button to tap on arrival (the same page is reachable from the event page), and
    **I can't make it** (cancels the registration, so the host's count is right and a place frees
    up — see the founder decision below).
- **{venue}** is the first part of the event's location before the first comma ("Zuzalu library,
  4Seas Nimman, …" → "Zuzalu library"). When that is not a place name (no comma, or it starts with
  a street number), the question is **Have you arrived?** with the full address under it. An online
  event (the location is a meeting link) gets no arrival question: its button is **Join now**.
  `/publish-event` checks the location reads "Venue name, address" and suggests that shape when it
  does not.
- **Arriving on time (founder, 2026-10-01: "we start the event at time, don't wait for people").**
  State the consequence, once, where people plan their evening — no countdowns or nagging:
  - 24h reminder and the preparation's end screen: *"We start at {time} sharp. Round 1 pairs whoever
    is in the room at {time}; later arrivals join from round 2."* [FOUNDER DECISION: copy, and
    whether to say "doors open {time − 15 min}"]
  - Starting-soon email: the same line above the buttons. Its timing (15 minutes before) already
    lands while people can still leave on time.
  - The "join from round 2" mechanics belong to P1337 (rounds on a timer); this spec only says it.
- The same question sits at the **room gate** for anyone who opens the room without the email: the
  room is not proof of presence; the answer is.
- Attendance = registrations stamped *arrived* (self-reported), shown to the host. Not GPS: asking
  for location to prove presence is out of proportion for a meetup.
- [FOUNDER DECISION: is "I can't make it" from this page allowed 15 minutes before start, or does it
  only say "Message the host"?]

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Event emails silently lost (P1256 fire-and-forget) | MITIGATE | AC below checks message ids per RSVP |
| Redirect ticket leaks = account access | MITIGATE | /architect: ticket scoped to (rsvp, purpose), expiry, single target |

Non-goals: prep flow itself (P1336); waitlist notices.

## Acceptance Criteria

- [ ] Confirmation has **Prepare now**; 24h reminder has **Finish preparing** only if incomplete; "Remind me" triggers no extra email; each RSVP on a test event has non-null message ids
- [ ] Starting-in-15 email is delivered at start−15 min (immediately for a late RSVP before start; never for a cancelled event); its link signs the person in and opens the room gate (prepared → room; else Prepare now / Join without preparing)
- [ ] An event with Preparation off (e.g. a hike) gets today's emails only: no prep buttons, no starting-soon email
- [ ] The starting-soon email explains why in its first lines and carries **I'm here** / **Not yet** as two buttons; **I'm here** (email or room gate) stamps the registration as arrived and opens the room; **Not yet** shows the venue, address, map link, **I'm here now** and **I can't make it**; the host sees who arrived
- [ ] The question names the venue ("Have you arrived at Zuzalu library?") when the location starts with a place name, falls back to "Have you arrived?" + address otherwise, and is absent for an online event (**Join now**)
- [ ] An email button clicked >1h after scheduling still signs in one-click (link minted at click by the redirect endpoint); an expired/used link lands on normal sign-in, then the same target

## Pre-deploy Checklist

- [ ] Read prod OTP expiry (magic-link lifetime)
- [ ] `supabase functions deploy dispatch-event-emails` and `send-event-emails` (test, then prod)
- [ ] Post-deploy: RSVP on a test event, confirm confirmation id, scheduled reminder and starting-soon email rows
