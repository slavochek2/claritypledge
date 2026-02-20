---
status: in-progress
type: story
rank: 2
workstream: foundation
created_date: 2026-02-20T00:00:00.000Z
tags: []
uat_file: features/uat/p407.md
test_files:
  - e2e/p407-story-detail-points.spec.ts
  - e2e/p407-smoke.spec.ts
locked_at: '2026-02-20T12:33:08.050Z'
---

# P407: Unify Story Detail Points — Remove Duplicate List

## Problem

On the story detail page, linked points appear **twice**:
1. Inside `StoryCardDetail` — collapsible toggle in the footer, full `QuotedPoint` cards with position buttons
2. Inside `KeyPointsSection` — a separate flat list of the same points with unlink (✕) buttons

The author sees their points listed in two different visual styles stacked below each other. The `KeyPointsSection` was built separately from the story card's collapsible points system and now duplicates it.

## Solution

- **Remove** the point list from `KeyPointsSection` — it's already shown in the story card
- **Auto-expand** points by default when `isDetailView={true}` in `StoryCardDetail`
- **`KeyPointsSection` becomes add-form only** — no point list, just the textarea + position picker + Add Point button
- **`justCreated` banner** sits above the add form ("Story saved. Now add key points...")

## Acceptance Criteria

- [ ] Points auto-expand on story detail page (no click needed)
- [ ] KeyPointsSection shows only the add form — no repeated point list
- [ ] `justCreated` banner appears above form when redirected from create flow
- [ ] Non-authors: no add form shown

## Files Affected

- `src/app/components/social/StoryCardDetail.tsx` — auto-expand on detail view
- `src/app/pages/story-detail-page.tsx` — remove point list from KeyPointsSection, add justCreated banner

## Technical Notes

- `isDetailView` prop already exists on `StoryCardDetail` — use it to default `pointsExpanded` to `true`
- `QuotedPoint` is a module-private function inside `StoryCardDetail.tsx` (not in `PositionButton.tsx`)

## Testing

Manual: author flow (create → detail, points auto-expanded, no duplicate list), non-author view (no add form)

---

## Technical Architecture

### Technical Analysis

#### Component Location Correction

`QuotedPoint` is a module-private function at **line ~394 of `src/app/components/social/StoryCardDetail.tsx`** — NOT in `PositionButton.tsx` as noted in Technical Notes above. All QuotedPoint edits go in `StoryCardDetail.tsx`.

#### Data Flow: DB → QuotedPoint

```
Supabase DB
  storiesService.getStoryWithPoints(id)    --> story.points: PointSummary[]
  pointsService.getPositionCountsForPoints --> positionCounts: Map<id, Record<PositionType, number>>
  pointsService.getMyPositionsForPoints    --> userPositions: Map<id, PointPosition>

StoryDetailPage state
  story.points    --> linkedPoints    --> StoryCardDetail
  positionCounts  --> positionCounts  --> StoryCardDetail --> QuotedPoint (as baseCounts)
  userPositions   --> userPositions   --> StoryCardDetail --> QuotedPoint (stale after mount — bug #5)
  handlePositionClick --> onPositionClick --> StoryCardDetail --> QuotedPoint

QuotedPoint
  initialPosition = useState(userPositions.get(id)?.position)  ← stale after mount
  currentPosition = useState(initialPosition)                   ← stale after mount
  counts = useMemo adjusting baseCounts                        ← zeroes sub-positions (bug #6)
```

#### Bugs by File

**`story-detail-page.tsx`**

| # | Location | Bug |
|---|----------|-----|
| #1 | `handlePositionClick` line ~638 | Toggle-off always calls `setPosition` — DB retains position, UI shows none |
| #3 | `AddPointForm.handleAdd` line ~191 | `setPosition` return value discarded — no feedback if position save fails |
| #4 | `handlePositionClick` line ~629 | `user.id` accessed without null guard |
| #5 | `AddPointForm` line ~265 | Char nudge `> 140` should be `>= 140` |

**`StoryCardDetail.tsx`**

