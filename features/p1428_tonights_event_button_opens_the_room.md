---
status: week
type: story
rank: 20
workstream: events
created_date: '2026-10-06'
tags: [events, navigation, header]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
exec_model: sonnet
exec_effort: medium
driver: heuristic
---

# P1428: "Tonight's event" opens the event's room

## Problem

**Situation:** On the day of an event they registered for, a signed-in person sees a blue
"Tonight's event" button in the header (P1351). It opens the event page.
**Complication:** On the night, the room is where an attendee needs to be, and the way into it
is hard to find on the event page — at the moment people are arriving at the venue together.
**Question:** Send the button straight to the room, keeping its label?

> Founder, 2026-10-06: "should the tonight button lead the person to the event's room because on
> the event it's hard to find the event room button"

Promoted from the task inbox, 2026-10-06.

## Appetite

Blast radius: low — one link in the header, shown only to registered attendees on event day.
Reversibility: high — one line. Decision density: made (below).

## Solution

The button keeps its label and opens `/events/<slug>/room` instead of the event page. The room
already handles every arrival: it asks "Have you arrived?" first (**Not yet** opens the "See you
soon" page), offers unfinished preparation before entry, and shows the register wall to anyone
not registered. It still hides on the event's own pages, the room included.

Founder decision 2026-10-06, option A of three: keep "Tonight's event" and open the room.
Rejected: B, rename to "Event room" (says nothing about today; "room" means little to a
first-timer; existing materials name the button); C, leave it on the event page.

## Invariants

- The button never shows on the event's own pages, nor on /pricing (P1351, decisions.md
  2026-09-22). On the room it would be a link to the page you are on.
- Gate the label and presence, never the route: `/events/:slug/room` stays open at every time
  state (decisions.md, "Event Room" / "Join now" entry). This change adds no time gating.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Someone taps hours before start and lands in the room flow | ACCEPT | The room's first screen asks "Have you arrived?"; Not yet opens "See you soon" |
| Analytics comparisons across the change | ACCEPT | Same event name and properties; the destination changed on a known date |

**Non-Goals**
- Do NOT rename the button or change its visibility rules.
- Do NOT change the room, arrival or preparation flows.

## Acceptance Criteria

- [ ] On event day, a registered attendee tapping "Tonight's event" (phone and desktop) lands in
      the room flow for that event, not the event page
- [ ] The button is still absent on the event page and its sub-pages (room, ready, meet,
      arriving, prepare, close)
- [ ] Existing header tests pass with the new destination
- [ ] Adversarial review (Opus, Codex) run; each finding verified, fixed or answered

## Related

- P1351 — created the button and its visibility rules.
- P1423 — the session in which this was decided.
