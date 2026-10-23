---
status: in-progress
type: task
rank: 63
workstream: product
created_date: '2026-10-23'
tags: [events, chat, ui]
disclosure: public
delivery_stage: dev
pipeline_ran: [create-spec, dev]
drafted_by: opus
exec_model: sonnet
exec_effort: low
driver: heuristic
---

# P1551: Remove "Open chat" from event pages

## Problem

On an event page the host and anyone who RSVPed see an "Open chat" button right under the title,
above the "Join WhatsApp group" button the event actually uses. It shipped as one line of
[P1512](done/2026-06-10/p1512_clarity_chat_v1_real_release.md) (decision 31) with no hypothesis
behind it. Social hikes always run on a WhatsApp group, so the page offers two places to talk and
puts the unused one first.

> Founder framing, verbatim (2026-10-23, screenshot annotated "delete !?!"): *"In the group, open chat makes sense. In the event, open chat should live. I see it's there, but it's weird. I think we should just delete it because most of the time we really don't want people to use it."*

## Appetite

Blast radius: one button on one page. Reversibility: git revert. Decision density: zero (founder
decided 2026-10-23: "open chat yes remove it form event pages").

## Solution

Stop rendering the event page's Open chat button. Event chats stay reachable from the inbox (an
event channel enters it 24h before the start, P1512 decision 30). Group pages keep their Open chat.

## Risks / Non-Goals

| Risk | Label | Note |
|---|---|---|
| Someone who used the event button loses a shortcut | ACCEPT | Inbox still lists the event channel |

**Non-Goals**
- Do NOT change the group/org page's Open chat.
- Do NOT remove event channels or change inbox rules.

## Done-When

- [ ] An event page shows no "Open chat" for the host or an RSVPed member (test + screenshot)
- [ ] A group page still shows "Open chat" (existing p1512 org test passes)
- [ ] The p1512 event-chat test asserts the button is absent (founder-approved spec change)

## Related

- [P1512](done/2026-06-10/p1512_clarity_chat_v1_real_release.md) decision 31: added the button.
