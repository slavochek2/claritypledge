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

# P1500: Clarity Canvas from event threads

## Problem

> Founder, 2026-10-16: "Process it all together and update my Clarity Canvas. That's a very different way to interacting with my agent."

At events, table conversations get transcribed into threads of the event channel via /transcribe, but that output stays in the thread. An attendee's Clarity Canvas does not learn from it, so what was said at the table never reaches the place where Alice keeps her own picture.

## Appetite

Placeholder, scoped when picked up.

## Solution

Direction, not design (founder, 2026-10-16):
- An attendee (or the host) has a Canvas; event channel table threads carry /transcribe output.
- The agent updates **a specific Canvas** from one or several of those threads.

## Risks / Non-Goals

- MITIGATE: a transcript holds other attendees' words; consent and visibility must be settled before any Canvas reads it.
- DEFER: automatic updates without a person choosing the thread and the Canvas.
- DEFER (open questions): who links a thread to a Canvas, the attendee or the host? Which Canvas? Snapshot (one-time update) or live (keeps following the thread)?

## Done-When

- [ ] The open questions above are answered by the founder.
- [ ] After a table thread is linked, the chosen Canvas reflects its /transcribe content.

## Related

- P1495 (v10 prototype, reuse only): `features/p1495_clarity_chat_v10_one_prototype_reuse_only.md`, which exists only on branch `feature/p1437-conversation-groups-v2`, not on main.
