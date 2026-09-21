---
status: week
type: story
rank: 109
workstream: events
created_date: '2026-09-21'
tags: [events, event-room, journey, rotation]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related: [p1336, p1338, p1114, p1179, p1323]
---

# P1337: At a Clarity Night everyone can see which step they are on, rounds rotate on a timer, and the evening ends with a next step

## Problem

**Situation:** At Clarity Night #1 (2026-09-18) people used the event room on their phones (P1114, P1179,
the Links menu from P1323). Attendee feedback: a confusing click-flow, pairs stuck together all evening,
late arrivals forcing repeats, and nobody taking the speaker/listener roles unprompted
([goals.md](../docs/goals.md), "Event #1 ran 2026-09-18").

**Complication:** Events now run weekly from event #2 on 2026-09-29, and the founder wants them to run
with less of his own effort. A host who has to explain every step out loud is the bottleneck.

**Question:** What does each attendee see, step by step, from arriving to leaving, so they never get
stuck, rotate partners on time, and leave knowing what comes next?

> Founder, 2026-09-21: *"on screen flow and rotation is another spec, especially the user journey flow"*
> and the ending is *"part of the flow journey … topic chooser for next time, a suggestion, and cmp10."*

## Appetite

Blast radius: one flow — the event room during a live event; a failure costs a room of people their
evening. Reversibility: high — UI and room state, no stored-data change is expected. Decision density:
a few founder calls, inline below.

## Solution

One journey, shown on each phone and mirrored on the projector:

1. **Arrive** — you see where you are (e.g. "waiting for round 1") and, if you arrive late, that you
   join at the next round rather than asking for a repeat.
2. **Round** — you see your partner, your role (speaker or listener, matching the S/L card), what to do
   now, and the time left. The host starts rounds; the timer is shared.
3. **Rotate** — when the timer ends, everyone is told their next partner, rotating in one direction.
   `[FOUNDER DECISION: rotation rule — one-direction shift vs. pairing from the survey (P1336)]`
4. **End** — the evening closes with: (a) a topic suggestion or vote for next week, (b) the invitation to
   stake a position on cmp10, and (c) the date of the next Clarity Night.
   `[FOUNDER DECISION: which of a/b/c, and their order]`

## Invariants

- A physical event must still run when a phone fails: the projector view alone carries the same step,
  role and timer.
- Nothing at the end of an event may ask for a follow-up session or a purchase. An unprompted follow-up
  request is what the champion-pilot prediction measures
  ([decisions.md](../docs/decisions.md) 2026-09-21 [product]; research-programme ledger L4).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Not ready by 2026-09-29 | MITIGATE | The deck (P1338) carries timer, rotation and roles for event #2; this spec replaces that on later events |
| Odd number of people breaks rotation | MITIGATE | The odd person observes one round, or the host joins |
| Phones stay out and distract from talking | ACCEPT | Steps are glanceable; the talk happens off-screen |

**Non-Goals**
- Do NOT build automatic matching from survey answers; the host pairs by hand.
- Do NOT add live agents or transcription features.
- Do NOT touch registration (P1336) or the deck content (P1338).

## Acceptance Criteria

- [ ] An attendee who has never used the room can follow a full evening on their phone without asking the host what to click
- [ ] A late arrival sees they join at the next round
- [ ] At every round end, each attendee sees their new partner and role, and nobody keeps the same partner twice in a row
- [ ] The projector alone shows the current step, the roles and the timer
- [ ] The evening ends with the chosen next-step items and no follow-up or purchase ask

## Open Questions

1. Does the event room already model rounds (the room code touches rounds in the transcribe page and the
   Links menu)? Read P1114, P1179 and P1323 before designing a new state. UNVERIFIED.
2. Should the topic vote for next week feed the weekly event page automatically? Founder wants weekly
   events automated; not decided.

## Related

- [p1336](p1336_registration_carries_opt_in_prep_and_survey.md) — registration, prep and survey
- [p1338](p1338_clarity_night_deck_cut_theory_and_run_rounds.md) — the deck for event #2
- P1114, P1179, P1323 — the event room, its opt-in and the Links menu
