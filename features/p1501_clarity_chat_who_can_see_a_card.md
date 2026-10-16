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

# P1501: Who can see a card

## Problem

> Founder, 2026-10-16: "If it's private, then it's shared with specific people. And sometimes I don't see who it's shared with"

A card does not say who can see it. In v11 the answer is implicit: a public card is seen by anyone, a private card in a chat by that chat's members, and a draft only by its author. Once cards travel further, Bob has no way to know whether a card is private to him, shared with Alice, or visible to more people.

## Appetite

Placeholder, scoped when picked up.

## Solution

Direction, not design (founder, 2026-10-16):
- A card shows its **visibility list** ("Shared with: Alice"), like a chat's member list.
- **Deferred** because v11 grants no permissions: a card is public (seen by anyone), private in a chat (seen by its members, never forwarded), or a draft (seen only by its author).

## Risks / Non-Goals

- MITIGATE: the list must match who can actually read the card; a list that understates access is worse than none.
- Non-goal: per-card permission controls while v11 has no permission model.
- DEFER (open questions): items forwarded further by others (does the list grow, does the author see it)? Public vs private display (how does a card read when anyone can see it)?

## Done-When

- [ ] Every card shows who can see it, and the list matches actual read access.
- [ ] The open questions above are answered before build.

## Related

- P1495 (v10 prototype, reuse only): `features/p1495_clarity_chat_v10_one_prototype_reuse_only.md`; its latest copy is on branch `feature/p1437-conversation-groups-v2` (main holds an older one).
