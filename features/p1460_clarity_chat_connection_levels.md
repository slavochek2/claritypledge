---
status: backlog
type: story
disclosure: public
rank: 1000101
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - connections
  - partners
  - commitment
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1460: Connection levels — unknown, known, partner — and a connections page

> **PLACEHOLDER spec.** Captures the idea and its boundary. Do NOT design the build yet.

> Founder framing, verbatim (2026-10-12): *"they can message each other without being partners. And for that, we need to have another level."*

## Intention

Every DM and channel carries a commitment level, so anyone can start without signing anything
and grow into commitment:
- **Unknown**: one of you might not recognise the other's name.
- **Known**: you both would.
- **Partner**: you accepted the Clarity Partner Agreement.

/partners becomes a **connections** page: change a level, the other person confirms (modelled on a
"my network" page from an earlier product). A **person hover card** shows
profile, level and actions (as Slack's card shows photo, role, local time, Message).
Channels can be tied to a group that requires commitment from all members.

## How the idea was born

2026-10-12, reviewing the prototype next to Slack and Buzz screenshots. The founder: *"they can
message each other without being partners. And for that, we need to have another level... I
would suggest including two levels, known and unknown."* And: *"I think it needs progression,
because anybody should be able to join... This is just a commitment device."*

## How it relates

- **P1437**: assumes the pair accepted the Partner Agreement on joining.
- **Partners feature** (existing /partners, partner agreements): evolves, not replaced.
- **P1010** (Clarity Organizations): group-level agreements; a channel can inherit them.
- **Placeholder P1456**: new members start at unknown/known.
- **Placeholder P1461** (channel members/settings): shows each member's level.

## Why it matters

Chain: precondition for **find the moment** and **show the gap** at scale: the commitment
("I will rate my understanding when asked") is what makes a check fair to send.

## Deliberately out / trade-offs considered

- More than three levels.
- Automatic level changes from behaviour.
- Moving the whole app to chat first: the levels can ship on today's partner pages.

## Open questions

- What can a check ask of someone at "unknown" vs "partner"?
- Does the level live on the pair, the DM, or both?
- Public vs private channels: is "public" the same as "has a group agreement"?

## Done-when for promoting out of placeholder

- A real test needs a check between people who are not partners.

## Update 2026-10-13 (from the v5 walk-through, see P1469)

- **Known/unknown is dropped** (founder, 2026-10-13). A private known/unknown tag is manual work with no use now that mutual recommendations are gone.
- **Messaging works like Slack or WhatsApp:** you can message anyone whose email or number you have; block and "mark as spam" are the safety valve.
- **Two states remain: a normal chat, and Partner** (the agreement, with the existing pending invitation). Contacts are private cards (P1458), separate from both; a non-user can at most be "invited".

## Direction update 2026-10-16 (P1503, Clarity Chat v11)

Kept open as production work. v11 keeps only **normal chat vs partner**: "+ New" → New chat / New partner (today's
partner flow, also for someone without an account); in a chat header "Invite as partner" → "Partner invite pending"
→ a "Partner" label; a Partners inbox filter; no avatar badge; no separate connections page (everything is a chat).
