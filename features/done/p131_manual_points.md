---
status: done
type: story
workstream: E1
tags:
  - stories
  - points
blockedBy:
  - p126
prepped_date: '2026-02-06'
reviews:
  ux: passed
  architect: passed-with-notes
  alignment: passed-with-notes
rank: 7
created_date: 2026-02-07
---

# P131: Manual Points Creation + Story Linking

> As a logged-in user, I want to manually create Points and link them to my Stories, so the full Stories+Points verification flow can be validated before building AI extraction.

## Context

P117 built the backend (points table, story_points junction, positions, calibration). P126 shipped story creation. Points viewing UI already exists (`/point/:id` page, `PointCardDetail` component, position buttons). But there is **no creation UI** -- Points only exist as mock data.

**Problem:** OQ-7 asks "do we need Points for verification?" -- but we can't answer it without real Points to test with. Waiting for AI extraction (Sifter) means we'll never validate this.

**Solution:** Let users manually create Points and link them to Stories. Validate the full flow manually, then replace with AI later.

**Depends on:** P126 (story creation) merged to main
**Unlocks:** OQ-7 validation, content-attached verification in /live (P128), position staking on real Points

## What Already Exists

| Component | Location | Status |
|-----------|----------|--------|
| `PointDetailPage` | `pages/point-detail-page.tsx` | Live at `/point/:id` |
| `PointCardDetail` | `components/social/PointCardDetail.tsx` | Production-ready |
| `pointsService.createPoint()` | `data/points-service-real.ts` | Backend ready |
| `storiesService.linkPointToStory()` | `data/stories-service-real.ts` | Backend ready |
| `storiesService.unlinkPointFromStory()` | `data/stories-service-real.ts` | Backend ready |
| `points-service.ts` | `data/points-service.ts` | Factory with real/mock toggle |
| RLS policies | Supabase | All policies exist |

**What's missing:** Creation form UI, linking UI on story detail, display of linked points on story detail.

## Jobs to Be Done

1. **Capture while fresh:** When I just finished writing a story, I want to quickly jot down the core claims, so I can make my story verifiable without coming back later.
2. **Understand what a Point is:** When I see "add points" for the first time, I want to immediately understand what's expected, so I can participate without reading docs.
3. **Manage points later:** When I revisit my story, I want to add or remove points, so I can keep claims accurate as my thinking evolves.
4. **See the full picture:** When I read someone's story, I want to see the key points they're making, so I can understand what claims they stand behind.
5. **Keep it quick:** When adding a point, I want to type one short statement and move on, so I can add several in under a minute.

## Scope

### 1. Post-save redirect to story detail with "add points" prompt

**Flow:** `/create` saves story -> redirects to `/story/:id` with `{ state: { justCreated: true } }` -> story detail page shows expanded points form.

**Why redirect instead of inline on `/create`:** Single creation flow. The user lands on the real page where points live permanently. No throwaway UI. The story detail page needs the "add point" UI anyway (Scope 2), so reusing it avoids building two separate creation flows.

**On `/story/:id` when `justCreated && isAuthor && points.length === 0`:**
- Show "Key Points" section with educational empty state:
  - "What claims does your story make?"
  - "A Point is a statement others can agree or disagree with -- the core of what you believe."
  - Example in italic: "Remote teams need trust more than tools"
- Textarea already expanded, auto-focused
- `[+ Add Point]` button (blue, disabled when empty)
- After adding first point: definition text collapses, form clears, point appears above, focus returns to textarea
- Can add multiple points sequentially
- `justCreated` state is ephemeral (React Router location state) -- refresh shows normal author view

### 2. Author manages points on story detail (`/story/:id`)

**On `/story/:id` when author visits (normal, not justCreated):**

**With existing points:**
- "Key Points (N)" section header
- Each point: pin icon + statement text, with `[x]` unlink button (44px touch target)
- `[+ Add a Point]` outline button below the list
- Tapping it expands inline form: textarea + `[Cancel]` (ghost) + `[+ Add Point]` (blue)
- After adding, form collapses back to button, point appears in list

**With 0 points:**
- "Key Points" section with empty state card (dashed border):
  - "No points yet. Points are claims others can agree or disagree with."
  - `[+ Add a Point]` outline button, centered
- Tapping button replaces empty state with inline form

**Unlink flow:**
- Author taps `[x]` on a point
- Point removed immediately (optimistic)
- Sonner undo toast: "Point unlinked [Undo]" (5s auto-dismiss)
- Undo re-links via `storiesService.linkPointToStory()`
- If toast dismisses, unlink is finalized

### 3. Non-author views linked points on story detail

**On `/story/:id` for non-author:**
- "Key Points (N)" section shown only when `points.length > 0`
- Each point: pin icon + statement text (read-only, no `[x]`, no add button)
- Points not clickable yet (no link to `/point/:id` -- route exists but linking deferred)
- **0 points = section entirely hidden** (empty states only shown to people who can act)

## UX Specifications

### Point form

