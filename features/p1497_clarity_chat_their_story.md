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

# P1497: "Their story" as an add-on to points and stories

## Problem

> Founder, 2026-10-16: "But maybe we should simplify and call it add their story. And everywhere else we say their story, so add their story."

Bob can state his own position, but has no way to show he understands Alice's side in her own terms. The v10 prototype had this as a "reverse story"; v11 dropped it. A story written from Alice's side, by Bob, is the strongest form of an explain-back, and it needs a home on points and stories.

## Appetite

Placeholder, scoped when picked up.

## Solution

Direction, not design (founder, 2026-10-16):
- Bob writes Alice's story from her side, as an add-on to a point or story, via a button **"Add their story"** next to Alice's position.
- Only possible **once Bob has guessed Alice's position** on that point: the guess ties the draft to a person.
- Rename "reverse story" to **"their story"** everywhere (UI copy, code identifiers, docs).
- Reuse the v10 code and visuals ("Alice in Bob's eyes", dashed avatar, EyesMark) from branch `feature/p1437-conversation-groups-v2`.

## Risks / Non-Goals

- DEFER: Alice rating or responding to the story Bob wrote; first ship is writing and showing it.

## Done-When

- [ ] After guessing Alice's position, Bob sees "Add their story" next to it and can save a story shown as "Alice in Bob's eyes"; before a guess exists, the button is absent.
- [ ] No user-facing "reverse story" string remains.

## Related

- P1495 (v10 prototype, reuse only): `features/p1495_clarity_chat_v10_one_prototype_reuse_only.md`; its latest copy is on branch `feature/p1437-conversation-groups-v2` (main holds an older one).
