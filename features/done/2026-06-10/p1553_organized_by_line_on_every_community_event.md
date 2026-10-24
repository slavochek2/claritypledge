---
status: all-done
type: story
rank: 65
workstream: events
created_date: '2026-10-23'
tags: [events, community, event-page]
disclosure: public
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
completed_at: 2026-10-24
---

# P1553: "Organized by" line on every community event

## Problem

The event page names the organising community only on hike pages (P1403, `HikeOrganizerLine`,
shown when `hikeSeriesSlug && organizer`). Every other event that belongs to a community says
nothing, so hosts paste "Organized by the … Community" into the description by hand, usually at
the bottom (the sales mastermind test event has it as the description's first line).

> Founder, 2026-10-23: "I think it should be at the top, just below the title. Didn't we
> standardize it? ... Do we need to standardize something that it automatically puts organized by
> blah, blah, blah, by the community if it is part of the community?" Then: "yes do it".

## Appetite

Blast radius: one component on one page. Reversibility: git revert. Decision density: zero (placement
decided by the founder: just below the title).

## Solution

Show the existing organizer line on every event whose `org_id` is set, directly below the title, the
same line hikes use today: "Organized by <community name>", the name linking to `/groups/<slug>`.
Fetch the organizer for every event with an org, not only hikes. Events without a community show no
line.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Events that already say "Organized by" in the description show it twice | ACCEPT | Hosts drop the hand-written line; the sales mastermind copy drops it when this ships |
| One more request per event page load | ACCEPT | One small read, already made on hike pages |

**Non-Goals**
- Do NOT change the hike page's order of sections.
- Do NOT edit existing event descriptions.
- Do NOT add organizer controls or a community picker.

## Acceptance Criteria

- [x] A non-hike event with a community shows "Organized by <name>" directly below the title, linking
      to the community page (screenshot, desktop and 375px). Verified on TEST, sales-mastermind-test,
      1440px and 375px: "Organized by Clarity Practice Community · Chiang Mai" → /groups/cm, no overflow.
- [x] An event with no community shows no organizer line. Unit test p1553 (b).
- [x] Hike pages look as before. Unit test p1553 (c) plus the p1414/p1517 suites; not checked by screenshot.

## Related

- [P1403](p1403_social_hike_event_layout.md) hike layout, where the line comes from
- P1517 / P1518: the line's link and its "nothing else on the line" rule
