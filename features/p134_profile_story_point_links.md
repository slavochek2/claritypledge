---
status: blocked
type: story
rank: 1
workstream: foundation
tags: []
---

# P134: Profile Story-Point Links Display

## Source of Truth

**Prototype:** `/prototype/linkedin-like/profile`
**Reference Implementation:** `src/app/prototypes/linkedin-like/components/Profile.tsx`

The prototype shows the **exact expected behavior** with mock data that has story-point links.

### How to Verify

**Step 1: Open prototype in browser**
```
http://localhost:5001/prototype/linkedin-like/profile
```

**Step 2: Check Stories tab**
- Look for expandable "X points by [Name]" buttons below stories
- Click to expand and see linked points
- Screenshot this behavior

**Step 3: Check Points tab**
- Look for expandable "X stories by [Name]" buttons below points
- Click to expand and see linked stories
- Screenshot this behavior

**Step 4: Compare to production**
- Open production profile: `http://localhost:5001/p/vyacheslav-ladischenski`
- Should look identical to prototype (once data exists)

**What we're matching:**
- ✅ Visual layout (expandable sections)
- ✅ Interaction behavior (click to expand)
- ✅ Navigation (click linked item → detail page)
- ✅ Content display (point/story cards in expanded section)

## Prep Notes

**Review Date:** 2026-02-09
**Agents:** UX ✓, Architect ✓, Alignment ✓

### 🔴 Critical Blockers (must fix before implementation)

