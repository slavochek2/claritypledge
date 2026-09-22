---
status: today
type: story
rank: 1
workstream: events
created_date: '2026-09-21'
tags:
  - events
  - registration
  - opt-in
  - survey
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
exec_model: opus
exec_effort: high
driver: anomaly
related:
  - p1055
  - p1114
  - p1179
  - p1256
---

# P1336: Registering for a Clarity Night carries the onboarding, the opt-in and the disagreement survey

## Problem

**Situation:** Clarity Night #1 ran 2026-09-18. Setup took up the practice time: too much theory
(feedback: the product was over-demonstrated, though people were excited to see it), late arrivals
forcing repeats, pairs stuck together, and people unsure what to click
([goals.md](../docs/goals.md), "Event #1 ran 2026-09-18"). The opt-in to the meeting principle was a
tap inside the room, made by people who had just heard the idea for the first time.

**Complication:** Events now run **weekly** from **event #2 on Tuesday 2026-09-29**. Every minute of
explanation in the room is lost practice, and every latecomer restarts it. An opt-in is only a real
choice if the person knows what they are opting into, and that means knowing what *cognitive
understanding* is.

**Question:** What does a person do before arriving so that the room starts with practice, latecomers
catch up without stopping it, and each opt-in is an informed choice?

Three problems, and nothing else:

| | Problem | What fixes it |
|---|---|---|
| A | The room spends its time on setup | Onboarding moves into registration |
| B | The opt-in is uninformed | Onboarding explains cognitive understanding before the choice |
| C | Pairs don't disagree and stay stuck together | A per-event disagreement survey the host pairs from |

> Founder, 2026-09-21: *"registration opt-in — let's file spec!"* · 2026-09-22: *"if we offload the
> onboarding into registration process of the event, that's good."*

**Correction 2026-09-22.** An earlier draft said this spec made an opt-in-predicts-payment test readable.
Wrong. Physical events are not a revenue path, and no current hypothesis links opt-in to payment
(founder: *"there is no hypothesis whatsoever that opting in predicts who pays"*). That prediction was
registered 2026-08-10 for the membership ladder and is retired
([hypotheses.md](../docs/hypotheses.md) H-ChampionYield). The workplace/champion question also left
this spec; the end of the evening handles it ([P1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md)).

## Appetite

Blast radius: one flow, event registration, plus what the room reads from it. Reversibility: medium.
Onboarding completion and survey answers are stored per person; the flow itself is a code revert.

## Solution

### Two parts: once per person, once per event

1. **Universal onboarding, done once and remembered.** It is never asked again of someone who has
   completed it. It is **letter-like**: the ST1 Clarity Letter, in order:
   - **Why this evening exists** (the founder's intention): the few presi3 slides on why discussions
     feel like a waste of time (monologues, disagreement that splits instead of teaching, rooms of people
     who already agree) and "built by someone who paid for the lesson". Keep it to one screen.
   - **ST1 story as a video**, embedded from YouTube, with the story's current image as the thumbnail.
     Under it, the three meanings in one line each (founder-approved wording since 2026-02):
     *Agreement: accept that I'm right. Emotional understanding: feel what I feel. Cognitive
     understanding: reproduce my position accurately. I explain back, you rate it 0–10.*
   - **ST1 point + anti-point** with positions, then **0–10: "how much do you understand the intended
     meaning of this story?"**
   - **The Clarity Meeting Principle** (the thing opted into; a point, not a new story) + its own 0–10.
   - **The roles, stated exactly:** the listener *can* speak (ask, explain back). The listener may not
     **disagree** until they have **heard the speaker's number**, and that number is **at least 8**. A
     listener who disagrees without having heard a number is reminded to ask for it. This replaces the
     presi3 wording, where the number is not required to come first.
   - **The opt-in choice**, which **unlocks only after both 0–10 answers**. Any number unlocks it; the
     gate is answering, not scoring. The host sees both numbers per person, so a 3 followed by an opt-in
     is visible. The commitment is only to answer "how much do you understand my intended meaning,
     0–10?" when asked. (The below-8 rule for disagreement is how the rounds run; nobody opts into it.)
2. **Per-event part, every event.** Positions on the current night's statements (the disagreement
   survey). The statements are written per event by a separate session and swapped each week; this spec
   only needs a slot for them. Also here: the optional **R&D recording volunteer** yes/no. Consent is per
   pair, and volunteers pair only with each other (decisions.md 2026-09-16).

A returning attendee who completed onboarding sees only the per-event part.

### Nothing is hard-blocked; the room is the gate

