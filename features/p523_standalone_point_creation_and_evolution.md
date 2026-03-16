---
status: today
type: story
rank: 0.75
tags:
  - points
  - creation
  - evolution
  - ux
delivery_stage: 3-arch-review
created_date: 2026-03-15T00:00:00.000Z
prepped_date: null
reviews:
  ux: null
  architect: null
  alignment: null
locked_at: '2026-03-15T14:22:58.149Z'
---

# P523: Point Creation from Point Detail + "Inspired By" Link

**Supersedes:** P433 (Correct a Point — draft, never implemented)
**Related:** P99 (Story After Position — draft, design questions)

---

## Challenge Resolution (2026-03-16)

Original PRD was broader (standalone creation + full evolution chains). `/challenge-prd` returned CHALLENGE with 4 BLOCKs. **Resolution:** Narrowed scope — entry point is point detail page only, single nullable FK, no chain UI, no feed changes.

---

## Problem Statement

**Current state:** Points can only be created by story authors inline on their story detail page. When a user sees a point they mostly agree with but would word differently, they have no way to create their version.

**Pain points:**
- No "I'd word this differently" action on points
- Evolution is invisible — no link between old and new versions
- In-session friction during events and /live sessions

**Who's affected:** Event/workshop participants, co-founders in /live sessions, the founder

---

## Business Requirements

**Must-haves:**
1. Any authenticated user can create a new point from the point detail page ("Suggest a different version")
2. New point form pre-filled with original text for editing
3. New point linked to original via `inspired_by_point_id` (nullable FK)
4. Original point shows "N alternative versions" with navigation to children
5. New point shows "Inspired by: [original]" with link back
6. Creating a linked point does NOT affect positions or stories on the original
7. Points remain immutable — evolution via new linked points, not edits

**Out of scope:** Standalone creation page, chain navigation UI, feed changes, notifications, link types (P535), short IDs (P536)

**Success conditions:** Under 60 seconds from "I'd word this differently" to new linked point. Position-holders see alternatives exist (quiet indicator).

**Constraints:** Entry point: point detail page only. Points are public. No forced position migration.

---

## Acceptance Criteria

- [ ] Point detail page shows "Suggest a different version" button for authenticated users
- [ ] Button opens creation form pre-filled with original point text
- [ ] Form includes: editable statement text + position selection
- [ ] Submitting creates a new point with `inspired_by_point_id` set to the original
- [ ] New point appears in feed and on user's profile (same as any point)
- [ ] New point detail page shows "Inspired by: [original point text]" with link
- [ ] Original point detail page shows "N alternative versions" with links to children
- [ ] Creating a linked point does not affect positions or stories on the original
- [ ] A point can have multiple children (divergent alternatives valid)
- [ ] Works for any authenticated user, not just the original point's author

---

## UX Requirements

### User Flow: Create Alternative Version

**Entry:** User on `/point/:id`, authenticated.

1. Click **"Suggest a different version"** (ghost button below point card footer)
2. Inline form expands (no modal): textarea pre-filled with original text, auto-focused
3. Soft char indicator (140 soft, 1000 hard). Label: "How would you word this?"
4. PositionButtons below textarea. Hint: "What's your position on your version?"
5. **"Create point"** (primary, disabled until text differs AND position selected) + **"Cancel"** (ghost)
6. Submit → toast "Point created" with "View →" link. Form collapses.

**Shortcut:** If user has position on original, pre-select matching position.

### View "Inspired By" on Child Point

Above point statement: muted `Inspired by:` + truncated original (~80 chars) as link to `/point/:originalId`

### View Alternative Versions on Original

Below point card: `N alternative version(s)` link. Expands to show child points (truncated statement, author, position badge, date). First 5, then "Show N more."

### Edge Cases

- Not authenticated: button hidden
- Text unchanged: Create disabled, tooltip "Edit the text to create your version"
- Network error: toast error, form stays open
- Empty text: Create disabled

### Accessibility

- `aria-expanded` on button, `aria-controls` on form
- Escape closes form. Tab: button → textarea → positions → Create → Cancel

### Component Analysis

| Element | Classification | Notes |
|---------|---------------|-------|
| "Suggest a different version" button | **New** | Ghost button below footer |
| Inline creation form | **New** | Simpler than AddPointForm |
| Textarea with char limit | **Reuse** | Pattern from story-detail-page.tsx |
| PositionButtons | **Reuse** | PositionButton.tsx |
| "Inspired by" display | **New** | Muted text + truncated link |
| "N alternative versions" | **New** | Collapsible list below card |
| Toast feedback | **Reuse** | sonner |

---

## Technical Architecture

### Technical Analysis (Current State)

