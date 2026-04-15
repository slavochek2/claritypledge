---
status: in-progress
type: task
rank: 1000708.0
workstream: C2
created_date: '2026-04-15'
tags: [letters, visual, polish]
feature_type: frontend
delivery_stage: fix
pipeline_ran: [fix]
---

# P708: Letter flow visual polish — card fork, divider, alignment

## Problem

Three visual issues on `/letter/[token]/preview` (and reading page) surfaced after P699 polish:

1. `PointCardWithLinks` (profile/social card) used in `point-engage` phases instead of `PointRow` with `letterMode` — shows "Add your story" CTA, tag pills, visibility icon, guest hints.
2. Double horizontal divider below the progress bar on preview page (amber banner `border-b` + something else).
3. `GapBanner` ("Perfectly calibrated" / gap message) is left-aligned within the `max-w-md` container while all other cards use `mx-auto`.

## Solution

- Fix 1: Swap `PointCardWithLinks` → `PointRow` with `letterMode` in both engage phases.
- Fix 2: Diagnose and remove duplicate divider (preview banner vs. shell border).
- Fix 3: Add `mx-auto` to `GapBanner` className in `letter-flow-content.tsx`.

## Risks / Non-Goals

- Do NOT touch `FeedStoryCard`, `FeedPointCard`, `StoryCardWithLinks` — justified forks.
- Do NOT modify `LetterProgressBar` itself — used on reading page too.
- Do NOT modify `LiveStoryCardExpanded` — only consumed here.

## Done-When

- [ ] point-engage phases show clean `PointRow`: no CTA, no tags, no visibility icon; position buttons still work
- [ ] No double divider below progress bar on preview
- [ ] GapBanner horizontally centered, matching JourneyToUnderstanding and LiveStoryCardExpanded
- [ ] `npx tsc --noEmit` passes clean
- [ ] Reading page parity confirmed (same fixes apply)