- **Textarea:** `min-h-[80px]`, placeholder "State your point...", auto-resize
- **Character limits:** soft marker at 140 (hint: "Shorter is sharper"), hard max at 500, counter `{n}/500` right-aligned below
- **No context field in v1** -- simplicity over completeness. Context can be added in v2 if points feel ambiguous without it.
- **No tags field** -- no tag UI exists anywhere in the product. Pass `[]`.

### Point display cards (simplified for P131)

- Pin icon (`lucide Pin`, `text-blue-600`) + statement text
- `border-l-4 border-l-slate-400` left border (matches existing `PointCardDetail` visual)
- No position buttons (out of scope for P131)
- Not clickable (link to `/point/:id` deferred)
- Author sees `[x]` unlink button at top-right

### Button styles (design system)

- `[+ Add Point]` = `bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]`
- `[+ Add a Point]` (expand form) = `variant="outline" min-h-[44px]` full width
- `[Cancel]` = `variant="ghost"`
- `[x]` unlink = `variant="ghost"` with `hover:text-red-500`, 44px touch target area

### States

| State | Behavior |
|-------|----------|
| Adding point (loading) | Spinner on button, textarea disabled |
| Add failed | Toast error, form keeps content, user can retry |
| Link failed after create | Toast error with retry. Orphan point is harmless. |
| Unlink + undo | Optimistic removal, undo toast 5s |

## Files

| File | Change |
|------|--------|
| `src/app/pages/create-story-page.tsx` | Change redirect to pass `{ state: { justCreated: true } }` |
| `src/app/pages/story-detail-page.tsx` | Add "Key Points" section, author add/unlink UI, justCreated detection |
| No new service files needed | `points-service.ts` and `stories-service` already have all methods |

## What This Does NOT Include

- Standalone point creation (no toggle/tab on `/create`)
- Context field on points (v2 if needed)
- Tags on points (deferred until product-wide tag design)
- Position staking UI (agree/disagree on points) -- future spec
- AI point extraction (Sifter) -- future spec
- Point creation inside /live sessions -- deferred
- Making point cards clickable to `/point/:id` -- deferred

## Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Redirect to story detail after save | Single creation flow. Story detail needs add-point UI anyway. No throwaway post-save UI on `/create`. | Simplest: one flow, one location |
| No standalone point creation | Points are meaningful only linked to stories | If needed later, easy to add |
| No context field in v1 | Second field doubles perceived effort. Context inferred from story. | Ship simplest version first |
| No tags | No tag UI exists anywhere in product | Avoid creating precedent without a pattern |
| Undo toast for unlink | Non-blocking, forgiving (Gmail/Slack pattern) | Better than confirmation dialogs |
| Educational empty state only on justCreated | First-timers need education, returning users don't | Progressive disclosure |
| Hide Key Points for non-author with 0 points | Empty states guide action. If you can't act, "nothing here" is noise. | Reduce noise |
| Soft 140 / hard 500 char limit | Points should be discrete claims, not paragraphs. 140 is tweet-length nudge. | Keep points stakeable |
| No /live inline creation | Two-step flow (create -> select in /live) validates hypothesis without extra UI | Convenience deferred |
| Author-only linking | Only story author links points to their story | Others create own stories with own points |

## Acceptance Criteria

- [x] After saving a story on `/create`, user is redirected to `/story/:id`
- [x] On `/story/:id` after redirect, expanded "Add Points" form with educational empty state
- [x] User can type a point statement (textarea, 500 char max)
- [x] `[+ Add Point]` creates the point and links to story
- [x] User can add multiple points sequentially (form clears, focus returns)
- [x] On `/story/:id`, linked points display in "Key Points (N)" section
- [x] Author sees `[x]` unlink buttons and `[+ Add a Point]` expand button
- [x] Unlink shows undo toast, point reappears if undo tapped
- [x] Non-author sees points read-only, no edit controls
- [x] Non-author with 0 points sees no "Key Points" section
- [x] Character counter shows `n/500`, soft hint at 140+
- [x] Error states: toast on add failure (form keeps content), toast on link failure
- [x] Points persist across page refresh (real service)
- [x] `./scripts/pre-commit-checks.sh` passes

## Prep Notes

**From prep-spec review (2026-02-06):**

- **Alignment note:** This was flagged as potentially conflicting with OQ-7 phasing ("holistic first, points later"). Resolved: Points viewing UI (`/point/:id`, `PointCardDetail`, position buttons) is already shipped. This spec only adds the **creation form** -- completing existing work, not premature scope expansion.

- **Architect note:** `story-detail-page.tsx` currently uses `getStory()` (returns `StoryWithAuthor`). Must switch to `getStoryWithPoints()` (returns `StoryWithPoints`) to display linked points. This adds a junction table query.

- **Architect note:** `mockStoriesService.linkPointToStory()` is a no-op (returns `true` but doesn't update `mockStoryPoints`). Fix mock if testing in mock mode matters, or accept mock-mode limitation.

- **Architect note:** Create + link is two sequential operations. If link fails after create, an orphan point exists. Handled via error toast + retry. Orphan points are harmless and can be cleaned up later. No transaction needed.