#### 1. Global State Architecture is Unsustainable
**[Architect]** The `window.__profileDataRegistry` pattern creates:
- Race conditions (registry cleared while components reading)
- Memory leaks (unbounded growth across page loads)
- Type safety holes (bypasses TypeScript)
- Test coupling (components can't be unit tested)

**Fix required:** Replace global state with explicit prop passing. Pass `linkedPoints: Point[]` directly to `StoryCard` instead of having component call `getPointsForStory()` that reads from global registry.

#### 2. N+1 Query Pattern ✅ **COMPLETED**
**[Architect]** Current implementation fetches linked IDs one story/point at a time:
- 10 stories = 11 queries (1 for stories + 10 for links)
- 50 stories = 51 queries
- Each adds ~20ms latency minimum

**Fix required:** Batch fetch all links in one query:
```typescript
const { data: allLinks } = await supabase
  .from('story_points')
  .select('story_id, point_id')
  .in('story_id', userStories.map(s => s.id));
```

**Implementation (2026-02-09):** Refactored `loadProfileData()` in `profile-page.tsx` to:
1. Fetch all story-point links in 2 batch queries (one for stories, one for points)
2. Build Map-based lookups for O(1) access
3. Inline adaptation logic (removed separate adapter functions)
4. Result: 10 stories + 50 points = 5 queries total (stories, points, calibration, story_links, point_links) instead of 61 queries

#### 3. Prototype Code is Load-Bearing ✅ **COMPLETED**
**[Architect]** Production pages now depend on `src/app/prototypes/` components, which:
- Can't be removed without breaking production
- Lack production quality standards
- Create permanent tech debt

**Fix required:** Copy prototype components to `src/app/components/social/`, refactor for production (explicit props, no global state), update profile page to use production components.

**Implementation (2026-02-09):**
1. Created `src/app/components/social/story-card-with-links.tsx` - Production StoryCard with explicit props
2. Created `src/app/components/social/point-card-with-links.tsx` - Production PointCard with explicit props
3. Refactored to accept `linkedPoints: Point[]` and `linkedStories: Story[]` as direct props
4. Removed dependency on global registry pattern within components
5. Updated `profile-page.tsx` to use production components
6. Kept prototype components unchanged for reference
7. Result: Production pages no longer import from `src/app/prototypes/` (except types)

### 🟡 Important Suggestions

#### UX: Empty State is Invisible
**[UX]** New users won't know this feature exists because expandable sections only appear when links exist. No breadcrumb trail from profile → "hey, you can link things."

**Suggestion:** Add subtle empty state indicator or onboarding hint on first profile view. Consider "Link points to this story" prompt even when no links exist yet.

#### UX: Navigation Context Loss
**[UX]** Bidirectional linking (stories → points, points → stories) is powerful but potentially disorienting. When three clicks deep (profile → story expanded → point detail), users lose wayfinding context.

**Suggestion:** Add breadcrumb navigation or "back to profile" affordance. Consider preserving expansion state when returning to profile via back button.

#### Architect: Silent Error Handling
**[Architect]** Database errors return empty array (`[]`), making them indistinguishable from "no links exist":
```typescript
if (error) {
  console.error('Error fetching linked points:', error);
  return [];  // ← User sees nothing different
}
```

**Suggestion:** Add error tracking + UI indicator:
```typescript
if (error) {
  Sentry.captureException(error, { extra: { storyId } });
  return { linkedPointIds: [], _linkLoadError: true };
}
```
Show "Links unavailable" in UI instead of silently hiding functionality.

#### UX: Mobile Expansion Behavior Undefined
**[UX]** On narrow screens, expanding "3 points" could:
- Fill viewport entirely (feels like navigation)
- Push expand button offscreen (can't collapse)
- Trigger accidental clicks (fat-finger while scrolling)

**Suggestion:** Define mobile-specific behavior. Consider modal/sheet pattern for mobile instead of inline expansion.

#### UX: Click Target Ambiguity
**[UX]** Expandable "X points by [Name]" buttons might be confused with navigational links. Users may expect click → navigate to "points page" instead of reveal in-place.

**Suggestion:** Use clear expand/collapse icon (chevron down/up) and distinct visual style from navigational links. Consider hover state that previews what's inside.

### ❓ Conflicts to Resolve

#### Name Attribution: Who is "[Name]"?
**[UX]** The expandable sections say "X points by [Name]" but:
- On own profile: "3 points by Vyacheslav" is redundant/weird
- On others' profile: "3 points by Alice" is clear
- Mixed ownership: If I linked someone else's point to my story, whose name appears?

**Decision needed:** Should it say "by you" vs "by me" vs third-person names depending on viewer?

### Execution Recommendations

**Similar patterns:**
- P132: Rich Story View (uses same profile data bridge pattern)
- P113: Profile Stories/Points Tabs (provides UI foundation)

**Estimated effort to fix blockers:** 4 hours now vs 40 hours of debugging later
- 1 hour: Batch query refactor
- 2 hours: Replace global state with explicit props
- 1 hour: Copy prototype components to production
- 1 hour: Test + verify

### Post-Implementation Knowledge Capture

Run `/kdd` to capture:
1. **Data Bridge Pattern** → `docs/technical/architecture.md` (document adapter → registry → mock data override flow)
2. No new decisions needed (implements existing decisions)
3. No definition updates needed (Story-Point relationship already documented)

### Alignment Check

**Status:** ✅ **STRONG** — All terminology matches `definitions.md`, implements philosophy.md Story-Point distinction correctly, follows past architectural decisions.

**Minor clarification:** Line 14 says prototype shows "exact expected behavior" — consider clarifying this means "exact UI/UX" (prototype uses mock data, production uses DB).

## Problem

Profile pages show Stories and Points tabs, but **linked items don't appear** even though the data bridge system is in place. The prototype components render correctly, but the `story_points` table is empty, so there's nothing to display.

**Current behavior:**
```
Stories tab: Shows stories ✅
             No "X points by [Name]" button ❌

Points tab:  Shows points ✅
             No "X stories by [Name]" button ❌
```

**Root cause:** The `story_points` junction table has no data. Links must be created through the story detail page UI.

## Goal

Make story-point relationships **visible and functional** on profile pages so users can:
1. See which points are referenced in a story
2. See which stories reference a point
3. Navigate between linked content

## User Story

**As a profile viewer**, I want to see which points a person has linked to their stories (and vice versa), so that I can understand the full context of their thinking.

## Solution

**Phase 1: Ensure Linking Works** (May already be done - needs verification)
- Story detail page has UI to add points ✅ (exists in P131)
- `linkPointToStory()` service method works ✅ (exists)
- Database accepts inserts ✅ (schema exists)

**Phase 2: Verify Profile Display** (Current work)
- Data bridge fetches linked IDs from `story_points` table ✅ (implemented)
- Registry populates with stories and points ✅ (implemented)
- Prototype components render linked items ✅ (implemented)
- **Debug why no links appear** 🔍

**Phase 3: Create Test Data** (If table is empty)
- Create seed data or manual test flow
- Verify links appear on profile

## Technical Architecture

### Data Flow (Already Implemented)

```
┌────────────────────────────────────────────────────────────┐
│ PROFILE PAGE LOAD                                           │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 1. Fetch stories + points from services                     │
│    - storiesService.getStoriesByAuthor(profileId)          │
│    - pointsService.getPointsWithUserPositions(profileId)   │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 2. Adapt to prototype format (profile-page.tsx)            │
│    - adaptStory() → fetches linkedPointIds from DB         │
│    - adaptPoint() → fetches linkedStoryIds from DB         │
│                                                             │
│    Query: SELECT point_id FROM story_points                │
│           WHERE story_id = ?                                │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 3. Register in global bridge (profile-data-bridge.ts)      │
│    - profileDataRegistry.registerAll(stories, points)      │
│    - Exposed as window.__profileDataRegistry               │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 4. Render prototype components                              │
│    - <StoryCard story={...} context="profile" />           │
│    - <PointCard point={...} profileOwnerId={...} />        │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 5. Components call mock data functions                      │
│    - getPointsForStory(storyId)                            │
│      → Checks window.__profileDataRegistry first           │
│      → Falls back to mock data                             │
│    - Returns Point[] objects                                │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ 6. Render linked items (if any)                            │
│    IF linkedPoints.length > 0:                              │
│      Show: "🔽 2 points by [Name]"                         │
│      Expandable section with linked points                  │
│    ELSE:                                                    │
│      No footer shown                                        │
└────────────────────────────────────────────────────────────┘
```

### Files Modified (Already Done)

1. **src/app/pages/profile-data-bridge.ts** (NEW)
   - `ProfileDataRegistry` class
   - Global registry exposed via `window.__profileDataRegistry`

2. **src/app/pages/profile-page.tsx**
   - `getLinkedStoryIdsForPoint()` - Queries story_points table
   - `getLinkedPointIdsForStory()` - Queries story_points table
   - `adaptStory()` - Fetches linked point IDs
   - `adaptPoint()` - Fetches linked story IDs
   - Registers adapted data in registry

3. **src/app/prototypes/shared/mock-data.ts**
   - `getPointById()` - Checks registry before mock data
   - `getStoryById()` - Checks registry before mock data

## Debug Plan

### Step 1: Check Console Logs

Open profile page and check console for:

```javascript
🔍 Profile Data Loaded: {
  stories: 3,                    // ✅ Stories exist
  points: 6,                     // ✅ Points exist
  storiesWithLinks: 0,           // ❌ No stories have linked points
  pointsWithLinks: 0,            // ❌ No points have linked stories
  sampleStory: {
    text: "asp spdfl sdfas",
    linkedPointIds: []           // ❌ Empty array = no links in DB
  }
}
```

**If `storiesWithLinks: 0` and `linkedPointIds: []`:**
→ `story_points` table is empty
→ Need to create links through story detail page

### Step 2: Verify Linking Functionality

1. Navigate to any story detail page: `/story/{id}`
2. Check if "Add Point" UI exists
3. Try adding a point to the story
4. Check if `story_points` table gets a row
5. Return to profile and verify link appears

### Step 3: Check for Errors

Console logs will show:
```javascript
// Success
✅ Found linked points for story: abc-123 → 2 points

// Error
🔴 Error fetching linked points for story: abc-123 <error>
```

## Expected Behavior

### Stories Tab

```
┌─────────────────────────────────────────────────┐
│ 👤 Jordan Taylor                                │
│ "Remote work is more productive than office     │
│  work for knowledge workers"                     │
│ Disagrees (2)  Unsure (1)  Agrees (5)          │
├─────────────────────────────────────────────────┤
│ 🔽 2 points by Jordan  [share] [↗]             │ ← Expandable
└─────────────────────────────────────────────────┘
     │
     └─► (Click to expand)
         ┌──────────────────────────────────────┐
         │ 📌 Jordan Agrees                     │
         │ "Deep work requires uninterrupted    │
         │  time blocks"                         │
         │ Disagrees (0) Unsure (0) Agrees (3)  │
         ├──────────────────────────────────────┤
         │ 📌 Jordan Strongly Agrees            │
         │ "Async communication reduces         │
         │  meeting overhead"                    │
         │ Disagrees (1) Unsure (2) Agrees (4)  │
         └──────────────────────────────────────┘
```

### Points Tab

```
┌─────────────────────────────────────────────────┐
│ 📌 Deep work requires uninterrupted time        │
│ Jordan Agrees                                    │
│ Disagrees (0)  Unsure (0)  Agrees (3)          │
├─────────────────────────────────────────────────┤
│ 🔽 3 stories by Jordan  [share] [↗]            │ ← Expandable
└─────────────────────────────────────────────────┘
     │
     └─► (Click to expand)
         ┌──────────────────────────────────────┐
         │ 👤 Jordan Agrees                     │
         │ "I started remote work in 2020 and   │
         │  my productivity doubled..."          │
         ├──────────────────────────────────────┤
         │ 👤 Jordan Strongly Agrees            │
         │ "Last week I tried office work and   │
         │  got nothing done..."                 │
         └──────────────────────────────────────┘
```

## Acceptance Criteria

**Given** the data bridge system is implemented
**And** story_points table has at least one link

**When** I visit a profile page with linked content
**Then** I should see:

### Stories Tab
- [ ] Stories display correctly (already working)
- [ ] Story with linked points shows "🔽 X points by [Name]" button
- [ ] Clicking button expands to show linked points
- [ ] Each linked point shows: statement, user's position badge, position counts
- [ ] Clicking linked point navigates to `/point/{id}`
- [ ] Story without linked points shows no expand button (expected)

### Points Tab
- [ ] Points display correctly (already working)
- [ ] Point with linked stories shows "🔽 X stories by [Name]" button
- [ ] Clicking button expands to show linked stories
- [ ] Each linked story shows: text preview, user's position badge
- [ ] Clicking linked story navigates to `/story/{id}`
- [ ] Point without linked stories shows no expand button (expected)

### Navigation
- [ ] Clicking story card navigates to story detail
- [ ] Clicking point card navigates to point detail
- [ ] Clicking linked item navigates to its detail page
- [ ] Back button returns to profile

### Error Handling
- [ ] Database errors logged to console
- [ ] Page doesn't crash if story_points query fails
- [ ] Empty state handled gracefully (no expand button shown)

## Out of Scope

- Creating UI to link stories/points (already exists in P131)
- Editing or removing links (future feature)
- Inline position taking (PointCard wrapper already handles this)
- Bulk link creation

## Verification Checklist (Prototype vs Production)

**Open both side-by-side:**
- Left: `/prototype/linkedin-like/profile` (working reference)
- Right: `/p/vyacheslav-ladischenski` (production)

| Feature | Prototype | Production | Status |
|---------|-----------|------------|--------|
| **Stories Tab** |
| Stories display | ✅ | ✅ | PASS |
| "X points by [Name]" button | ✅ | ❌ | **FAIL** |
| Expand shows linked points | ✅ | N/A | BLOCKED |
| Linked point has position badge | ✅ | N/A | BLOCKED |
| Click point → navigate to detail | ✅ | N/A | BLOCKED |
| **Points Tab** |
| Points display | ✅ | ✅ | PASS |
| "X stories by [Name]" button | ✅ | ❌ | **FAIL** |
| Expand shows linked stories | ✅ | N/A | BLOCKED |
| Linked story shows text preview | ✅ | N/A | BLOCKED |
| Click story → navigate to detail | ✅ | N/A | BLOCKED |

**Root Cause:** Production story_points table is empty → No links to display

### Prototype Mock Data Reference

**File:** `src/app/prototypes/shared/mock-data.ts`

Check what the prototype uses:
```typescript
// Example story with linked points
{
  id: 'story-1',
  text: 'Remote work is more productive...',
  linkedPointIds: ['point-1', 'point-2']  // ← Has links!
}

// Example point with linked stories
{
  id: 'point-1',
  text: 'Deep work requires uninterrupted time',
  linkedStoryIds: ['story-1', 'story-3']  // ← Has links!
}
```

**To match prototype behavior in production:**
1. Production stories need `linkedPointIds: [...]` (populated from DB)
2. Production points need `linkedStoryIds: [...]` (populated from DB)
3. Data comes from `story_points` table

## Testing Strategy

### Verification Steps

**Step 1: Verify prototype works**
```bash
# Open prototype
open http://localhost:5001/prototype/linkedin-like/profile
```
- Check Stories tab → Should see expandable sections
- Check Points tab → Should see expandable sections
- **Take screenshots** for reference

**Step 2: Check production console logs**
```bash
# Open production profile
open http://localhost:5001/p/vyacheslav-ladischenski
```
- Open DevTools console (F12)
- Look for: `🔍 Profile Data Loaded: { ... }`
- Check: `storiesWithLinks: 0` ← Should be > 0 if links exist
- Check: `linkedPointIds: []` ← Should have IDs if links exist

**Step 3: Verify data bridge is working**
```javascript
// In console, check registry
window.__profileDataRegistry.stories.size  // → Should equal story count
window.__profileDataRegistry.points.size   // → Should equal point count

// Try fetching a story
window.__profileDataRegistry.getStory('story-id-here')
// → Should return Story object with linkedPointIds array

// Check mock data override
// This should use registry, not mock data
window.getStoryById('story-id-here')
```

**Step 4: Verify database state**
```sql
-- Check if any links exist
SELECT COUNT(*) as link_count FROM story_points;

-- If > 0, check what's linked
SELECT
  s.content as story,
  p.statement as point
FROM story_points sp
JOIN stories s ON sp.story_id = s.id
JOIN points p ON sp.point_id = p.id
LIMIT 5;
```

### Manual Test Flow

1. **Setup: Create a link**
   ```sql
   -- Get IDs
   SELECT id, content FROM stories LIMIT 1;
   SELECT id, statement FROM points LIMIT 1;

   -- Create link
   INSERT INTO story_points (story_id, point_id)
   VALUES ('<story-id>', '<point-id>');
   ```

2. **Verify profile display**
   - Navigate to author's profile
   - Check Stories tab: Should show "1 point by [Name]"
   - Click to expand: Should show the linked point
   - Check Points tab: Should show "1 story by [Name]"
   - Click to expand: Should show the linked story

3. **Test navigation**
   - Click linked point → goes to `/point/{id}` ✓
   - Click linked story → goes to `/story/{id}` ✓
   - Back button returns to profile ✓

4. **Check console**
   ```javascript
   ✅ Found linked points for story: <id> → 1 points
   🔍 Profile Data Loaded: {
     storiesWithLinks: 1,    // Should be > 0
     pointsWithLinks: 1      // Should be > 0
   }
   ```

### E2E Test (Future)

```typescript
test('profile shows story-point links', async ({ page }) => {
  // Create story with linked point
  const story = await createStory({ content: 'Test story' });
  const point = await createPoint({ statement: 'Test point' });
  await linkPointToStory(story.id, point.id);

  // Visit profile
  await page.goto(`/p/${authorSlug}`);

  // Stories tab should show link
  await page.click('[role="tab"]:has-text("Stories")');
  await expect(page.locator('text=1 point by')).toBeVisible();

  // Expand and verify
  await page.click('text=1 point by');
  await expect(page.locator('text=Test point')).toBeVisible();

  // Points tab should show link
  await page.click('[role="tab"]:has-text("Points")');
  await expect(page.locator('text=1 story by')).toBeVisible();
});
```

## Dependencies

- ✅ P131: Manual Points Creation (provides UI to create links)
- ✅ P117: Stories, Points, Calibration Backend (provides data layer)
- ✅ P113: Profile Stories/Points Tabs (provides UI structure)
- ✅ story_points table exists in database
- ✅ linkPointToStory() service method implemented

## Implementation Notes

### Debug Logging Added

**Location:** `src/app/pages/profile-page.tsx`

Console logs show:
- How many stories/points loaded
- How many have linked items
- Sample of linked IDs
- Database errors if any

**To see logs:** Open DevTools console and reload profile page

### Common Issues

**Issue:** No links shown even though database has data
- Check console for errors
- Verify `profileDataRegistry.registerAll()` is called
- Check `window.__profileDataRegistry` in console

**Issue:** Components not rendering linked items
- Verify `context="profile"` is set (not `"point-detail"`)
- Check `linkedPoints.length > 0` in component
- Verify mock-data.ts overrides are working

**Issue:** Navigation goes to prototype routes
- Verify wrapper components have `disableNavigation={true}`
- Check click handlers in wrappers intercept navigation

## Rollout

1. **Phase 1: Debug** ← We are here
   - Add console logging
   - Verify data flow
   - Check why links don't appear

2. **Phase 2: Fix**
   - If table empty: Create test data
   - If code broken: Fix the issue
   - Verify links appear

3. **Phase 3: Polish**
   - Remove debug logs (or make conditional)
   - Add analytics tracking
   - Document flow for future reference

## Success Metrics

- [ ] Console shows `storiesWithLinks > 0` when data exists
- [ ] Profile page displays expandable link buttons
- [ ] Clicking expands shows linked content
- [ ] Navigation works between linked items
- [ ] No console errors

## Related Specs

- P131: Manual Points Creation (how links are created)
- P113: Profile Stories/Points Tabs (UI foundation)
- P117: Backend data layer
