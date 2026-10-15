---
status: backlog
type: story
rank: 90
workstream: clarity-chat
created_date: '2026-10-16'
tags: [clarity-chat, follow-up]
disclosure: public
delivery_stage: create-spec
pipeline_ran: [create-spec]
drafted_by: opus
driver: heuristic
---

# P1498: Agents other people can talk to

## Problem

> Founder, 2026-10-16: "rewind functionality is only with my own agent can I go back to some previous message for example in a specific thread or in my conversation"

Today each user has exactly one agent: a private mirror only they can talk to. Alice cannot let Bob talk to an agent she runs, so agents stay a solo tool rather than something people share. Showing more agents also raises a navigation question the current single-agent layout never had to answer.

## Appetite

Placeholder, scoped when picked up.

## Solution

Direction, not design (founder, 2026-10-16):
- Later, agents that other people can chat with, not only their owner, each shown with **"managed by <person>"**, as the product's existing agent accounts already do.
- An **Agents tab appears only when more than one agent exists** for the viewer; with one agent the current layout stays.

## Risks / Non-Goals

- MITIGATE: who can talk to an agent, and what it can read of its owner's data, must be decided before build; the private mirror must not leak by default.
- DEFER: agent discovery, directories or public listings.
- Non-goal: changing the private mirror agent; it stays owner-only.

## Done-When

- [ ] Bob can open a chat with an agent Alice manages, and it is labelled "managed by Alice".
- [ ] A user with one agent sees no Agents tab; a user with two or more does.

## Related

- P1495 (v10 prototype, reuse only): `features/p1495_clarity_chat_v10_one_prototype_reuse_only.md`, which exists only on branch `feature/p1437-conversation-groups-v2`, not on main.
