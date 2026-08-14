---
status: backlog
type: story
rank: 45
workstream: C1
created_date: 2026-04-02
tags: [letters, accumulation, gap-map, p581-follow-up]
---

# P619: Per-Story Comprehension Accumulation View

**Depends on:** P581 (Clarity Letters — builds the data model this feature reads)
**Related:** P581 D40 (public/private mode differences), definitions.md > Verification Outcome States

## Problem Statement

P581 writes per-completion gap data (story_verifications with letter_id, source, receiver ratings, sender predictions). Each completion produces a unique gap map. But the sender has no way to see accumulated comprehension data across all completions of the same story — whether from multiple private letters to different people or from a public letter with many receivers.

A facilitator who sends the same story in 5 workshops wants to know: "Is this story consistently misunderstood, or was it just that one group?" A founder who sends the same story to 3 co-founders wants to know: "Do all my partners struggle with this, or just one?"

## Solution

Surface a per-story accumulation view when a story has N>=5 completions across all letters. Shows:
- Distribution of receiver self-ratings (histogram or dot plot)
- Sender's prediction(s) overlaid (private: per-receiver predictions shown individually; public: single prediction shown as a line)
- Private and public completions shown separately when both exist (D40)
- Average gap, gap trend over time

**Not surfaced until N>=5** — prevents misleading sparse data.

## Acceptance Criteria

- [ ] Per-story view accessible from doc detail page (story card shows "N completions" badge when N>=5)
- [ ] Accumulation chart shows receiver rating distribution across all letters containing this story
- [ ] Private and public completions separated visually (two groups / two colors) when both exist
- [ ] Sender predictions overlaid: per-receiver dots (private) or single line (public)
- [ ] Hidden when N<5 — no empty charts, no "coming soon" placeholder
- [ ] Data reads from existing story_verifications table — no new tables needed

## Test Coverage Strategy

_How to verify this works._
