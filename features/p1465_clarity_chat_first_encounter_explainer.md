---
status: backlog
type: story
disclosure: public
rank: 1000104
workstream: clarity-chat
created_date: '2026-10-12'
tags:
  - clarity-chat
  - onboarding
  - adoption
  - mental-model
  - mirror-agent
delivery_stage: create-spec
pipeline_ran:
  - create-spec
---

# P1465: First encounter — explain a mirror agent and "you in someone's eyes" in 10 seconds

> **PLACEHOLDER spec.** Captures the idea and its boundary. A one-card version ships inside
> P1437 v5 so it is seen in context; this spec owns the full version.

> Founder framing, verbatim (2026-10-12): *"we can handle these objections with Q&A, maybe saying, hey, this thing cannot act as you."*

## Intention

The first time someone meets (a) a mirror agent or (b) "Alice in Bob's eyes", they must get it in
**10 seconds or less**, mostly from a picture, the way the existing double-click animation teaches
a gesture. The likely first reaction to (b) is an objection, so the card answers objections
before they harden.

## How the idea was born

2026-10-12, while deciding what holds Bob's prediction of Alice's position (P1458): the entity is
Bob's mental model of Alice, not an agent. The founder: *"the first time somebody sees it, they
need to understand what it means... similarly, we have an animation to explain how double click
works."* And: *"we need another specific spec that kind of introduces the first time the concept
of agents... and this is where we can record some of the objections."*

## Anticipated objections and the 10-second answer (picture first, words second)

| Objection (Alice's words) | Answer in one line | Picture |
|---|---|---|
| "You made a bot of me." | It is not you and it cannot act. It is how Bob sees you. | Alice's face inside Bob's frame, no robot |
| "Can it speak or act as me?" | No. It only holds what Bob thinks you think. | crossed-out speech arrow |
| "Who sees this?" | You and Bob. Nobody can find it. | two faces, a lock |
| "Is it true?" | Only you can say. Rate it. | the 0-10 scale, her finger on it |
| "Can I fix it?" | Yes, that is the point. Say what he missed. | her correction replacing his line |
| "Why would Bob do this?" | He wants to check he understands you before arguing. | Bob's sealed number, then hers |

For the mirror agent card (first time Bob meets his own): "Mira drafts. You decide. Nothing is
sent without you." Picture: draft card, Bob's approve tap.

## How it relates

- **P1437 v5**: carries the one-card version for "Alice in Bob's eyes".
- **P1458**: the entity this explains, its visibility rule and legal constraints (subject notice).
- **P1456**: non-members meet this on the letter page, not in chat.
- Existing double-click explainer: the pattern to reuse.

## Why it matters

Chain: **show the gap**. If Alice's first reaction is "you built a bot of me", she declines and no
gap is ever shown. Adoption of the whole loop depends on this card.

## Deliberately out / trade-offs considered

- A long onboarding tour: rejected; one card at the moment of need.
- Explaining calibration or the ledger here: later, after she has answered once.
- Words-only explainer: the 10-second budget needs a picture to carry most of it.

## Open questions

- Animation or a still card for v1?
- Does the card show again for a second person's model of her, or only once ever?
- Same card on the non-member letter page, or a variant?

## Done-when for promoting out of placeholder

- In P1437 v5, a reviewer who sees only the card passes the 10-second test, and a real first-time
  viewer does not raise an objection the card failed to answer.

## Update 2026-10-13 (from the v5 walk-through, see P1469)

- **The explainer graphic is removed** (avatar → arrow → dashed avatar; founder: "why?!").
- **Alice no longer meets Bob's agent.** She meets the idea on the card itself: after her position is locked, Bob's story of her arrives under the header "<name> in Bob's eyes · <guess>" with one neutral line from the letter (P1469 decision 13).

## Direction update 2026-10-16 (P1503, Clarity Chat v11)

Aim the 10-second explainer at v11's guess line ("Alice in Bob's eyes · … (your guess)"), which only Bob sees.
