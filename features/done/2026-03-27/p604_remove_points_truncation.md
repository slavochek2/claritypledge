---
id: p604
title: "Remove +N more points truncation — show all linked points"
status: all-done
type: bug
flow: dev
priority: 1
completed_at: "2026-03-29"
tags: []
rank: 1000034.0
created_date: 2026-03-29
---

## Problem

The /view page (and profile page) truncates linked points to 3 items, showing a "+N more points" link for overflow. User wants all points visible without truncation.

## Files to Change

1. `src/app/components/social/StoryCardDetail.tsx` — line ~407: `slice(0, isDetailView ? undefined : 3)`
2. `src/app/components/social/story-card-with-links.tsx` — line ~419: `slice(0, isDetailView ? undefined : 3)`
3. `src/app/pages/profile-page-v2.tsx` — line ~1524: `slice(0, 3)` + "+N more points"

## Acceptance Criteria

- All linked points are always visible (no truncation, no "+N more points" link)
- Remove the truncation logic and the "+N more points" UI element
- Works on both /view feed and profile page
