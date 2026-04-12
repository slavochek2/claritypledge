---
id: p411
title: 'Position breakdown: show linked stories per holder'
type: story
status: done
completed_at: '2026-02-22'
delivery_stage: done
uat_file: features/uat/p411.md
test_files:
  - e2e/p411-position-breakdown-stories.spec.ts
  - e2e/a11y/p411-accessibility.spec.ts
priority: high
rank: 2
tags: []
superseded_by: p542
created_at: 2026-02-21T00:00:00.000Z
locked_at: '2026-02-21T09:05:43.157Z'
created_date: 2026-02-22
---

## Problem

On the point detail page (`/point/:id`), the position breakdown (Agree/Disagree/Unsure tabs) shows each position holder as a compact row: avatar + name + position badge + reasoning (truncated 1 line).

In the prototype (`PointDetail.tsx`) each position holder shows:
- **If they have a linked story**: full story card (author, date, story text, position badge, ear count, privacy icon)
- **If no linked story**: compact row with avatar, name, **ear count badge**, position badge, "No story yet"

Our app is missing:
1. Linked story display per position holder
2. Ear count (EarBadge) on the compact row

## Goal

Make the position breakdown on the point detail page match the prototype: show each holder's linked story (the story that cites this point), or a compact row with ear count if no story exists.

## User Story

As a visitor viewing a point's position breakdown, I want to see the stories people wrote that led to their position, so I can understand the reasoning behind each stance.

## Acceptance Criteria

