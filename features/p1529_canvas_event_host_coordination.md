---
status: backlog
type: story
rank: 320
workstream: clarity-canvas
created_date: '2026-10-21'
tags: [events, host, canvas]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: heuristic
---

# P1529: Host controls for a Canvas event (placeholder)

> **Placeholder.** Filed to hold the question, not to be built. The flow is not thought through yet.

## Problem

The event room pairs attendees by their largest disagreement, assigns speaker / listener / observer,
rotates them, and lets the host switch the topic per round. It picks points one way only: public
points carrying the event tag (`src/app/data/compare-service.ts:27`). Canvas points carry the
owner's project tag and are shared with the event (P1515), so the room finds none of them.

> Founder, 2026-10-21: "I think this spec has to be completely different. We need to think through
> the whole flow ... adjusting host controls and host coordination of attendees so it works not
> just for matching, but generally works for the Canvas event."

Inside a canvas shared with the event, everything is visible to the attendees (founder: "there are
no private parts").

## Appetite

Unknown until the flow is designed.

## Approach

Before any spec: walk the whole Canvas event flow (`docs/goals.md` 3a; the private event brief),
from attendees arriving with canvases, through understand-then-challenge rounds, owners updating
their canvas, to session 2. Then decide what the host needs to see and steer at each step; pairing
on canvas points is one part of it.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| The first event runs before this is built | ACCEPT | Host coordinates by hand; what that teaches feeds this spec. |

**Non-Goals**
- Do NOT build from this placeholder.

## Done-When

- [ ] The whole Canvas event flow is written down and reviewed with the founder.
- [ ] This placeholder is replaced by a real spec, or closed.

## Related

- P1515 sharing with events and groups · P1508 Clarity Canvas · P1512 Clarity Chat v1 (event channel)
