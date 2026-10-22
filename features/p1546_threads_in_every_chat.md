---
status: in-progress
type: story
rank: 58
workstream: clarity-chat
created_date: '2026-10-22'
tags: [chat, threads, mirror]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: opus
exec_effort: high
---

# P1546: Threads in every chat: direct messages and the mirror, and the mirror answers inside its thread

## Problem

Threads exist in channels only (`src/app/pages/chat/ChatHomePage.tsx:65`: "a thread URL on a 1:1 or the mirror falls back to the chat"). That was a deliberate carry-over from the Telegram-based frame (decisions.md, P1495 prototype entry). In a direct message you cannot split a side topic out. In the mirror you cannot keep separate subjects apart. P1536 needs exactly that: *+ Canvas* opens a new mirror thread.

> Founder, 2026-10-22: "in one-on-one chats, I don't have threads. But why not? Maybe we should allow that. And then chat with the mirror is one of those."

The mirror's answers today carry `reply_to_id` but never `thread_root_id` (`supabase/migrations/20261020213000_p1520_mirror_v2.sql`, completion insert), so an answer would land outside the thread it was asked in.

## Appetite

Blast radius: medium. Thread rules for two more conversation kinds, plus mirror reply placement. Reversibility: medium (RLS/RPC plus UI). Decision density: zero.

## Solution

1. **Server.** Allow thread roots and thread replies in `dm` and `mirror` conversations. `/dev` finds the channel-only condition in `send_chat_message`, the thread read RPCs and RLS. A thread reply is readable exactly by whoever can read its conversation:
   - in a direct message, the two people;
   - in the mirror, the owner only.
2. **Client.** New thread is offered in direct messages and the mirror. The thread panel and thread URLs work there, and reloading a thread URL opens the thread.
3. **Mirror answers in place.** A mirror job triggered by a message inside a thread inserts its answer with that thread's `thread_root_id`. A message outside any thread is answered outside threads. For context, a mirror question asked inside a thread sees that thread first. The general context rules stay P1520's until P1547.

**Copy:** every user-facing string says "mirror agent", never bare "mirror" (founder, 2026-10-22; P1544 Solution 0).

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| A thread reply in a DM leaks to a third person | MITIGATE | RLS check by curl with a third user |
| Mirror answer lands in the wrong thread when two are asked at once | MITIGATE | Job carries the triggering message's root; concurrency test |
| A deleted thread root orphans its replies | MITIGATE | Same behaviour as channels today; e2e covers it |

**Non-Goals:**
- Do NOT change channel threads.
- Do NOT change the context size (P1547).
- Do NOT add Clarify inside the mirror.

## Acceptance Criteria

- [ ] In a direct message, New thread opens a thread; both people read it; a third signed-in user gets nothing (curl).
- [ ] In the mirror, a question inside a thread is answered inside that thread; a question outside threads is answered outside; two threads asked at once each get their own answer.
- [ ] Thread URLs for a direct message and the mirror reload into the thread.
- [ ] Mirror threads are readable by the owner only (curl as another user).
- [ ] Deleting a thread root in a direct message behaves as it does in channels.

## Related

P1512 (threads in channels) · P1520 (mirror) · [P1544](p1544_mirror_launch_on_prod.md) · [P1547](p1547_mirror_memory_token_budget.md) · P1536 (+ Canvas opens a mirror thread)