**Points table** (`supabase/migrations/20260204_stories_points_calibration.sql`):
```sql
CREATE TABLE points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement TEXT NOT NULL,
  context TEXT,
  first_validator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tags TEXT[] DEFAULT '{}'
);
-- P504 added: banner_url TEXT (20260313141528)
```

**RLS policies on `points`:**
- SELECT: public (`true`)
- INSERT: `auth.uid() IS NOT NULL AND is_verified = true`
- No UPDATE/DELETE policies (points are immutable)

**Type hierarchy** (`src/app/types/index.ts`):
`Point` → `PointWithCreator` → `PointWithCounts` → `PointWithUserPosition`

`Point` has: `id, statement, context?, firstValidatorId, createdAt, updatedAt, tags, bannerUrl?`

**Service layer** (`src/app/data/points-service-real.ts`):
- `createPoint(statement, context?, tags[])` — inserts with `first_validator_id = auth.uid()`, returns `Point`
- All read methods join `profiles` via `points_first_validator_id_fkey`
- No concept of parent/child point relationships exists

**Point detail page** (`src/app/pages/point-detail-page.tsx`):
- Loads via `getPointWithUserPosition` or `getPointWithCounts`
- Renders point card with PositionButtons, ShareButton, filter tabs, position holders
- Footer area (line ~461) is the insertion point for the "Suggest a different version" button
- Already imports `PositionButtons`, `useAuth`, toast patterns

**Existing creation pattern** (`story-detail-page.tsx` AddPointForm):
- Inline form with textarea + PositionButtons + submit/cancel
- Creates point via `pointsService.createPoint()`, then links to story via `storiesService.linkPointToStory()`
- Handles orphan recovery (point created but link failed)
- Uses `displayLength()` for char counting, `POINT_CHAR_MAX` constant

---

### Architecture Decisions

**AD-1: Nullable FK on `points` table (not a junction table)**

`inspired_by_point_id UUID REFERENCES points(id) ON DELETE SET NULL` — nullable self-referencing FK.

*Why not a junction table:* The spec defines a single parent per child point. A junction table adds schema and query complexity for a 1:N relationship that will never become N:N (a "version" is inspired by exactly one original). SET NULL on delete preserves the child if the parent is deleted — the child remains a valid standalone point.

**AD-2: Extend `createPoint` signature, don't create a new method**

Add optional `inspiredByPointId?: string` parameter to `createPoint()` in the interface and implementation. The existing method already handles the core insert; adding one nullable column is simpler than a parallel creation path. The mock service gets the same parameter.

**AD-3: Fetch children with a dedicated query, not by loading all points**

New method: `getAlternativeVersions(pointId: string): Promise<PointWithCreator[]>` — queries `points WHERE inspired_by_point_id = :pointId`. Called on point-detail-page only. No changes to feed queries (children appear in feed as normal points).

**AD-4: Fetch parent inline with the point query (single select)**

Extend the `getPoint()` select to include `inspired_by_point_id` and, when non-null, a joined subquery for the parent point's `id` and `statement` (truncated in UI). This avoids a second round-trip.

**AD-5: No changes to positions, stories, or feed**

Creating a linked point does not transfer positions, does not affect the parent's position counts, and does not change feed ranking. The child appears in the feed as any other new point. This is explicit in the spec's "Out of scope."

**AD-6: Index on `inspired_by_point_id` for child lookups**

`CREATE INDEX idx_points_inspired_by ON points(inspired_by_point_id) WHERE inspired_by_point_id IS NOT NULL` — partial index, only rows with a parent. Keeps the index small since most points will have no parent initially.

---

### Security Review

**RLS Policies:**
- ✅ Existing INSERT policy (`verified user + auth.uid()`) covers new points. No new RLS needed.
- ✅ No UPDATE/DELETE on points — `inspired_by_point_id` cannot be altered after creation.
- ✅ SELECT is public (`true`) — child point queries work for all users.

**Authentication:**
- ✅ `createPoint` checks `supabase.auth.getUser()` (defense-in-depth alongside RLS).
- ✅ UI hides button for unauthenticated users. RLS enforces server-side.
- ℹ️ Note: RLS requires `is_verified = true`, not just authenticated. This is existing behavior for all point creation, not a regression.

**Input Validation:**
- ⚠️ **No server-side length constraint on `statement`.** Column is `TEXT NOT NULL` with no CHECK. Add `CHECK (char_length(statement) <= 1000)` in the migration.
- ⚠️ **Empty/whitespace statement possible.** Add `CHECK (char_length(trim(statement)) > 0)` in the migration.
- ⚠️ **FK violation on `inspired_by_point_id`** if parent deleted between page load and submit. Catch error code `23503` in service layer and return a typed error so UI shows "Original point no longer exists."
- ✅ No XSS concern — React auto-escapes rendered text.

