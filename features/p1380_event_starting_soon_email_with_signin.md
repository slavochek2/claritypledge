---
status: qa
type: story
rank: 1
workstream: events
created_date: '2026-10-01'
tags:
  - events
  - email
  - auth
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
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
"it is starting, here is the room". Subject and body copy: the draft below, approved by the founder 2026-10-01.

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
    is in the room at {time}; later arrivals join from round 2."* **Approved (founder, 2026-10-01),
    with "doors open {time − 15 min}" added:** *"We start at 18:30 sharp (doors open 18:15). Round 1
    pairs whoever is in the room at 18:30; later arrivals join from round 2."*
  - Starting-soon email: the same line above the buttons. Its timing (15 minutes before) already
    lands while people can still leave on time.
  - The "join from round 2" mechanics belong to P1337 (rounds on a timer); this spec only says it.
- The same question sits at the **room gate** for anyone who opens the room without the email: the
  room is not proof of presence; the answer is.
- Attendance = registrations stamped *arrived* (self-reported), shown to the host. Not GPS: asking
  for location to prove presence is out of proportion for a meetup.
- **Decided (founder, 2026-10-01): "I can't make it" is allowed up to the start** and releases the
  place. The page asks once before cancelling (inline, no browser dialog), as the event page does.

## Implementation notes (/dev, 2026-10-01)

- **Flow chosen:** no `/architect` (founder, 2026-10-01: the P1369 benchmark showed no gain); the
  sign-in links get `/slava:think:adversarial-review` on the built code instead.
- **One deviation from the email table:** the 24h reminder's subject is *"A few minutes to prepare
  before tomorrow: {title}"*, not *"{N} minutes"*. N comes from the app's per-person plan
  (`minutesFor` over the cards and the once-per-person parts); computing it in the email function
  would mean a second copy of that logic. Revisit if the exact number matters.
- **Where things live:** tickets `event_email_links` (sha256 only, service_role only), redeemed by
  the `event-email-link` function → `/auth/verify` (P1257 token_hash) → the page fixed by the
  ticket's purpose. Arrivals `event_arrivals` (owner + host, written only by `mark_event_arrival`);
  not a column on the world-readable `event_rsvps`. Starting-soon claim in
  `mailgun_message_ids.starting_soon` + `starting_soon_attempted_at`, 10-min stuck reset.
- **Arrival question at the room:** in-person Preparation-on events, from 1h before the start to
  the end; before the preparation gate; never blocks entry (failed read/write, 5s deadline).
- **Known gaps, accepted:** someone who cancels between the claim (≤45 min before) and delivery
  (15 min before) still receives the starting-soon email, and its buttons then lead to sign-in
  (the ticket is deleted with the RSVP). An event cancelled and then un-cancelled does not resend
  a starting-soon email that was already scheduled.

## Decisions after /dev (founder, 2026-10-02)

- **Email buttons open a "Continue" page; one press signs in; each button works once** (security
  review: link scanners open every link; a forwarded email). Supabase's own docs recommend this
  shape for scanners. Event host and admin accounts are never signed in this way.
- **A button works until 2 hours after the event's scheduled end** (start + duration), whenever it
  was sent: a month-ahead "You're in" still works, once.
- **24-hour times everywhere** (event pages and event emails).
- **Open:** where the "we start sharp" line stays — recommended: 24h reminder + end of
  preparation, drop it from the starting-soon email.

## Evidence (/dev)

- Unit: `src/tests/p1380-*.test.ts(x)` (arrival rules, gate, Continue page), `supabase/functions/_shared/p1380-event-emails.test.ts` (18 Deno).
- DB: `e2e/integration/p1380-db-schema.spec.ts` (5, test DB).
- Browser: `e2e/p1380-arrival.spec.ts` (8, test DB + deployed function): arrival, See you soon, release place, host arrivals, Continue press-through, second press → sign-in.
- Live (opt-in, real Mailgun on test): `e2e/integration/p1380-live-send.spec.ts` (2): confirmation +
  late-RSVP starting-soon on registering; cron starting-soon for an event with no reminder due
  (the code-review HIGH), prep reminder; second tick sends nothing.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Event emails silently lost (P1256 fire-and-forget) | MITIGATE | AC below checks message ids per RSVP |
| Redirect ticket leaks = account access | MITIGATE | /architect: ticket scoped to (rsvp, purpose), expiry, single target |

Non-goals: prep flow itself (P1336); waitlist notices.

## Acceptance Criteria

- [x] Confirmation has **Prepare now**; 24h reminder has **Finish preparing** only if incomplete; "Remind me" triggers no extra email; each RSVP on a test event has non-null message ids
- [x] Starting-in-15 email is delivered at start−15 min (immediately for a late RSVP before start; never for a cancelled event); its link signs the person in and opens the room gate (prepared → room; else Prepare now / Join without preparing)
- [x] An event with Preparation off (e.g. a hike) gets today's emails only: no prep buttons, no starting-soon email
- [x] The starting-soon email explains why in its first lines and carries **I'm here** / **Not yet** as two buttons; **I'm here** (email or room gate) stamps the registration as arrived and opens the room; **Not yet** shows the venue, address, map link, **I'm here now** and **I can't make it**; the host sees who arrived
- [x] The question names the venue ("Have you arrived at Zuzalu library?") when the location starts with a place name, falls back to "Have you arrived?" + address otherwise, and is absent for an online event (**Join now**)
- [x] An email button clicked >1h after scheduling still signs in (founder 2026-10-02: one press on a "Continue" page, link minted at the press; single use); an expired/used link lands on normal sign-in, then the same target

## Pre-deploy Checklist

- [x] Read prod OTP expiry (magic-link lifetime) — N/A since 2026-10-02: links are minted at the press of "Continue", so the email never depends on the magic-link lifetime.
- [x] Functions deployed to TEST and verified live (opt-in live-send test, browser press-through) — 2026-10-02.

## Post-push Checklist (after `/push` applies the migration to prod)

The functions read tables this branch's migration creates, so they cannot go to prod before
`/push` applies it (P1211: `/push` owns prod migrations).
- [ ] `./scripts/deploy-functions.sh event-email-link --env prod` (deployed with `--no-verify-jwt`), then `dispatch-event-emails` and `send-event-emails`
- [ ] Post-deploy: RSVP on a prod test event, confirm the confirmation id, the scheduled reminder and the starting-soon rows in `email_send_log`
- [ ] Test project: set `APP_URL` back from `http://localhost:5300` (it was pointed at the dev site for the founder's inbox test)
