---
status: today
type: task
rank: 2
workstream: events
created_date: '2026-09-21'
tags:
  - events
  - deck
  - presi3
  - run-of-show
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: anomaly
related:
  - p1336
  - p1337
---

# P1338: The Clarity Night deck cuts theory to about 5 minutes and runs the rounds on a timer

## Problem

The event-1 deck (`public/presi3/index.html`, ~50 slides, AI-safety topic) spent too long on theory
before practice. Attendees asked for less theory, a clear flow and rotating partners
([goals.md](../docs/goals.md), "Event #1 ran 2026-09-18"). Event #2 runs 2026-09-29 on a new topic, and
events then run weekly, so the deck needs to be reusable with only the topic swapped.

> Founder, 2026-09-21: *"this is presi3 improvement — yes another spec."*

## Appetite

Blast radius: one event's run of show. Reversibility: high — a static page in git. Decision density: a
few founder calls on content.

## Solution

- **Theory cut to about 5 minutes** — keep only what a person needs to choose and start. Everything else
  moves to the registration onboarding (P1336) or is dropped. **Read P1336 first:** from event #2,
  attendees arrive having watched the ST1 video (the three meanings of "understand", the 0–10 question)
  and having already chosen opt-in or opt-out. The deck therefore only *reminds* people of that choice and
  invites changes; it doesn't teach it. Keep the cognitive-understanding slides that P1336's video
  overlays, since the video reuses them. **Roles slide wording changes (P1336):** the listener can
  speak but may not disagree until they have *heard* the speaker's number and it is at least 8; if they
  disagree without it, they are reminded to ask.
- **Round slides with a visible countdown**, rotation instructions and the speaker/listener rule, matching
  the S/L lanyard cards.
- **Topic swappable** — the topic, its statements and its slides sit in one place, so next week's deck
  is this deck with a new topic.
- **On-time start** — the first slide states that the start is fixed and late arrivals join at the next
  round.

`[FOUNDER DECISION: event #2 topic — ikigai, a polarizing topic, or pick-from-3]`
`[FOUNDER DECISION: which theory slides survive the cut]`

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Deck is public; event-1 speaker notes may carry private material | MITIGATE | Delete, don't hide (decisions.md 2026-09-16 [process]) |
| Timer drifts from the room's timer once P1337 ships | DEFER | P1337 takes over timing; the deck then shows the room's state |

**Non-Goals**
- Do NOT build room features here; this is the deck only.
- Do NOT delete the event-1 version; keep it reachable for the record.

## Done-When

- [ ] Theory takes about 5 minutes when rehearsed aloud
- [ ] Each round slide shows the countdown, the rotation instruction and the roles
- [ ] Changing the topic means editing one place, shown by producing the event-2 version from it
- [ ] The founder has run the deck through once and signed it off before 2026-09-29