**Data Protection:**
- ✅ Points are public by design. `inspired_by_point_id` (UUID FK) contains no PII.
- ✅ `first_validator_id` correctly set from `auth.uid()` on child points.

---

### Implementation Approach

#### Migration (1 file)

**Create:** `supabase/migrations/YYYYMMDDHHMMSS_p523_inspired_by_point.sql`
```sql
-- P523: inspired_by link + input validation constraints
ALTER TABLE public.points
  ADD COLUMN IF NOT EXISTS inspired_by_point_id UUID REFERENCES points(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_points_inspired_by
  ON points(inspired_by_point_id)
  WHERE inspired_by_point_id IS NOT NULL;

-- Security: server-side input validation (from security review)
ALTER TABLE public.points
  ADD CONSTRAINT chk_points_statement_length CHECK (char_length(statement) <= 1000);
ALTER TABLE public.points
  ADD CONSTRAINT chk_points_statement_not_empty CHECK (char_length(trim(statement)) > 0);
```

No RLS changes needed — existing INSERT policy (`verified user + auth.uid()`) already covers new points. The new column is just data on the same row.

#### Types (1 file to modify)

**Modify:** `src/app/types/index.ts`
- Add `inspiredByPointId?: string` to `Point` interface
- Add `inspired_by_point_id?: string | null` to `DbPoint` interface
- Add `InspiredByInfo` interface: `{ id: string; statement: string; creatorName: string }`
- Add `inspiredBy?: InspiredByInfo` to `PointWithCreator`

#### Service Interface (1 file to modify)

**Modify:** `src/app/data/points-service.interface.ts`
- Add `inspiredByPointId?: string` to `createPoint` signature
- Add `getAlternativeVersions(pointId: string): Promise<PointWithCreator[]>`

#### Service Implementation (1 file to modify)

**Modify:** `src/app/data/points-service-real.ts`
- `createPoint`: accept optional `inspiredByPointId`, include in INSERT. Catch FK violation (error code `23503`) and return typed error for UI
- `mapPointFromDb`: map `inspired_by_point_id` → `inspiredByPointId`
- `getPoint`: extend select to join parent point when `inspired_by_point_id IS NOT NULL`:
  ```
  inspired_by:points!points_inspired_by_point_id_fkey (id, statement, creator:profiles!points_first_validator_id_fkey(name))
  ```
- New `getAlternativeVersions`: query `points` where `inspired_by_point_id = pointId`, with creator join, ordered by `created_at desc`

#### Mock Service (1 file to modify)

**Modify:** `src/app/data/points-service-mock.ts`
- Add matching parameter and stub for `getAlternativeVersions`

#### Point Detail Page (1 file to modify)

**Modify:** `src/app/pages/point-detail-page.tsx`
- Add state: `showCreateForm`, `alternativeVersions`, `altVersionsExpanded`
- Load alternative versions in `loadData()` via `pointsService.getAlternativeVersions(id)`
- **"Inspired by" display** (above point statement): if `point.inspiredBy`, render muted text + truncated link
- **"Suggest a different version" button** (below footer, after ShareButton): ghost button, visible when `user` is truthy
- **Inline creation form**: new `SuggestVersionForm` component (same file or extracted):
  - Textarea pre-filled with original `point.statement`, auto-focused
  - Char indicator (140 soft / 1000 hard — reuse `POINT_CHAR_MAX` and `displayLength`)
  - PositionButtons below textarea
  - Create disabled until text differs from original AND position selected
  - Submit calls `pointsService.createPoint(statement, undefined, [], inspiredByPointId)` then `pointsService.setPosition(newPointId, userId, position)`
  - Toast with "View →" link to `/point/${newId}`
- **"N alternative versions" section** (below point card): collapsible list of child points (truncated statement, author avatar, position badge, date). First 5, then "Show N more."

#### Build Sequence

1. Migration → `./scripts/migrate.sh`
2. Types update
3. Service interface + implementation + mock
4. Point detail page UI (form + displays)
5. Pre-commit checks → test → verify

#### Files Summary

| Action | File |
|--------|------|
| **Create** | `supabase/migrations/YYYYMMDDHHMMSS_p523_inspired_by_point.sql` |
| Modify | `src/app/types/index.ts` |
| Modify | `src/app/data/points-service.interface.ts` |
| Modify | `src/app/data/points-service-real.ts` |
| Modify | `src/app/data/points-service-mock.ts` |
| Modify | `src/app/pages/point-detail-page.tsx` |

No new pages, no route changes, no feed changes.
