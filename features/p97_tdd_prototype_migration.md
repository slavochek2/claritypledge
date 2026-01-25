# P97: TDD Rebuild - LinkedIn-Like Prototype to Production

## Overview

Migrate prototype (~8,600 lines, mock data) to production with real database, tests first.

**Scope:** Profile (Stories/Points/Calibration) + Events + Navigation

**Rebuild means full fidelity:** All hover states, tooltips, and interactive feedback from the prototype must be preserved. This includes:
- Hover tooltips explaining calibration metrics (Ear/Mic credibility)
- Hover states on cards (Stories, Points, Events)
- Tooltip explanations on position buttons (Likert scale meanings)
- Any contextual help/info icons with hover content

## Current State

| Area | Production | Prototype | Gap |
|------|------------|-----------|-----|
| **Profile** | Simple card + pledge CTA | Stories/Points tabs, calibration, credibility | Major |
| **Events** | Basic /events/* | Rich cards, Co-create toggle | Moderate |
| **Database** | profiles, events, clarity_* | Mock data only | Stories/Points tables missing |
| **Tests** | Some unit + E2E | None | All new |

---

## Phase 1: Database Schema

### New Tables

1. **stories** - lived experiences (author_id, text, visibility, event_id)
2. **points** - debatable claims (text, created_by)
3. **positions** - user stance on points, 7-point Likert scale
4. **story_point_links** - bidirectional linking
5. **story_verifications** - who understood whose story
6. **calibration_records** - gap tracking per session

### SQL Schema

```sql
-- 1. stories (lived experiences)
CREATE TABLE public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  visibility TEXT CHECK (visibility IN ('public', 'shared', 'private')) DEFAULT 'private',
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. points (debatable claims)
CREATE TABLE public.points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. positions (user stance on points, 7-point Likert)
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  point_id UUID REFERENCES points(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  position TEXT CHECK (position IN (
    'strongly_disagree', 'disagree', 'somewhat_disagree',
    'unsure',
    'somewhat_agree', 'agree', 'strongly_agree'
  )) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(point_id, user_id)
);

-- 4. story_point_links (bidirectional)
CREATE TABLE public.story_point_links (
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
  point_id UUID REFERENCES points(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY(story_id, point_id)
);

-- 5. story_verifications (who understood whose story)
CREATE TABLE public.story_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE NOT NULL,
  verifier_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  session_id UUID REFERENCES clarity_sessions(id) ON DELETE SET NULL,
  rating INT CHECK (rating BETWEEN 1 AND 10) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. calibration_records (gap tracking)
CREATE TABLE public.calibration_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES clarity_sessions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT CHECK (role IN ('listener', 'speaker')) NOT NULL,
  self_rating INT CHECK (self_rating BETWEEN 0 AND 100),
  actual_rating INT CHECK (actual_rating BETWEEN 0 AND 100),
  gap INT, -- actual - self
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
```

### Migration File
`supabase/migrations/YYYYMMDD_stories_points_calibration.sql`

---

## Phase 2: Data Layer + Types

### New Files

| File | Purpose |
|------|---------|
| `src/app/data/stories-api.ts` | CRUD for stories |
| `src/app/data/points-api.ts` | CRUD for points + positions |
| `src/app/data/calibration-api.ts` | Calibration queries |
| `src/app/types/stories.ts` | Story, Point, Position types |

### Key API Functions (TDD - tests first)

```typescript
// stories-api.ts
createStory(text, visibility, eventId?) → Story
getStoriesByAuthor(authorId) → Story[]
linkStoryToPoint(storyId, pointId) → void

// points-api.ts
createPoint(text) → Point
setPosition(pointId, position) → void
getPointsWithUserPositions(userId) → PointWithPosition[]
getPositionCounts(pointId) → { agree, disagree, unsure }

// calibration-api.ts
getUserCalibration(userId) → { listener, speaker, avgGap }
getCredibilityStats(userId) → { ear, mic }
```

### Test Files (Write First)
- `src/tests/data/stories-api.test.ts`
- `src/tests/data/points-api.test.ts`
- `src/tests/data/calibration-api.test.ts`

---

## Phase 3: Shared Components

### Migrate from Prototype

| Component | From | To | Tests |
|-----------|------|-----|-------|
| CalibrationDisplay | `prototypes/linkedin-like/components/shared/` | `src/app/components/calibration/` | `src/tests/components/calibration-display.test.tsx` |
| PositionButton | same | `src/app/components/shared/` | `src/tests/components/position-button.test.tsx` |
| PositionBadge | same | `src/app/components/shared/` | included above |
| UserCredibility | same | `src/app/components/shared/` | `src/tests/components/user-credibility.test.tsx` |

### New Components

| Component | Location | Tests |
|-----------|----------|-------|
| StoryCard | `src/app/components/content/story-card.tsx` | `src/tests/components/story-card.test.tsx` |
| PointCard | `src/app/components/content/point-card.tsx` | `src/tests/components/point-card.test.tsx` |
| ContentTabs | `src/app/components/profile/content-tabs.tsx` | `src/tests/components/content-tabs.test.tsx` |

---

## Phase 4: Profile Enhancement

### Modified Files

**`src/app/pages/profile-page.tsx`** - Add:
- CalibrationDisplay (inline, below profile card)
- ContentTabs (Stories | Points)
- Load stories/points via new APIs

**`src/app/components/profile/compact-profile-card.tsx`** - Add:
- Credibility stats (Ear/Mic icons)
- Calibration indicator

### Profile Structure (After)

```
ProfilePage
├── Back button
├── CompactProfileCard
│   ├── Avatar + pledge ring
│   ├── Name + Credibility (Ear count)
│   ├── Role
│   └── Pledge CTA
├── CalibrationDisplay (new)
├── ContentTabs (new)
│   ├── Stories tab → StoryCard[]
│   └── Points tab → PointCard[]
└── BrainDump composer (own profile only)
```

---

## Phase 5: Navigation Refactor

### Current Menu (Verified User)
- Dashboard
- View My Profile
- View My Pledge / Take the Pledge
- Co-create
- Settings
- Log Out

### New Menu (Verified User)
- Dashboard (`/home`)
- My Profile (`/me`) ← enhanced with Stories/Points
- Co-create ← Events move here
- Settings
- Log Out

**Note:** "View/Take Pledge" moves into Profile page (not separate menu item)

### Files to Modify
- `src/app/components/layout/navigation-menu-items.tsx`

---

## Phase 6: Integration + E2E

### New E2E Tests

| File | Scenarios |
|------|-----------|
| `e2e/stories-points.spec.ts` | Create story, take position, link story to point, profile tabs |
| `e2e/calibration.spec.ts` | Calibration displays, updates after sessions |
| `e2e/navigation.spec.ts` | New menu structure, route changes |

---

## Implementation Order

### Week 1: Foundation
1. Write schema tests → create migrations
2. Write API tests → implement data layer
3. Write CalibrationDisplay tests → implement component

### Week 2: Components
1. StoryCard/PointCard with tests
2. ContentTabs with tests
3. Profile integration

### Week 3: Polish
1. Navigation refactor
2. E2E tests
3. Bug fixes

---

## What to REUSE from Prototype

- **Types**: Position types, calibration state (adapt for DB)
- **UI patterns**: CalibrationDisplay, PositionButton visuals
- **Visual design**: Blue border for Stories, gray for Points

## What to REBUILD

- **Data layer**: All new (replace mock-data with Supabase)
- **StoryCard/PointCard**: Same look, real data
- **Profile tabs**: New integration

---

## Verification

After each phase:
1. Run unit tests: `npm test`
2. Run E2E tests: `npm run test:e2e`
3. Manual check: View profile, create story, take position
4. Pre-commit checks: `./scripts/pre-commit-checks.sh`

---

## Risk Mitigation

1. **Database**: Use test database only (per CLAUDE.md policy)
2. **Breaking changes**: Feature flag for new profile tabs if needed
3. **Performance**: Add pagination from start

---

## Critical Files Reference

| Purpose | File |
|---------|------|
| Prototype types | `src/app/prototypes/shared/types.ts` |
| Prototype CalibrationDisplay | `src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx` |
| Production profile | `src/app/pages/profile-page.tsx` |
| Production types | `src/app/types/index.ts` |
| Database schema | `supabase/schema.sql` |
| Navigation menu | `src/app/components/layout/navigation-menu-items.tsx` |
