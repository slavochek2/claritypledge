---
status: backlog
type: story
rank: 22
tags:
  - epic-story-first
  - ai
  - points
  - stories
created_date: 2026-03-22T00:00:00.000Z
---

# P572: AI-Assisted Point Extraction from Stories

**Epic:** P523 (Story-First Content Model)
**Related:** P561 (comprehension slider), existing Gemini `/chat` edge function

---

## Problem

Stories contain implicit claims and points that currently require manual extraction by the facilitator (Slava). This doesn't scale — each session transcript or user-submitted story may contain 3-10 extractable points that go uncaptured.

## Intention

Automate point extraction from stories using the existing Gemini integration. When a story is filed (P560), AI identifies candidate points embedded in the narrative — claims, assumptions, beliefs — and surfaces them for review before publishing.

## Scope

- Extract candidate points from story text using Gemini `/chat` edge function
- Present candidates for human review (accept/edit/reject)
- Link accepted points back to their source story (P564 attribution)
- Tag extracted points with provenance metadata (ai-extracted, source story ID)

## Dependencies

- P560 (story filing) — stories must exist as entities first
- P564 (point-story attribution) — extracted points need attribution links
- ~~Existing `story-guide-chat` edge function (Gemini 2.0 Flash)~~ — deleted by P803 (2026-09-02); this spec can no longer build on it

## Open Questions

1. Should extraction happen automatically on story creation or be triggered manually?
2. What's the right UX for reviewing AI-extracted candidates — inline on story card or separate queue?
3. How to handle duplicate detection against existing points?