1. Each position holder row fetches and displays their linked story for this point (if one exists)
2. Story card shows: author name, story text (clamped), date, position badge, ear count, privacy icon
3. Clicking the story navigates to that story (or the author's profile)
4. If no linked story: compact row shows avatar + name + **ear count badge** + position badge
5. The ear count was already missing from our compact row — add it

## Out of Scope

- Writing/attaching stories from this page
- Pagination of position holders (not needed yet)

---

## Technical

### Technical Analysis

**Current Code State**

The point detail page is at `src/app/pages/point-detail-page.tsx`. It loads two things in parallel at mount: the point and all position holders via `pointsService.getPositionsForPoint`. Position holders are typed as `PointPositionWithUser` (`src/app/types/index.ts:1038`), which carries user info but **no `earCount`, no `userHasPledged`, and no linked story**.

The `getPositionsForPoint` query (`src/app/data/points-service-real.ts:419`) joins `point_positions` to `profiles` selecting `id, name, slug, avatar_color, avatar_url` — it does NOT select `ears_count`/`has_pledged` and does NOT join `story_points`.

The existing `PositionHolderCard` component (line 370–412) renders a compact row: avatar, name, position badge, optional `reasoning` (1 line). No `EarBadge`, no story card branching.

**Story-to-point infrastructure (already exists):**
- DB junction table: `story_points` (`story_id`, `point_id`)
- `storiesService.getStoriesForPoints(pointIds: string[]): Promise<Map<string, StoryWithAuthor[]>>` in `src/app/data/stories-service-real.ts:509` — joins `story_points → stories → profiles`, returns public stories only, already filters `visibility !== 'public'`
- `StoryWithAuthor` type (`src/app/types/index.ts:902`) carries `authorEarsCount`, `authorHasPledged`, `authorRole`, `authorSlug`, `authorAvatarColor`, `authorAvatarUrl`
- `storiesService.getStoriesForPoints` is already used on `story-detail-page.tsx:491`

**`EarBadge`** lives at `src/components/ui/ear-badge.tsx`. Takes `count: number`, `name: string`.

**`StoryCardWithLinks`** (`src/app/components/social/story-card-with-links.tsx:118`) has a `context="point-detail"` + `profileSubjectPosition` branch that renders Avatar + Name + EarBadge + PositionBadge outside a quoted story box — exactly what AC #2 requires.

**Dependencies:** `storiesService`, `StoryCardWithLinks`, `EarBadge`, `StoryWithAuthor` — all already exist, none need to be installed.

---

### Architecture Decisions

**Decision 1: Single batch fetch + client-side lookup**
- **Chosen:** Call `storiesService.getStoriesForPoints([id])` once at page load alongside existing parallel fetches. Store as `Map<pointId, StoryWithAuthor[]>`. Derive `Map<userId, StoryWithAuthor>` via `useMemo` to look up each holder's story by `authorId`.
- **Rationale:** Mirrors identical pattern on `story-detail-page.tsx:491`. One Supabase query regardless of holder count. No N+1 risk.
- **Trade-off:** Fetches all stories for the point; client-side filter maps by `authorId`. Correct because multiple users can link stories to the same point.
- **Alternative rejected:** Per-holder lazy loading — N Supabase queries + loading flicker per row.

**Decision 2: Reuse `StoryCardWithLinks` quote-pattern branch**
- **Chosen:** Pass `context="point-detail"` + `profileSubjectPosition={holder.position}` to `StoryCardWithLinks` when a linked story exists. This branch already renders the exact layout the spec requires.
- **Rationale:** Component was designed for this context. Re-using avoids drift. Inline adapter bridges `StoryWithAuthor` → prototype `Story`/`StoryAuthor` shapes (established pattern on story-detail page).
- **Alternative rejected:** New `LinkedStoryCard` component — third place to maintain story rendering.

**Decision 3: Expand `getPositionsForPoint` to fetch `earCount`**
- **Chosen:** Add `ears_count` and `has_pledged` to the profiles join in `getPositionsForPoint`. Add `earCount: number` and `userHasPledged: boolean` to `PointPositionWithUser` type + mapper.
- **Rationale:** No-story compact row requires `earCount` (AC #4). Data is in the existing join — zero extra queries.
- **Alternative rejected:** Always show `earCount = 0` — violates the AC.

---

### Security Review

**RLS Policies:**
- ✅ `Stories readable by visibility` policy (from `20260206_add_story_visibility.sql`): `USING (visibility = 'public' OR author_id = auth.uid())` — correctly blocks non-public stories from other users at DB level.
- ✅ `point_positions` has `USING (true)` — publicly readable by design.
- ⚠️ `story_points` has `USING (true)` — story IDs and their point associations are discoverable for all visibility levels (pre-existing design issue, out of scope for p411). UI must not render "private story exists" placeholders.

**Authentication:**
- ✅ Page is visitor-facing (unauthenticated). `getPositionsForPoint` correctly needs no auth check.
- ✅ Unauthenticated visitors are subject to the `Stories readable by visibility` RLS policy — non-public stories correctly restricted.

**Authorization:**
- ⚠️ **Critical pattern to follow:** `getStoriesForPoints` already applies an app-layer visibility guard at line 560: `if (!storyRow || storyRow.visibility !== 'public') continue`. The new join path must replicate this — do not rely on RLS alone. Add explicit `visibility !== 'public'` filter in the mapper or call site.
- ✅ `story.authorId === holder.userId` lookup is safe — no cross-user data leakage via this client-side filter.

**Input Validation:**
- ✅ No new user inputs. `pointId` from route param is pre-existing (not introduced by p411).

**Data Protection:**
- ✅ `getStoriesForPoints` already filters non-public stories — private stories will not appear even if linked.
- ✅ UI must not render any "private story exists" indicator for filtered-out stories.

---

### Implementation Approach

**Files to Create:** None. All required components already exist.

**Files to Modify:**

1. `src/app/types/index.ts` — Add `earCount: number` and `userHasPledged: boolean` to `PointPositionWithUser` (line ~1038)
2. `src/app/data/points-service-real.ts` — Expand `getPositionsForPoint` select to include `ears_count, has_pledged`; update `mapPositionWithUserFromDb`
3. `src/app/data/points-service-mock.ts` — Update mock mapper to include `earCount: 0, userHasPledged: false`
4. `src/app/pages/point-detail-page.tsx` — Main changes: new imports, new state, extended `Promise.all`, `storyByAuthorId` useMemo, conditional rendering, EarBadge in compact row

**Data Flow:**
```
loadData() [useEffect]
  └── Promise.all([
        pointsService.getPointWithUserPosition(id, userId),   // existing
        pointsService.getPositionsForPoint(id),               // existing, now includes earCount
        storiesService.getStoriesForPoints([id]),             // NEW
      ])

useMemo: storyByAuthorId = Map<userId, StoryWithAuthor>
  from linkedStories.get(id)?.map(s => [s.authorId, s])
  (take first/most recent if multiple stories per author)

render: holdersInGroup.map(holder)
  storyByAuthorId.has(holder.userId)?
    YES → <StoryCardWithLinks context="point-detail" profileSubjectPosition={holder.position}
               story={toPrototypeStory(story)} author={toStoryAuthor(story)} compact />
    NO  → <PositionHolderCard holder={holder} earCount={holder.earCount} />
```

**Inline adapters** (no new files):
```ts
// StoryWithAuthor → prototype Story
const toPrototypeStory = (s: StoryWithAuthor): Story => ({
  id: s.id, authorId: s.authorId, text: s.content,
  createdAt: s.createdAt, verificationCount: s.understoodCount,
  visibility: s.visibility, positions: {},
});
// StoryWithAuthor → StoryAuthor
const toStoryAuthor = (s: StoryWithAuthor): StoryAuthor => ({
  id: s.authorId, name: s.authorName, role: s.authorRole,
  hasPledged: s.authorHasPledged, ear: s.authorEarsCount ?? 0,
});
```

**Build Sequence:**
1. Type update: Add `earCount` + `userHasPledged` to `PointPositionWithUser` in `types/index.ts`
2. DB query: Expand `getPositionsForPoint` select + mapper in `points-service-real.ts`
3. Mock fix: Update `points-service-mock.ts` to satisfy updated type
4. Data loading: Add `storiesService.getStoriesForPoints([id])` to `Promise.all` in `point-detail-page.tsx`
5. Lookup map: Add `storyByAuthorId` useMemo
6. Rendering: Replace `PositionHolderCard` call with conditional (story card vs compact row)
7. Compact row: Add `EarBadge` to `PositionHolderCard`, show "No story yet" label
8. Verify: `npm run build` for type errors, visual check on `/point/:id`

**Edge cases:**
- Multiple stories per author for same point → take `[0]` (most recent, array is ordered desc)
- `getStoriesForPoints` fails → gracefully show all holders as compact rows (empty Map)
- `story.authorId === holder.userId` is the join key — same UUID in both types

---

## UX

### 1. User Flow

A visitor arrives at the point detail page via a direct link (shared URL) or by tapping a point card on a profile page, story detail page, or live session. No authentication is required to view this page.

Once the page loads:

1. The visitor sees the point statement at the top with position buttons showing aggregate counts (Agree / Disagree / Unsure). They can optionally record their own position if logged in.
2. Below the point card is a tabbed section — "All", "Agree", "Disagree", "Unsure" — with counts shown on each tab.
3. The visitor scrolls through position holders. Each holder appears as one of two layouts (described in section 2).
4. If a holder has a linked story, the visitor can tap the quoted story box to navigate to the full story detail page.
5. If a holder appears without a story, their row is still present but non-navigable from the story area. Tapping the holder's name navigates to their profile.
6. The visitor can tap a position tab to narrow the list to a single stance group.
7. The back button returns to the previous page, or falls back to the events listing if there is no in-app referrer.

### 2. Screen Design

The positions section is a white card with rounded corners. Position tab filters sit at the top of this card. Below them, holders within the active filter group are listed in vertical order with consistent spacing between items.

**Variant A — Holder WITH a linked story (quote pattern)**

The holder's identity is shown above a quoted story box, not inside it.

Identity row (above the box):
- Small circular avatar (20 x 20 px), colored per the user's chosen color or photo. A pledge ring surrounds the avatar if the user has taken the Clarity Pledge.
- Full name in medium-weight text, tappable — navigates to the holder's profile.
- Ear badge: a small ear icon followed by an integer count. Tapping or long-pressing shows a tooltip explaining what the count means ("X understood N stories as confirmed by their owners", or "X hasn't had any stories confirmed understood yet" when count is 0). The badge is always visible — 0 is shown, not hidden.
- Position badge: a compact label (e.g., "Agrees", "Disagrees", "Unsure") colored to match the stance group.

Quoted story box (below the identity row):
- Light gray background, rounded corners, thin border, subtle hover state.
- First line: role title · relative date (e.g., "Product Manager · 3 days ago"), followed by a privacy indicator icon if applicable.
- Story text: clamped to 3 lines with an ellipsis. Full text is revealed on the story detail page.
- The entire box is tappable and navigates to the story detail page.

**Variant B — Holder WITHOUT a story (compact row)**

A single horizontally laid-out row on a muted background:
- Small circular avatar (same spec as Variant A).
- Name in medium-weight text. Tappable — navigates to the holder's profile.
- Ear badge (same spec as Variant A — always shown, even at 0).
- Position badge (same spec as Variant A).
- "No story yet" label in small, italicized, muted text, right-aligned within the row.
- The entire row is tappable and navigates to the holder's profile.

Both variants share the same horizontal padding, border radius, and vertical spacing so the list reads as a unified set regardless of which variant appears.

### 3. Edge Cases

**Loading state**

While the page fetches data, skeleton placeholders appear in place of the point card and the position list. The point card skeleton shows a circle (pin icon area) and three rectangular button ghosts. The positions card skeleton shows the tab bar as a gray strip, then two stacked rectangle ghosts representing holder rows. All skeletons animate with a slow pulse.

**Empty position group**

When the visitor has filtered to a specific stance (Agree, Disagree, or Unsure) and no one holds that position, a centered muted-text message reads "(no positions yet)". This empty state is only shown when a specific tab is active — when "All" is active, empty groups are silently omitted rather than shown as empty sections.

**Zero holders overall**

When no one has taken any position on the point, a single centered message reads "No one has taken a position yet", spanning the full width of the positions card below the filter tabs.

**Story fetch failure**

If the stories batch fetch fails (network error or unexpected server response), all position holders fall back to Variant B (compact row with ear badge and "No story yet" label). No error message or broken card is displayed for individual rows — the compact row is a valid and complete state. The page does not block rendering on this failure.

**Holder has multiple stories linked to the same point**

Only one story is shown per holder: the most recently created one. There is no indicator that additional stories exist. This keeps the list scannable and avoids repetition.

**Private story (filtered out)**

If a holder's story for this point is not publicly visible, it is excluded silently. The holder appears as Variant B (compact row, "No story yet"). There is no "private story exists" hint. Visitors never see that a private story is attached.

**Point not found**

If the point ID is invalid or the point has been removed, a "Point not found" message is shown below the back button. No position list is rendered.

**Network error loading the point**

A "Failed to load point" message appears with a "Try Again" button that re-triggers the full data load.

### 4. Accessibility

**Keyboard navigation**

Both Variant A and Variant B rows are reachable via Tab. The compact row (Variant B) has `role="button"` and `tabIndex={0}`, and responds to Enter and Space to trigger navigation. The story box in Variant A is a native clickable element that receives focus naturally.

Within a story card, the author name is a separate focusable button so keyboard users can navigate directly to a profile without activating the story navigation.

**ARIA roles and labels**

- The full positions section card has no special landmark role — it is part of the main page content.
- Filter tab buttons are standard `<button>` elements. The active tab is identified by visual styling; if a screen reader needs distinction, the active tab should have `aria-pressed="true"`.
- Compact rows (Variant B): `role="button"` with an `aria-label` of "{Name}'s profile" or similar to give screen readers a meaningful label beyond the visible inline content.
- Story card boxes: rendered as clickable `<div>` elements. These should carry `role="button"` and `aria-label` of "Read {Name}'s story" for screen reader users.
- The back button has an explicit `aria-label="Go back to previous page"`.

**Screen reader — ear count**

The ear badge renders a numeric count next to an icon. Screen readers will read the count as a plain number. The tooltip text (exposed via `aria-label` or a visually-hidden `<span>`) provides the full interpretation: "Alex understood 4 stories as confirmed by their owners." This must be present whether the count is 0 or higher.

**Screen reader — position badges**

Position badges are plain text ("Agrees", "Disagrees", "Unsure") and are read naturally in the sequence: name → ear count → position.

**Focus visibility**

All interactive elements display a visible focus ring (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`) to meet contrast requirements for keyboard users.

**Color**

Position badges rely on color to convey stance. Each badge also includes the word label ("Agrees", "Disagrees", "Unsure") so color is not the sole indicator.

### 5. Responsive Behavior

The page is mobile-first. The outer container is centered with a maximum width of 32rem (`max-w-lg`) and horizontal padding on both sides. On viewports narrower than this max width, the container expands to fill the screen width.

**Text truncation**

- Holder names truncate with an ellipsis if they overflow the available horizontal space in the identity row.
- Role and date text is on a single line and truncates if long.
- Story text in Variant A is clamped to 3 lines regardless of viewport width.

**Touch targets**

All tappable elements meet a minimum touch target of 44 x 44 px. The compact row (Variant B) fills the full width of the card, making the entire row a large tap target. The avatar button within Variant A is a separate, smaller element — this is acceptable because the story box itself provides a larger surrounding tap area for story navigation.

**No horizontal scroll**

Badges, labels, and avatars wrap or truncate within the single column rather than pushing content off-screen. The ear badge and position badge are small enough to coexist on one line with a moderately long name. For very long names, the name truncates first.

**No layout changes between breakpoints**

The single-column layout is the only layout. There is no side-by-side or grid view at wider breakpoints. The `max-w-lg` cap simply adds whitespace on tablet and desktop screens.

---

## Test Coverage Strategy

**What's Tested:**
- ✅ Holder with linked story shows story card content (E2E)
- ✅ Holder without story shows compact row with "No story yet" (E2E)
- ✅ Filter tabs (Agree/Disagree) still work after the change (E2E)
- ✅ Clicking story card navigates away from point detail (E2E)
- ✅ Page loads without console errors (smoke)
- ✅ Position breakdown section renders with filter tabs (smoke)
- ✅ Not-found state for unknown point id (smoke)
- ✅ Filter tabs keyboard accessible (a11y)
- ✅ Compact row has role="button", keyboard activatable (a11y)
- ✅ Story card reachable via keyboard (a11y)
- ✅ Position badge has text content, not color-only (a11y)
- ✅ Manual validation of all AC (UAT)

**What's NOT Tested:**
- ❌ No unit tests — no new utility functions (wiring existing services)
- ❌ No integration tests — no new DB migration (expanding column select on existing query)
- ❌ earCount value accuracy — covered visually via /verify; E2E setup would need ears fixture data

**Test Pyramid:**
```
      /\
     /  \   5 E2E tests
    /____\
   / smoke \  4 smoke tests
  /__________\
 / 4 a11y    \
```

**Files Generated:**
- `e2e/p411-position-breakdown-stories.spec.ts` (5 tests)
- `e2e/p411-smoke.spec.ts` (4 tests)
- `e2e/a11y/p411-accessibility.spec.ts` (4 tests)
- `features/uat/p411.md` (7 UAT scenarios)

**Total:** 13 automated tests + 7 UAT scenarios
