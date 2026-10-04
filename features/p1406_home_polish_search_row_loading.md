---
status: backlog
type: story
rank: 312
workstream: growth
created_date: '2026-10-04'
tags: [feed, featured-story, polish]
disclosure: public
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: low
---

# P1406: Home polish: search row, steady loading, featured box holds the story

## Problem

> Founder, 2026-10-04: "share story above everything then it has a search field so maybe they need to be in one line" · "groups is smaller text than ... the stories and points tabs" · "Next events or next event? On desktop ... only one event" · "when it's loading, groups appear, and then something is switching, the interface is moving. Can we do loading smooth?" · "Hide is weird ... if it says nothing, and then it says hide" · open, "it doesn't encompass the story inside it".

## Solution

- Signed in: Share a Story sits on the search row, right of a shorter search field.
- Side/top section headings match the tab text size; "Next event" when there is one.
- Loading reserves space: tag row placeholder, featured-bar placeholder, group placeholders the size of real cards.
- Featured story: chevron only in both states (no Hide text); open, the blue box wraps the story card.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Rail alignment drifts with the bigger heading | MITIGATE | Re-measure at 1280px |

- Do NOT change who sees the featured story (signed-out only).

## Acceptance Criteria

- [ ] Signed in, Share a Story and search share one row at 375px and desktop
- [ ] Section headings are the same size as the tab labels; label reads "Next event" for one event
- [ ] Featured bar shows no Hide text; open, the story card sits inside the blue box
- [ ] Loading: tags, featured bar and groups hold their space (no jump when data arrives)
- [ ] Desktop: first group card top still level with the featured bar