| # | Location | Bug |
|---|----------|-----|
| #5 | `QuotedPoint` lines ~429–434 | `initialPosition`/`currentPosition` useState frozen at mount — stale after parent updates |
| #6 | `QuotedPoint` lines ~438–446 | `adjusted` counts hardcodes `strongly_agree: 0`, `somewhat_agree: 0` etc — zeroes real votes |

**`stories-service-real.ts`**

| # | Location | Bug |
|---|----------|-----|
| #2 | `linkPointToStory` line ~456 | Returns `false` on 23505 unique violation — triggers false orphan flow |

---

### Architecture Decisions

**Decision 1: Fix QuotedPoint stale position state**

Chosen: Replace `initialPosition`/`currentPosition` useState pair with `localPosition` (optimistic override) + derived `effectivePosition = localPosition ?? userPositions.get(point.id)?.position ?? null`. Add `useEffect` to clear `localPosition` when parent confirms the update.

Rationale: Props-derived computation is React-idiomatic. `localPosition` layer preserves optimistic responsiveness during async round-trip.

Alternative rejected: Reset via key prop change on `userPositions` update — remounts component, causes visual flicker.

**Decision 2: Fix toggle-off**

Chosen: In `handlePositionClick`, detect toggle-off before the `try` block: `const isTogglingOff = userPositions.get(pointId)?.position === position`. Branch to `pointsService.removePosition` on toggle-off, `setPosition` otherwise. Optimistic map update (existing code) is already correct — only the async DB call needs branching.

**Decision 3: Auto-expand**

Chosen: No change needed. `StoryCardDetail` already initializes `pointsExpanded = useState(isDetailView)`. Auto-expand is working — it was obscured by the duplicate list below. Once `KeyPointsSection` loses its list, the card's auto-expanded points become the sole display.

**Decision 4: Fix linkPointToStory 23505**

Chosen: `if (error.code === '23505') return true` before the general error return. Treats unique violation as idempotent success — correct semantic for "ensure this point is linked".

---

### Security Review

**Authentication:**
- ℹ️ `linkPointToStory` doesn't call `getUser()` before the operation (unlike `createStory`). Relies entirely on RLS for rejection. Acceptable — RLS is the correct enforcement layer.

**Input Validation:**
- ✅ `pointId`/`storyId` come from DB-fetched `PointSummary` objects (not user-typed input). Passed into parameterized PostgREST queries — no injection risk.

**Data Protection:**
- ✅ Pure UI restructuring — no new data read/written/exposed. `PointSummary` contains no PII fields.

---

### Implementation Approach

**Files to Modify**

| File | Changes |
|------|---------|
| `src/app/data/stories-service-real.ts` | `linkPointToStory`: add `if (error.code === '23505') return true` |
| `src/app/pages/story-detail-page.tsx` | Toggle-off fix; null guard; `setPosition` failure toast; char nudge `>=`; strip point list from `KeyPointsSection`; add `justCreated` banner |
| `src/app/components/social/StoryCardDetail.tsx` | Fix stale position state; fix counts zeroing |

No new files. No database migrations.

**Build Sequence**

- [ ] 1. `stories-service-real.ts` — 23505 idempotent fix (isolated, no component changes)
- [ ] 2. `story-detail-page.tsx` bug fixes (no structural changes):
  - [ ] 2a. `handlePositionClick`: null guard + toggle-off routes to `removePosition`
  - [ ] 2b. `AddPointForm`: `setPosition` failure toast
  - [ ] 2c. Char nudge: `>= 140`
- [ ] 3. `StoryCardDetail.tsx` — counts fix (spread `baseCounts` before adjusting, isolated to `useMemo`)
- [ ] 4. `StoryCardDetail.tsx` — stale position state fix (`localPosition` + `effectivePosition` + `useEffect`)
- [ ] 5. Simplify `KeyPointsSection`:
  - [ ] 5a. Delete point list + `_unlinkingPointId` + `handleUnlink` + `onPointUnlinked` prop
  - [ ] 5b. Add `justCreated` banner above add form
  - [ ] 5c. Remove `points` prop if no longer needed for visibility logic
- [ ] 6. Delete `PointCard` component (dead code after step 5)
