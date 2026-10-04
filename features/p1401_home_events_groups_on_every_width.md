---
status: qa
type: story
rank: 21
workstream: growth
created_date: '2026-10-04'
tags: [feed, landing, events, groups, mobile]
disclosure: public
delivery_stage: ship
pipeline_ran: [create-spec, dev, ship]
drafted_by: opus
exec_model: opus
exec_effort: medium
---

# P1401: Next events and groups on the home page at every width

## Problem

> Founder, 2026-10-03/04: "very often I want to go immediately to see events or to show a group" · "on the mobile ... they don't find the events and groups" · "Can you just kiss it and do it yourself?"

P1392 put next events and a generic "Explore groups" card in a desktop-only side column. On phones — most visitors, and the founder showing the site to someone — the home page shows no event and no group. The current goal is "come to our next event" (decisions.md 2026-10-04 hand test; P1400 placeholder).

## Appetite

Blast radius: the home page for everyone. Reversibility: git revert. Decision density: none left — founder delegated layout.

## Solution

One component, two placements, same content:
- **Next events**: the next 2 of OUR upcoming events (title, date), each opens its own event page; "All events" link.
- **Groups**: each public group by name, each opens its group page; "All groups" link.
- **Desktop**: right column as today, Groups first then Next events (founder: groups higher).
- **Phones**: the same two lists as a compact block at the top of the page, above search; then the feed.
- The header button is unchanged here. It switches to "Join the next event" when the first online event is published (separate change).

**Design pass (founder, 2026-10-04):** events use the canonical EventCard (banner), groups use the groups-page initials tile, featured story shows author + video thumbnail (play opens AND plays), tag cloud = event topic tags + understanding/misunderstanding (+aisafety1, which predates `statement_tag`).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Block pushes the feed down on phones | MITIGATE | Compact rows, max 2 events; measured at 320/375 |
| Extra requests on every home visit | ACCEPT | One events + one groups list read; small |

- Do NOT change the header button, the tabs, or the featured story.

## Acceptance Criteria

- [x] Phone (320/375): Next events (≤2, each opens its event page) and Groups (each by name, opens its group page) visible above the feed, no sideways page scroll — browser; several events form a swipe row (render test; test data has 1 upcoming event). `[post-deploy]` see the row with real events
- [x] Desktop: right column shows Groups by name first, then Next events — browser 1280
- [x] With no upcoming events, the phone block hides the events half (no "none" banner at the top); a network failure left the feed and groups working — observed during a real network drop
- [x] Independent review of the built result (screenshots + code) — two Opus reviews; fixes applied, remaining items recorded in the final report

## Related

- P1392 (feed-first home), P1397 (featured story), P1400 (meta-events placeholder)
