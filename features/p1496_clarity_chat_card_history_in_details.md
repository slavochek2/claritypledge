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

# P1496: History on point and story cards (Clarity Ledger merges into Details)

## Problem

> Founder, 2026-10-16: "is there a log of what happened in the past with a given story and part? And is Clarity Ledger part of this log, what happened in the past?"

A point or story card in v11 shows only its current state, plus the sender's guess next to the other person's answer. Everything that led there is lost: positions taken and later changed, ratings, predictions, edits. Without that record nobody can see how understanding between Alice and Bob moved, which is what the Clarity Ledger was meant to show.

## Appetite

Placeholder, scoped when picked up.

## Solution

Direction, not design (founder, 2026-10-16):
- The card's **Details** view shows a log of what happened to the item: positions taken and changed, Alice's guess of Bob's position next to Bob's actual answer, ratings and predictions, edits.
- The Clarity Ledger (P1459) **merges into Details**: no separate ledger surface, no card flip.

## Risks / Non-Goals

- DEFER: a cross-card or cross-pair ledger view; this is per item only.
- ACCEPT: items created before history is recorded show partial or no history.
- MITIGATE: entries are frozen events (P1459, decided 2026-07-24); an edit appends, it never rewrites.

## Done-When

- [ ] Opening Details on a point or story card shows a dated log of position changes, guesses with answers, ratings, predictions and edits.
- [ ] P1459 is marked as merged into this spec (no separate ledger surface remains planned).

## Related

- P1495 (v10 prototype, reuse only): `features/p1495_clarity_chat_v10_one_prototype_reuse_only.md`; its latest copy is on branch `feature/p1437-conversation-groups-v2` (main holds an older one). P1459 Clarity Ledger: `features/p1459_clarity_chat_clarity_ledger.md`.
