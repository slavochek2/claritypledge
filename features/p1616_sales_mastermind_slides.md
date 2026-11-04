---
status: week
type: story
rank: 94
workstream: events
created_date: '2026-11-04'
tags: [events, sales-mastermind, slides]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
blocked_by: [p1529]
---

# P1616: Slides for running the sales mastermind evening

## Problem

The host runs the evening with slides on the projector, and `/presi4` is the 6 October Clarity Night deck. It teaches another format and does not mention the hands-up signal, the lower-number rule or the canvas update.

> Founder, 2026-11-04: "we will duplicate slash Prezi4 and then improve it a bit so I can run the event properly with slides." The hands-up slide is there "so I don't forget".

## Appetite

Blast radius: one static page. Reversibility: git revert. Decision density: the slide wording is the founder's.

## Solution

A new static deck copied from `/presi4`, reachable at its own path, leaving `/presi4` unchanged. Blocked by P1529 so its slides describe the room as built. Slides, in the run-of-show's order (`docs/events/sales-mastermind.md`):

1. Welcome and what the evening is for.
2. The three roles: Clarity Canvas owner, partner, observer.
3. A cue for the scripted 3-5 minute live demo with two people from the room, filmed for reuse. No questions.
4. The hands-up signal: count down, hand up, everyone who sees it does the same and stops talking.
5. The rule: both say a number, the lower one counts, above 8 the partner may challenge, below it back to understanding.
6. Recording check: mics on, transcription on in the event room.
7. What happens at the canvas update step.
8. The close and the next session.

`[FOUNDER DECISION: all slide wording and the deck's path name.]`

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Copied slides embed live event pages tied to a past event | MITIGATE | Every embed is removed or pointed at the mastermind event; the hard-coded event is checked before use |

**Rulings carried:** `docs/decisions.md` on `/presi4`'s principle slide: the projector quotes the principle's real wording, never a paraphrase of what people read on their phone.

**Non-Goals**
- Do NOT change `/presi4` or the live `/presi`.
- Do NOT build animation or a role-teaching video; the demo is live.

## Done-When

- [ ] The deck opens at its own path at projector size, and every slide above is present with the founder's approved wording.
- [ ] No slide or embed points at a past event, checked by clicking through on TEST.
- [ ] `/presi4` is unchanged, shown by an empty diff.

## Related

- P1529 the mastermind's registration, room and host flow.
