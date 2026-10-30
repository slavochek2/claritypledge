---
status: all-done
type: story
rank: 1
workstream: events
created_date: '2026-10-30'
tags: [events, social-hike, ux, loading, navigation]
disclosure: public
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
completed_at: 2026-10-30
---

# P1595: Event room polish and the registered page

## Problem

Founder UAT of P1542/P1594 on localhost, 2026-10-30:

> "the Clarity Pledge Loading Indicator. Within Event Room, when things load, it's not centered ... it's not taking into account if my sidebar on desktop is open or closed"

> "we still have some back buttons nested" (screenshot: the in-room Share feedback step shows "Back to the event" in the room header AND a second "← Group terms" header above "Join Clarity Practice Community")

> "when I go to the /confirm page after registration, it says learn about Clarity Practice Community. But it's not clear ... It should say this event is organized by the Clarity Practice Community ... And that's a link ... why would they want to learn if maybe they didn't see that this is organized by the clarity practice community? ... there is like a big spacing generally on that page"

## Appetite

Low blast radius (event room chrome, the post-registration page). Fully reversible (code only, no schema). Decision density: low for 1-2; copy on the registered page is founder-delegated ("up to you") but shown to the founder before shipping.

## Solution

1. **Loader centred in the content area.** In the event room (and anywhere the unified loader shows inside the app shell), centre it on the content column, not the viewport, so it stays centred with the desktop sidebar open or collapsed.
2. **One Back.** Inside the room, an embedded flow (the group join / terms step on Share feedback, and any other embedded page that brings its own header) must not render its own back header; the room header's single "Back to the event" is the only Back. Audit every embedded view in the room for the same nesting.
3. **The registered page.** After registering, say plainly who organises the event, with the community name linking to the community page, then why learning about it matters, then the learn CTA. Tighten the spacing and the visual hierarchy (one primary action). The copy and layout are critiqued by Gemini first; the founder sees the result before ship.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Copy on the registered page is a value proposition | MITIGATE | Founder delegated; draft is critiqued and shown before ship |
| Membership benefits are not defined | DEFER | Founder will write a separate spec |

Non-goals: do NOT define membership benefits; do NOT change registration logic; do NOT change Clarity Night copy beyond the registered page's shared parts.

## Acceptance Criteria

- [x] The room loader is centred on the content column with the desktop sidebar open and collapsed (screenshots at both, plus 375px)
- [x] Share feedback's group join step in the room shows exactly one Back (the room header's)
- [x] No other embedded room view renders a second back header (audit listed in the report)
- [x] The registered page names the organising community as a link to its page, explains why to learn, and has one primary CTA
- [x] The registered page's spacing and hierarchy are checked at 375px, 320px and desktop
