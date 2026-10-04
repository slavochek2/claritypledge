---
status: week
type: story
rank: 21
workstream: growth
created_date: '2026-10-04'
tags: [feed, landing, events, groups, mobile]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
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

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Block pushes the feed down on phones | MITIGATE | Compact rows, max 2 events; measured at 320/375 |
| Extra requests on every home visit | ACCEPT | One events + one groups list read; small |

- Do NOT change the header button, the tabs, or the featured story.

## Acceptance Criteria

- [ ] Phone (320/375): Next events (≤2, each opens its event page) and Groups (each by name, opens its group page) visible above the feed, no sideways scroll
- [ ] Desktop: right column shows Groups by name first, then Next events
- [ ] With no upcoming events, the block says so and still links to all events; failures never break the feed
- [ ] Independent review of the built result (screenshots + code)

## Related

- P1392 (feed-first home), P1397 (featured story), P1400 (meta-events placeholder)
