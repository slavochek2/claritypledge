---
status: backlog
type: story
workstream: events
created_date: '2026-09-22'
tags:
  - ready
  - events
disclosure: public
delivery_stage: create-spec
pipeline_ran:
  - create-spec
drafted_by: opus
driver: founder
related:
  - p1083
  - p1114
  - p1336
rank: 1000094.0
---

# P1356: /ready shows who is how ready, with faces instead of anonymous dots

## Problem

**Situation:** /ready (P1083) and the event room's ready step (P1114) show everyone else's answer to
"How up for thinking are you right now?" as faint anonymous marks. The anonymity was an engineering
choice: the values come from a function that carries no identity, so that the room roster (public by
name) and the distribution would not contradict each other. No founder decision required it.

**Complication:** Anonymous dots say little. A room is people, and a readiness number means more when
you can see whose it is, the way people answer "how are you?" with a thumbs up in a group chat. At Clarity
Night #1 nobody objected to their state being visible.

> Founder, 2026-09-22: *"should ready be improve with pictures of people instead of anonymous dots? i
> think it will make it better honestly … if people are signed in then with picture otherwise without"*
> and *"full avatar with pledgers circle if there is one."*

## Solution

- **Event room ready step:** each other attendee's mark is their full avatar, with the pledger circle
  where they have one. The roster is already public by name, so this adds the number to a face people
  can already see.
- **General /ready:** signed-in respondents show as their avatar (with the pledger circle); anonymous
  respondents stay as dots. Both appear on the same track.
- **Question wording, event room:** for a Clarity Night the question is "How up for thinking about
  the following topic are you right now?" with the topic under it. The topic is taken from the event
  title automatically: the part after "Clarity Night #n: " (the series title format), so the host never
  types it separately. Every other event (hikes, talks) keeps the generic question.

## Invariants

- Identity reaches the distribution only for signed-in respondents; anonymous answers never gain one.
- /ready answers stay short-lived (the 10-minute retention in P1083 is unchanged).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Someone does not want their low number seen | ACCEPT | Founder call; no objection seen at event #1. Revisit on the first complaint |
| Many faces crowd the track | MITIGATE | Reuse P1083's overlap handling; avatars stack at the same value |

**Non-Goals**
- Do NOT add a per-person privacy toggle in the first version.
- Do NOT move /ready into registration (P1336 keeps it at the door).

## Acceptance Criteria

- [ ] In an event room, each other attendee's ready answer shows as their avatar, with the pledger circle where present
- [ ] On /ready, signed-in answers show avatars and anonymous answers show dots
- [ ] A Clarity Night's ready question shows the topic taken from its title; a hike shows the generic question
- [ ] Answers still disappear after 10 minutes

## Open Questions

1. The P1114 room distribution is built on an identity-free function by design. Replacing it is a
   deliberate reversal. Record it in decisions.md when this ships.

## Related

- P1083 (the /ready distribution), P1114 (the event room),
  [p1336](p1336_registration_carries_opt_in_prep_and_survey.md) (registration; /ready stays at the door)
