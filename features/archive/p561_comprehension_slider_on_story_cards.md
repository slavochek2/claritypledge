---
status: today
type: story
rank: 1
tags:
  - epic-story-first
  - comprehension
  - stories
  - screening
flow: dev
created_date: 2026-03-21T00:00:00.000Z
locked_at: '2026-03-23T08:07:28.127Z'
---

# P561: Comprehension Slider on Story Cards (Screening)

**Epic:** story-first (P523 vision)
**Priority:** 2 of 6 — core mechanism for async gap screening
**Depends on:** P560 (story filing without position)

## Problem

Comprehension can currently only be assessed inside /live sessions (rigid 3-click protocol, too clunky per user feedback). No way to assess or signal understanding asynchronously from story/point cards. The product can't deliver gap revelations without Slava facilitating.

## Solution

Add a comprehension slider (0-10) directly on story cards. Reader slides to self-assess. Author counter-slides from their story detail page. Gap displayed as screening signal. Slider is updatable — progression tracked. History visible to participants (private by default, shareable by choice).

**Framing:** This is a screening tool, not verification. It flags potential gaps worth checking in /live. Both parties guessing high does NOT confirm understanding — it means /live might not be needed. A large gap means it probably is.

## Acceptance Criteria

- [ ] Story card shows comprehension slider: "How well do you understand [Author]'s reasoning?" (0-10)
- [ ] Reader can slide on any story they didn't author (blocked on own stories)
- [ ] Reader can assess multiple stories on the same point (one assessment per reader per story)
- [ ] Slider is updatable — reader can revise their assessment anytime
- [ ] Author sees reader assessments on their story detail page
- [ ] Author can counter-assess (0-10) only when reader has also filed a story (position-only = self-assessment recorded, no gap produced)
- [ ] Gap displayed when both scores exist: "You: 8 · Author: 3 · Gap: 5 · Worth checking →"
- [ ] When only self-assessment exists: "You: 8 · Pending author review"
- [ ] Assessment history visible to both participants (private by default)
- [ ] History shows progression: [7→9] reader, [3→8] author
- [ ] When gap closes (gap < 2 AND author ≥ 8): show "✓ Verified" state
- [ ] New DB table: `comprehension_assessments` (reader_id, story_id, author_id, reader_score, author_score, timestamps for each)
- [ ] Works on mobile (slider touch-friendly)

## UI Contract

| Element | Value | Context |
|---------|-------|---------|
| Slider prompt | "How well do you understand [Author]'s reasoning?" | Story card, 0-10 slider |
| Author prompt | "[Reader] rates their understanding at [X]/10. What's your read?" | Story detail page |
| Gap display | "You: 8 · Author: 3 · Gap: 5" | When both exist |
| Pending display | "You: 8 · Pending author review" | When only reader assessed |
| Verified state | "✓ Verified" | Gap < 2 AND author ≥ 8 |
| History | "7→9 you · 3→8 author" | Private to participants |

## Out of Scope
- Notifications for assessments (separate P-number)
- /live simplification (P562)
- Position provenance display (P563)
