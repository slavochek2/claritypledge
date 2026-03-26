---
status: in-progress
type: feature
rank: 1000026.0
workstream: E2
created_date: 2026-03-26
tags: [ux, feed, profile]
---

# P587: Feed & Profile Text Truncation Tuning

## Problem Statement

Stories and points text truncates too aggressively in feed and profile views. Character-based truncation (e.g., `slice(0, 180)`) doesn't adapt to viewport width — showing only 2 lines on desktop while filling 7 on mobile. The approach is inconsistent across surfaces (some use CSS `line-clamp`, others use JS char slicing).

## Solution

Replace character-based truncation with CSS `line-clamp` everywhere except /live session cards (which stay tight by design). Give stories and points slightly more room than current limits.

### Truncation targets

| Surface | Content | Current | New |
|---------|---------|---------|-----|
| **Feed** story card | story text | `line-clamp-4` | `line-clamp-6` |
| **Feed** point card | statement | No truncation | `line-clamp-5` |
| **Feed** point card | context | `line-clamp-2` | `line-clamp-3` |
| **Profile** story card | story text | JS `slice(0, 180)` | CSS `line-clamp-8` + expand toggle |
| **StoryCardDetail** (compact) | story text | `line-clamp-3` | `line-clamp-5` |
| **/live cards** | all | 100 chars | **Keep as-is** |

### Key design decisions

- CSS `line-clamp-N` adapts to viewport width (more text on wider screens, less on narrow)
- "...more" expand affordance on profile stories (already exists, just switch from char-based to CSS-based)
- /live session cards stay at 100 chars — intentionally compact for rapid selection

## Files to modify

- `src/app/components/feed/feed-story-card.tsx` — line-clamp-4 → line-clamp-6
- `src/app/components/feed/feed-point-card.tsx` — add line-clamp-5 to statement, line-clamp-2 → line-clamp-3 for context
- `src/app/pages/profile-page-v2.tsx` — replace `STORY_THRESHOLD` / `slice(0, 180)` with CSS line-clamp-8
- `src/app/components/social/StoryCardDetail.tsx` — line-clamp-3 → line-clamp-5 (compact mode)

## NOT touching

- `src/app/components/partners/live-content-cards.tsx` — /live cards stay as-is
- `src/app/components/partners/live-story-card-expanded.tsx` — /live expanded stays as-is
- `src/app/components/partners/live-mode-view.tsx` — /live mode stays as-is
- Embed truncation (750 chars) — stays as-is
- Story search picker (80 chars) — stays as-is

## Acceptance Criteria

- [ ] Feed story cards show ~6 lines before truncation
- [ ] Feed point statements truncate at ~5 lines
- [ ] Feed point context shows 3 lines
- [ ] Profile story cards use CSS-based truncation with expand toggle
- [ ] StoryCardDetail compact shows 5 lines
- [ ] /live session cards unchanged (100 chars)
- [ ] No visual regression on mobile (320px) or desktop (1200px)

## Test Coverage Strategy

Existing `story-text-truncation.test.tsx` tests char-based truncation — will need updating if profile switches to CSS line-clamp. Visual QA via browser for responsive behavior.
