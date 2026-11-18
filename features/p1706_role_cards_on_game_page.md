---
status: ready-for-qa
type: story
rank: 343
workstream: events
created_date: '2026-11-18'
tags: [listening-game, role-card, public-page, mobile]
disclosure: public
pipeline_ran: [dev, ship]
delivery_stage: ship
drafted_by: opus
exec_model: opus
exec_effort: high
driver: heuristic
---

# P1706: The speaker/listener card on /game

## Problem

The printed lanyard card (docs/events/badges/) teaches the speaker and listener jobs, but nobody can see it before an event.

> Founder, verbatim: "Should we make slash cards as demonstration of how cards look like on both sides or put them embedded in slash game"

## Appetite

Small: one component on an existing page.

## Solution

/game shows both sides of the card next to each other under the roles: Front (orange, speaker) and Back (blue, listener), printed wording, proportions from card.css. Caption (founder-approved): "Speaker and listener each wear a two-sided card, with the job written for the person facing them. Flip it when you switch roles." No separate /cards page (decisions.md 2026-11-18).

## Risks / Non-Goals

- Not added to the preparation step (ListeningGameScreen) yet.
- Card wording now lives in the print files and `ROLE_CARDS`; both change together.

## Done-When

- [x] /game shows both card sides with the printed wording, under the roles. Evidence: screenshot at 320px, this session.
- [x] No overflow at 320px: card children inside their card, `scrollWidth` 320.
- [x] Existing /game tests pass (p1696-game-page, 14/14).
