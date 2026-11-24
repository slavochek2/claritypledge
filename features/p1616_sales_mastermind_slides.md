---
status: qa
type: story
rank: 94
workstream: events
created_date: '2026-11-04'
tags: [events, sales-mastermind, slides]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

A copy of `/presi4` with the event substituted, at `/presi5`, leaving `/presi4` unchanged (founder, 2026-11-23: "copy /presi4 as is mostly and just substitute the event"; a first 8-slide draft written from the run-of-show was rejected as invented). Founder-approved main run, after three rounds of edits on 2026-11-23:

1. Title: the published event title and subtitle, QR and link to `/sales`.
2. Agenda.
3. Why many business discussions fail (owner doesn't see the full picture; partner doesn't understand it; when challenged, the owner assumes and never verifies).
4. Shared challenge. 5. Thinkers. 6. Closed-Loop Communication. 7. Admit "I don't understand". 8. Listen for the speaker's intended meaning. 9. What is Cognitive Understanding?
10. Hands up: "When my hand goes up, yours goes up too" / "See a hand up? Raise yours and stop speaking." Bell and host behaviour in the notes.
11. The event page, embedded (how to join, where to switch on recording). 12. The host screen page (table arrangement).
13. Q&A. 14. Universal values (integrity, intellectual integrity, intellectual honesty, reworded). 15. Join the community. 16. Close: 3 minutes of feedback, then "photo in three minutes". 17. Group photo. 18. Calendar.

The Ikigai slide and the mirror-agents slide are removed; the host compare view, how a round works, the no-number exception and the demo round sit in the backup block with /presi4's backup slides.

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

- [x] The deck opens at its own path at projector size, and every slide above is present with the founder's approved wording. (Founder reviewed it on localhost:5117/presi5 over three rounds and approved with "ok ... ship", 2026-11-24; `src/tests/p1616-presi5-deck.test.ts` 8/8.)
- [x] No slide or embed points at a past event. (Every embed points at the Sales Mastermind event of 2026-11-26, read from the prod event row; `/sales` 307s to the same page; asserted in the deck test. The embeds are prod pages, so the click-through is on prod at the event, not TEST: the frames are blank on localhost by design.)
- [x] `/presi4` is unchanged, shown by an empty diff.

## Related

- P1529 the mastermind's registration, room and host flow.
