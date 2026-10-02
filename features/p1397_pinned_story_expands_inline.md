---
status: week
type: story
rank: 20
workstream: growth
created_date: '2026-10-02'
tags: [feed, landing, pinned-story]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: opus
exec_effort: medium
---

# P1397: Pinned story expands in place; no point-pin icon on a story

## Problem

P1392 pinned story 1 for signed-out visitors as a bar that navigates to /story/:id.

> Founder, verbatim: "it should expand right on the page ... so they can see the full story. Because now they are redirected to another page and that's weird ... the pin is reserved for points but this is a story so we probably don't want to use the pin"

The pin icon marks a Point across the app (PointHeader, point cards), so it mislabels a story.

## Appetite

Blast radius: one component on the signed-out feed. Reversibility: git revert. Decision density: one copy call (label).

## Solution

1. Collapsed bar: no pin icon. Label **"Featured story"** [FOUNDER DECISION: label proposed 2026-10-02, change if wanted] + the story title + an expand chevron; a play icon signals the video.
2. Tap expands IN PLACE to the full feed story card — video, text, and its linked points (fetched for that one story). Tapping the bar again collapses. No navigation.
3. /builders: remove the "Starts with a 15-min call." microcopy under the CTA (founder, 2026-10-02 — redundant with the button text).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Expanded card is long on phones | ACCEPT | It is the story the visitor chose to open |
| Points fetch fails | MITIGATE | Card renders without the points expander, as in the feed |

- Do NOT add an end-of-video letter CTA (INBOX-112).

## Acceptance Criteria

- [ ] Signed-out /feed shows a "Featured story" bar with no pin icon
- [ ] Tapping it expands the full story (video + text + "N points" button) on the same page; tapping again collapses; URL unchanged
- [ ] /builders shows no "Starts with a 15-min call." line
- [ ] 320 / 375 / desktop: no overflow in collapsed or expanded state

## Related

- P1392 (pinned story 1, feed-first homepage)
