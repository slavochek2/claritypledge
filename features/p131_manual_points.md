---
status: backlog
type: story
priority: p1
tags: [stories, points]
hypothesis: h-stories
blockedBy: [p126]
---

# P131: Manual Points Creation + Story Linking

> As a logged-in user, I want to manually create Points and link them to my Stories, so the full Stories+Points verification flow can be validated before building AI extraction.

## Context

P117 built the backend (points table, story_points junction, positions, calibration). P126 shipped story creation. But Points only exist as mock data — no UI to create them.

**Problem:** OQ-7 asks "do we need Points for verification?" — but we can't answer it without real Points to test with. Waiting for AI extraction (Sifter) means we'll never validate this.

**Solution:** Let users manually create Points and link them to Stories. Validate the full flow manually, then replace with AI later.

**Depends on:** P126 (story creation) merged to main
**Unlocks:** OQ-7 validation, content-attached verification in /live (P128), position staking on real Points

## Scope

### 1. Create Point (inline on `/create` page)

**Goal:** After saving a story, user can add Points to it. Also accessible standalone.

**On `/create` page — post-save flow:**
- After story saves successfully, instead of immediately redirecting, show a "Add Points" section below the saved story
- User can type a Point statement + optional context
- "Add Point" button creates the point AND links it to the story
- Can add multiple points, one at a time
- "Done" button → redirect to `/story/:id`

**Standalone `/create` enhancement:**
- Add a toggle/tab: "Story" | "Point" (default: Story — current behavior)
- Point tab: statement (required), context (optional), tags (optional)
- Save creates point, redirects to `/point/:id` (future — for now, toast + clear form)

### 2. Link Points on Story Detail (`/story/:id`)

**Goal:** Story author can link/unlink Points on their own story.

**On `/story/:id` when author is viewing:**
- Show existing linked Points (already supported via `StoryWithPoints`)
- "Add a Point" button → inline form (statement + context)
- Creates point + links to story in one action
- Each linked Point has an "unlink" action (× button)
- Uses `storiesService.linkPointToStory()` / `unlinkPointFromStory()`

### 3. View Points on Story Detail

**Goal:** Anyone viewing a story sees its linked Points.

**On `/story/:id`:**
- Section: "Key Points" (only shown if points.length > 0)
- Each point: statement text, optional context
- Clickable → `/point/:id` (future detail page — for now, no link)

## Files

| File | Change |
|------|--------|
| `src/app/pages/create-story-page.tsx` | Add post-save Points flow |
| `src/app/pages/story-detail-page.tsx` | Show linked points, author add/unlink UI |
| `src/app/data/points-service.ts` | Wire to real or mock (like stories-service.ts) |
| `src/app/data/points-service-mock.ts` | Add mock createPoint if missing |
| `src/app/data/stories-service.interface.ts` | No changes needed (linkPointToStory exists) |

## What This Does NOT Include

- Point detail page (`/point/:id`) — future spec
- Position staking UI (agree/disagree on points) — future spec
- AI point extraction (Sifter) — future spec
- Point creation inside /live sessions — deferred per discussion (validate two-step flow first)

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Points on `/create` post-save | Lowest friction: user just wrote the story, Points are fresh in mind | Alternative: separate `/create-point` page adds navigation burden |
| No standalone point creation page | Points are meaningful only linked to stories | If needed later, easy to add |
| No /live inline creation | Two-step flow (create → select in /live) validates hypothesis without extra UI | Convenience optimization deferred |
| Author-only linking | Only story author links points to their story | Others can create their own stories with their own points |

## Acceptance Criteria

- [ ] After saving a story on `/create`, user sees "Add Points" section
- [ ] User can type a point statement + optional context
- [ ] "Add Point" creates the point and links to story
- [ ] User can add multiple points sequentially
- [ ] "Done" redirects to `/story/:id`
- [ ] On `/story/:id`, linked points display in "Key Points" section
- [ ] Author sees add/unlink controls on their own story
- [ ] Non-author does not see edit controls
- [ ] Points persist across page refresh (real service)
- [ ] `./scripts/pre-commit-checks.sh` passes
