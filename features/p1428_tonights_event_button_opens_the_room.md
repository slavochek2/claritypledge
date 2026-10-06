---
status: week
type: story
rank: 20
workstream: events
created_date: '2026-10-06'
tags: [events, navigation, header]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
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

The button keeps its label. It opens `/events/<slug>/room` **while the room is the place to be**:
the event runs a room flow (preparation on) and the room's own arrival window is open, from an hour
before the start until the end. That is the same window in which the room asks "Have you arrived?".
Otherwise it opens the event page as before: hours before the start, after the event ended, and for
events with no room flow (a hike). It still hides on the event's own pages, the room included.

Founder decision 2026-10-06, option A of three: keep "Tonight's event" and open the room.
Rejected: B, rename to "Event room" (says nothing about today; "room" means little to a
first-timer; existing materials name the button); C, leave it on the event page.

**Corrected during the build (adversarial review, Opus + Codex):** the first version linked to the
room all day, on the claim that "the room asks Have you arrived? first, so early taps are handled".
That claim was wrong: the question only appears inside the window and only for preparation events.
A hike attendee would have landed on a conversation-practice screen, and a tap after the end on the
ready screen of a finished event. The window rule replaces it; the founder's "keep it simple, the
event page later in the day" fallback from the decision conversation is what it implements.

## Invariants

- The button never shows on the event's own pages, nor on /pricing (P1351, decisions.md
  2026-09-22). On the room it would be a link to the page you are on.
- Gate the label and presence, never the route: `/events/:slug/room` stays open at every time
  state (decisions.md, "Event Room" / "Join now" entry). This change adds no time gating.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Someone taps hours before start, or after the end | MITIGATE | Outside the arrival window the button opens the event page |
| A tab left open across the window start keeps the old link until the header re-renders | ACCEPT | Any navigation re-renders it; the event page still offers the way in |
| Analytics comparisons across the change | ACCEPT | Same event name and properties; the destination changed on a known date |

**Non-Goals**
- Do NOT rename the button or change its visibility rules.
- Do NOT change the room, arrival or preparation flows.

## Acceptance Criteria

- [x] On event day, inside the arrival window of a preparation event, a registered attendee
      tapping "Tonight's event" lands in the room flow; earlier, after the end, or for an event
      without a room flow, on the event page — `e2e/p1351-header-contexts.spec.ts` (both
      destinations, real browser, 3/3) and `src/tests/p1351-tonights-event.test.ts` (window edges)
- [x] The button is still absent on the event page and its sub-pages — `p1087-nav-groups` asserts
      the page, room, ready, meet and arriving (the rule is a prefix match, so prepare and close too)
- [x] Existing header tests pass with the new destination — 29/29 unit, e2e 3/3; the room-href
      test fails when the old href is restored (control run)
- [x] Adversarial review (Opus, Codex) run twice; each finding verified. Pass 1 found the all-day
      room link wrong for hikes and post-event taps: fixed by the window rule. Pass 2 (final
      version): no defect; both new columns verified on prod and test; the stale link on an idle
      tab is accepted (Risks)

## Related

- P1351 — created the button and its visibility rules.
- P1423 — the session in which this was decided.
