---
status: week
type: story
rank: 86
workstream: events
created_date: '2026-11-02'
tags: [events, hike, reviews, ux]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
driver: anomaly
---

# P1600: Hike page reviews show in full

## Problem

Review cards on Social Hike pages stop after 6 lines (about 240 characters on a phone-width card, an estimate from the card width), with no way to read the rest. A newcomer sees sentences cut off midway, and long recommendations lose the lines that matter most.

> Founder, verbatim: "it should be good to read and user friendly.. just lcicking and expanding is weird.. where it expands? down?"

## Appetite

Blast radius: one component on hike pages. Reversibility: git revert. Decision density: one, the founder approves the look on localhost.

## Invariants

- Reviews stay a swipeable row, never a growing list (founder 2026-10-04).

## Solution

Show every review in full inside the existing swipeable row, with cards in a row sharing one height and no tap needed. An independent visual review by the Gemini review model (`gemini-4-argon`) of desktop and mobile screenshots feeds the refinements. The founder then approves on localhost.

## Alternatives Considered

- Tap to expand in place: rejected by the founder; one card growing changes the row height and shifts the page.
- Stacked full reviews: conflicts with the 2026-10-04 ruling.
- "Read more" opening a pop-up: fallback if the full row proves too tall on a phone.
- Trimming long quotes: fixes one quote and edits people's words.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A long quote makes the whole row tall on a phone | MITIGATE | Check at 320px and 375px with the longest real quote; fall back to the pop-up if the founder rejects it |
| Short quotes leave empty space in a tall card | ACCEPT | Judged in the visual review |

**Non-Goals**
- Do NOT add a moderation UI or change the schema.
- Do NOT write to prod data as part of this work. Adding a new quote and re-ranking is a separate data step needing founder go-ahead.

## Acceptance Criteria

- [ ] With several reviews, every review reads to its last word without any tap, at 320px, 375px and desktop
- [ ] Reviews still swipe sideways, and all cards in the row are the same height
- [ ] No horizontal page overflow at 320px
- [ ] Gemini review model critique received; each finding fixed or rejected with a reason
- [ ] Founder approved the look on localhost
