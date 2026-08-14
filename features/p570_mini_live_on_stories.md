---
status: backlog
type: story
rank: 27
tags:
  - live
  - stories
  - async
  - architecture
created_date: 2026-03-22T00:00:00.000Z
---

# P570: Mini-/live on Stories — Async-to-Sync Gap Bridging

**Related:** P561 (comprehension slider), P562 (/live simplification), P523 (story-first vision)

## Idea

After async comprehension assessment reveals a gap (P561), either party can initiate a sync /live mini-session anchored to the specific story. The session starts from existing assessment history — not from zero.

## Flow

1. Reader self-assesses understanding of story (P561 slider) → e.g., 8/10
2. Author counter-assesses → e.g., 3/10 → gap revealed
3. Either party clicks "Bridge this gap" → starts /live mini-session
4. /live session is linked to the story + existing assessment scores
5. Session focuses on the specific story — paraphrase, clarify, re-assess
6. Assessment history updates with post-/live scores

## Architecture Note

- Sessions need a `story_id` foreign key (currently sessions have no story context)
- Session history linked to stories enables: "this story was discussed in 3 sessions, gap closed from 5 to 1"
- Same /live session could span multiple stories (agenda from P562)

## Why Backlog

Observe first whether the async gap → sync bridging pattern happens naturally after P561 ships. Don't build the link until users demonstrate the pull.

## Out of Scope

- Notification when gap is revealed (separate spec)
- Auto-scheduling of /live based on gap size
