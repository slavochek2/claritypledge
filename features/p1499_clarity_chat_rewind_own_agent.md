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

# P1499: Rewind in conversations with your own agent

## Problem

> Founder, 2026-10-16: "rewind functionality is only with my own agent can I go back to some previous message for example in a specific thread or in my conversation"

When a conversation with your own agent goes down a wrong path, the only option is to keep going or start over. Every later reply carries the wrong turn forward. Alice needs a way to return to the point where it went wrong and continue from there.

## Appetite

Placeholder, scoped when picked up.

## Solution

Direction, not design (founder, 2026-10-16):
- In an agent thread or the agent chat, Alice can pick an earlier message and **rewind**: everything after it is discarded and the conversation continues from there.
- **Never in chats with people.** Rewind exists only where the other party is your own agent.

## Risks / Non-Goals

- MITIGATE: discarding is destructive: show what will be removed before confirming, and define before build what happens to anything the agent derived from discarded messages (cards, drafts, memory).
- Non-goal: rewind, edit or delete in chats with people, or in shared threads with more than one human.
- DEFER: branching (keeping both paths); first ship discards.

## Done-When

- [ ] In her own agent chat, Alice can rewind to an earlier message and the later messages are gone.
- [ ] No rewind control appears in any chat that includes another person.

## Related

- P1495 (v10 prototype, reuse only): `features/p1495_clarity_chat_v10_one_prototype_reuse_only.md`; its latest copy is on branch `feature/p1437-conversation-groups-v2` (main holds an older one).