Registration recommends each part and says why, with nothing enforced step by step. That is one rule instead
of a skip decision for each step:
- The host list shows each person's status: onboarded or not, survey done or not.
- At the door the host asks. Someone not onboarded sits and does it on their phone before joining a pair,
  while the discussion goes on. Latecomers are handled the same way, so no repeats.
- Forcing every step was rejected because people click through anyway, and it is a stack of decisions
  before the first version ships.

### Reaching people who don't have time, and getting them into the room

- The **confirmation email** carries the onboarding link.
- The **reminder** before the event links it again if onboarding or the survey is not done.
- **Join email at start time**: "Clarity Night is starting, join here." One click signs them in and
  opens the event room. The link works for about 3 hours. The host tells the room "open the email and
  click join" instead of walking people through logging in.
- **In the room**, the event page shows "Onboarding not done: do it now" at the top for anyone not
  onboarded (the arrive step in P1337).

### The opt-in stays changeable

The registration choice is the person's current answer. It shows in the room as today (opt-ins visible,
opt-outs never shown, P1114) and can be changed there at any time. The host reminds people of the choice
and invites changes. There is one value, and each change is timestamped. No second, separate in-room
reading.

## Invariants

- A completed universal onboarding is never shown again as required to that person.
- Opt-outs are never shown to other attendees (P1114).
- The host's own account is excluded from every count ([decisions.md](../docs/decisions.md) 2026-09-21).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| People skip onboarding | ACCEPT | The door check catches them; they onboard in the room |
| Confirmation and reminder emails silently lost (fire-and-forget, decisions.md 2026-09-07, P1256) | MITIGATE | Verify both send for every registration on event #2's list |
| Not ready by 2026-09-29 | MITIGATE | Fallback for event #2 only: the video and the questions as a plain page linked from the RSVP confirmation |
| Video shows attendees who never agreed to publication | MITIGATE | Use founder-only footage; check every frame before publishing |

**Non-Goals**
- Do NOT build automatic matching; the survey feeds manual pairing.
- Do NOT change the round flow (P1337) or the deck (P1338).
- Do NOT write the per-event statements here.
- Do NOT touch online or pilot events.

## Acceptance Criteria

- [ ] A new registrant can finish onboarding (video, point, 0–10, roles, opt-in) and the survey on a phone, without help
- [ ] A returning registrant who already onboarded sees only the current event's survey
- [ ] The host list shows, per person: onboarded, survey done, opt-in, survey answers
- [ ] The confirmation email and the reminder carry the onboarding link, verified on event #2's list
- [ ] A person not onboarded sees the onboarding prompt at the top of the event page in the room
- [ ] An opt-in chosen at registration shows in the room and can be changed there
- [ ] The opt-in choice is unavailable until both 0–10 answers are given
- [ ] At start time every registrant gets a join email, and one click signs them into the event room; the link still works 2h later

## Open Questions

1. Which of this belongs to P1055 (the opt-in point set)? Read it and amend it rather than build a
   second opt-in.
2. Reuse the existing Clarity Letter flow (P581) with ST1, anti-point included, or build a page? Prefer
   reuse; build only what the letter lacks (the intention screen, the principle 0–10, the opt-in).
3. **Video:** produced in a separate session from the Zuzalu co-founder talk (June 2026), 12:40–15:20:
   the ST1 story as told live, the short definitions, the 0–10 question. Uploaded to the ClarityPledge
   YouTube channel, thumbnail = the ST1 story image, then embedded here and on the ST1 story. Consent held.
4. **ST1 upgrade, not a fork.** The video becomes ST1's video, and the one-line definitions sit under it.
   Record the change through P784.
5. **Join link lifetime.** Supabase magic links expire according to the project's OTP setting, which is one
   setting for all sign-ins. A ~3-hour link may need its own signed token instead of the shared setting.
   Check before building.
6. **/ready question.** The event room already asks the /ready question on arrival. Recommended: keep it
   there (it asks about *right now*), with the wording taken from the event: "How up for thinking about
   {topic} are you right now?" Filled in automatically for Clarity Nights. Not part of registration,
   because a day-before answer does not measure the evening.

## Related

- [p1337](p1337_event_journey_on_screen_steps_rotation_and_ending.md): the room journey and the ending
- [p1338](p1338_clarity_night_deck_cut_theory_and_run_rounds.md): the deck; theory it cuts lands here
- [p1055](p1055_norm_measurement_instrument.md), P1114, P1179: opt-in point set, event room, opt-in tap
- [p784](p784_st1_st6_restructure_two_needs.md): ST1 content updates
- decisions.md 2026-09-16 [product] ×2 (pair consent; minimum before the opt-in), 2026-09-07 [technical] (P1256)
