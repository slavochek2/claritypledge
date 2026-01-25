# P97: TDD Rebuild - LinkedIn-Like Prototype to Production

## Overview

Migrate prototype (~8,600 lines) UI to production. Frontend first, verify, then backend later.

**Scope:** Profile (Stories/Points/Calibration) + Events + Navigation

### What We Take from Prototype

| Area | Take from Prototype | Notes |
|------|---------------------|-------|
| **Profile page** | Stories/Points tabs, CalibrationDisplay, credibility stats | Full rebuild with mock data |
| **Navigation/Menu** | **Concept only** (menu items, routes) — not component architecture | Flexible on implementation |
| **Events** | **Minor changes only:** move "Host Event" button, add "Co-create" button | Events already in production — no rebuild |

### Navigation Design (Decided)

| User State | Nav Pattern |
|------------|-------------|
| **Non-logged-in** | Keep current header (Events, Pledgers, Manifesto, About) |
| **Logged-in (Desktop)** | Icon nav (My Events, My Profile) + avatar dropdown |
| **Logged-in (Mobile)** | Bottom tab bar (My Events, My Profile) + avatar dropdown |

Secondary links (Pledgers, Manifesto, About) move to Settings > "About Clarity Pledge" for logged-in users.

### What Stays the Same (NOT in scope)

- Landing page
- About page
- Settings page
- Pledge flow
- Auth flow
- Any other production pages not listed above

**If the prototype has changes to these areas, we ignore them.**

### Rebuild Means Full Fidelity

For in-scope areas, all hover states, tooltips, and interactive feedback from the prototype must be preserved:
- Hover tooltips explaining calibration metrics (Ear/Mic credibility)
- Hover states on cards (Stories, Points, Events)
- Tooltip explanations on position buttons (Likert scale meanings)
- Any contextual help/info icons with hover content

## Current State

| Area | Production | Prototype | Gap |
|------|------------|-----------|-----|
| **Profile** | Simple card + pledge CTA | Stories/Points tabs, calibration, credibility | Major |
| **Events** | Already implemented | Just button placement changes | Minor (button moves only) |
| **Navigation** | Current menu structure | New menu items, routes | Moderate |
| **Tests** | Some unit + E2E | None | All new |

---

## Design Decisions

Resolved questions before implementation. Sources: [decisions.md](../docs/decisions.md), [definitions.md](../docs/definitions.md), architecture analysis.

| Question | Decision | Source |
|----------|----------|--------|
| **Stories/Points relationship** | Many-to-many (N:N with junction table) | decisions.md 2026-01-22 |
| **Position persistence** | Optimistic UI — immediate persist, rollback on error with toast | Architecture review |
| **Calibration calculation** | On-demand query for MVP (no caching) — optimize later if needed | Architecture review |
| **Verification display** | Show all verifications, visually distinguish ≥8/10 (green) vs <8/10 (amber/gray) | definitions.md |
| **Profile structure** | Split by concern, not own/others — `ProfilePage` orchestrates reusable child components | Architecture review |
| **Brain Dump composer** | Stub for P97 — full Sifter flow (P58) comes later | decisions.md 2026-01-23 |
| **Events integration** | Include visibility + eventId in Stories schema | definitions.md |
| **Navigation (logged-in)** | Icon nav (My Events, My Profile) + bottom tab on mobile + avatar dropdown (Settings, Log Out) | P97 planning |
| **Navigation (non-logged-in)** | Keep current header (Events, Pledgers, Manifesto, About) | P97 planning |
| **Secondary links (logged-in)** | Pledgers, Manifesto, About → Settings page under "About Clarity Pledge" | P97 planning |

---

## Architecture Guidelines

### Component Structure

```
src/app/components/
├── calibration/
│   ├── calibration-display.tsx      # Full card with listener/speaker bars
│   └── inline-calibration.tsx       # Compact version for profile header
│
├── content/
│   ├── story-card.tsx               # Story with author, blue border
│   ├── point-card.tsx               # Point with position buttons, gray border
│   └── quoted-card.tsx              # Embedded preview (shared by both)
│
├── position/
│   ├── position-buttons.tsx         # 3-button + dropdown UI
│   └── position-badge.tsx           # Small badge showing position
│
├── profile/
│   ├── compact-profile-card.tsx     # Existing - add credibility stats
│   ├── content-tabs.tsx             # Stories/Points tab switcher
│   └── credibility-stats.tsx        # Ear/Mic counts with tooltips
│
└── shared/
    └── hybrid-tooltip.tsx           # Click+hover tooltip (mobile-friendly)
```

### Type Organization

```typescript
// src/app/types/stories.ts

// Position scale
export type PositionType =
  | 'strongly_disagree' | 'disagree' | 'somewhat_disagree'
  | 'unsure'
  | 'somewhat_agree' | 'agree' | 'strongly_agree';

export const POSITION_VALUES: Record<PositionType, number> = {
  strongly_disagree: -3, disagree: -2, somewhat_disagree: -1,
  unsure: 0,
  somewhat_agree: 1, agree: 2, strongly_agree: 3,
};

// Story - lived experience (author-owned)
export interface Story {
  id: string;
  authorId: string;
  text: string;
  visibility: 'public' | 'shared' | 'private';
  eventId?: string;
  createdAt: string;
  verificationCount: number;
}

// Point - debatable claim (no owner)
export interface Point {
  id: string;
  text: string;
  createdAt: string;
}

// Position - user's stance on a Point
export interface Position {
  pointId: string;
  userId: string;
  position: PositionType;
  createdAt: string;
}

// Calibration - user's gap between self-assessment and reality
export interface UserCalibration {
  listener: { avgGap: number; sessionCount: number };
  speaker: { avgGap: number; sessionCount: number };
}
```

### State Management (Frontend Phase)

1. **Mock Data:** Components receive data as props from `mock-stories.ts`
   - Page-level components import mock data
   - Child components are pure (props only)
   - Easy to swap mock for real API later

2. **Position State:** Local state for now
   - `useState` in parent component
   - Updates UI immediately on click
   - Will connect to API when backend exists

3. **Calibration State:** Static mock data
   - Passed as props to CalibrationDisplay
   - Will connect to API when backend exists

### Patterns to Follow

1. **Component Props:** Data passed in, not fetched inside
   ```typescript
   // GOOD - component receives data
   function StoryCard({ story, author, onPositionChange }: StoryCardProps) { ... }

   // BAD - component fetches its own data
   function StoryCard({ storyId }: { storyId: string }) {
     const story = getStoryById(storyId); // NO
   }
   ```

2. **Mock Data at Page Level:** Page imports mock, passes to children
   ```typescript
   // profile-page.tsx
   import { mockStories, mockPoints, mockCalibration } from '@/app/data/mock-stories';

   function ProfilePage({ userId }: Props) {
     const stories = mockStories.filter(s => s.authorId === userId);
     return <ContentTabs stories={stories} points={mockPoints} />;
   }
   ```

3. **Tooltips:** Use `HybridTooltip` for all hover/click tooltips (mobile-friendly)
   ```typescript
   <HybridTooltip content="Explanation text">
     <InfoIcon />
   </HybridTooltip>
   ```

4. **Profile Page:** Split by concern, `isOwnProfile` controls conditional rendering
   ```typescript
   function ProfilePage({ userId }: Props) {
     const isOwnProfile = currentUser?.id === userId;
     return (
       <>
         <ProfileHeader user={user} />
         <CalibrationDisplay calibration={calibration} />
         <ContentTabs stories={stories} points={points} />
         {isOwnProfile && <BrainDumpComposer />}  {/* Stub for P97 */}
       </>
     );
   }
   ```

### Patterns to Avoid

1. **No Inline Nested Components:**
   - Extract `QuotedPoint` and `QuotedStory` to shared `quoted-card.tsx`
   - Each component gets its own file

2. **No Mock Data Imports in Components:**
   - Pass all data as props
   - Data fetching happens at page level only

3. **No Duplicated Logic:**
   - Position count adjustment → shared hook `usePositionCounts()`
   - Calibration label calculation → shared utility

4. **No Over-Conditional Components:**
   - If `isOwnProfile` changes >30% of the render, consider splitting
   - But for P97, one `ProfilePage` with conditional children is fine

### Prototype Findings (What to Fix)

| Issue | Location | Fix |
|-------|----------|-----|
| Profile.tsx too large (420 lines) | `prototypes/.../Profile.tsx` | Split into ProfilePage + child components |
| Duplicated position count logic | StoryCard + PointCard | Extract to `usePositionCounts()` hook |
| Mock data imports in components | StoryCard imports 6 functions | Pass data as props |
| Nested QuotedPoint/QuotedStory | Inside StoryCard/PointCard | Extract to `quoted-card.tsx` |
| Inconsistent tooltip patterns | Multiple tooltip components | Single `HybridTooltip` |

---

## Phase 1: Types + Shared Components

### Types First

Create `src/app/types/stories.ts` with types from Architecture Guidelines section above.

Also create `src/app/data/mock-stories.ts` for mock data (used until backend exists).

### Shared Components (Migrate from Prototype)

| Component | From | To | Tests |
|-----------|------|-----|-------|
| CalibrationDisplay | `prototypes/linkedin-like/components/shared/` | `src/app/components/calibration/` | `src/tests/components/calibration-display.test.tsx` |
| PositionButton | same | `src/app/components/position/` | `src/tests/components/position-button.test.tsx` |
| PositionBadge | same | `src/app/components/position/` | included above |
| UserCredibility | same | `src/app/components/shared/` | `src/tests/components/user-credibility.test.tsx` |
| HybridTooltip | new | `src/app/components/shared/` | `src/tests/components/hybrid-tooltip.test.tsx` |

---

## Phase 2: Content Components

### Cards (Rebuild from Prototype)

| Component | Location | Tests |
|-----------|----------|-------|
| StoryCard | `src/app/components/content/story-card.tsx` | `src/tests/components/story-card.test.tsx` |
| PointCard | `src/app/components/content/point-card.tsx` | `src/tests/components/point-card.test.tsx` |
| QuotedCard | `src/app/components/content/quoted-card.tsx` | `src/tests/components/quoted-card.test.tsx` |
| ContentTabs | `src/app/components/profile/content-tabs.tsx` | `src/tests/components/content-tabs.test.tsx` |

**Note:** Components receive mock data as props. No API calls inside components.

---

## Phase 3: Profile Enhancement

### Modified Files

**`src/app/pages/profile-page.tsx`** - Add:
- CalibrationDisplay (inline, below profile card)
- ContentTabs (Stories | Points)
- Load from mock data (swap to API later)

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
└── BrainDump composer (own profile only, stub)
```

---

## Phase 4: Navigation + Events Buttons

### Navigation Design (Finalized)

**Non-logged-in (Desktop + Mobile):** Keep current — optimized for discovery
```
┌─────────────────────────────────────────────────┐
│ Logo   Events  Pledgers  Manifesto  About  [CTA]│
└─────────────────────────────────────────────────┘
```

**Logged-in (Desktop):** Icon nav — optimized for action
```
┌─────────────────────────────────────────────────┐
│ Logo   📅 My Events   👤 My Profile   [CTA] [▼] │
└─────────────────────────────────────────────────┘
                                        ↓ dropdown
                                  ┌───────────┐
                                  │ Settings  │
                                  │ Log Out   │
                                  └───────────┘
```

**Logged-in (Mobile):** Bottom tab bar
```
┌─────────────────────────────────────────────────┐
│ Logo                              [CTA]    [▼]  │
├─────────────────────────────────────────────────┤
│                  (content)                      │
├─────────────────────────────────────────────────┤
│          📅 My Events    👤 My Profile          │
└─────────────────────────────────────────────────┘
```

### Where Items Move

| Item | Current Location | New Location |
|------|------------------|--------------|
| Dashboard | Dropdown menu | Removed (My Events is the home) |
| View My Profile | Dropdown menu | Icon nav |
| View/Take Pledge | Dropdown menu | Profile page section |
| Co-create | Dropdown menu | Button on My Events page |
| Pledgers, Manifesto, About | Header (all users) | Settings > "About Clarity Pledge" (logged-in) |
| Settings | Dropdown menu | Avatar dropdown |
| Log Out | Dropdown menu | Avatar dropdown |

### Events Button Changes (Minor)

| Change | Details |
|--------|---------|
| "Host Event" button | Keep on My Events page |
| "Co-create" button | Add to My Events page |

**Events functionality stays the same** — just button additions.

### Settings Page Addition

Add "About Clarity Pledge" section:
```
Settings
├── Account
├── Notifications
└── About Clarity Pledge
    ├── Pledgers
    ├── Manifesto
    └── About
```

### Files to Modify
- `src/app/components/layout/navigation-menu-items.tsx`
- `src/app/components/layout/` (new mobile bottom nav component)
- `src/app/pages/settings-page.tsx` (add About section)
- My Events page (add Co-create button)

---

## Phase 5: Tests + Verification

### Unit Tests

| Component | Test File |
|-----------|-----------|
| CalibrationDisplay | `src/tests/components/calibration-display.test.tsx` |
| PositionButton | `src/tests/components/position-button.test.tsx` |
| StoryCard | `src/tests/components/story-card.test.tsx` |
| PointCard | `src/tests/components/point-card.test.tsx` |
| ContentTabs | `src/tests/components/content-tabs.test.tsx` |

### E2E Tests (with mock data)

| File | Scenarios |
|------|-----------|
| `e2e/profile-tabs.spec.ts` | Profile shows Stories/Points tabs, switching works |
| `e2e/calibration-display.spec.ts` | Calibration renders correctly, tooltips work |
| `e2e/navigation.spec.ts` | New menu structure, route changes |

---

## Implementation Order

### Week 1: Foundation
1. Types (`stories.ts`) + mock data
2. Shared components (CalibrationDisplay, PositionButton, HybridTooltip)
3. Unit tests for shared components

### Week 2: Content + Profile
1. Content components (StoryCard, PointCard, QuotedCard, ContentTabs)
2. Profile page integration
3. Unit tests for content components

### Week 3: Navigation + Polish
1. UX subagent analysis (logged-in vs non-logged-in nav)
2. Navigation refactor (desktop + mobile)
3. E2E tests
4. Bug fixes

---

## Deployment Strategy

**P97 ships to production with mock data.**

| Phase | Environment | Data Source |
|-------|-------------|-------------|
| P97 (this spec) | Production | Mock data (`mock-stories.ts`) |
| P98 (backend) | Production | Real database |

**Why mock data in production?**
- Verify UX changes with real users/devices
- Catch layout/responsive issues before backend work
- Components are props-only — easy to swap data source later
- De-risks backend phase (UI already validated)

**User experience during P97:**
- Profile shows sample Stories/Points (clearly labeled as examples, or use current user's placeholder content)
- Calibration displays sample data
- All interactions work, just don't persist

---

## Future: Backend (Separate Spec — P98)

Once frontend is verified in production, create separate spec for backend:

### Database Tables Needed

1. **stories** - lived experiences (author_id, text, visibility, event_id)
2. **points** - debatable claims (text, created_by)
3. **positions** - user stance on points, 7-point Likert scale
4. **story_point_links** - bidirectional linking
5. **story_verifications** - who understood whose story
6. **calibration_records** - gap tracking per session

### API Functions Needed

```typescript
// stories-api.ts
createStory(text, visibility, eventId?) → Story
getStoriesByAuthor(authorId) → Story[]
linkStoryToPoint(storyId, pointId) → void

// points-api.ts
createPoint(text) → Point
setPosition(pointId, position) → void
getPointsWithUserPositions(userId) → PointWithPosition[]

// calibration-api.ts
getUserCalibration(userId) → { listener, speaker, avgGap }
```

**This will be a separate feature spec (P98 or similar) after P97 frontend is complete.**

---

## What to REUSE from Prototype

- **Types**: Position types, calibration state
- **UI patterns**: CalibrationDisplay, PositionButton visuals
- **Visual design**: Blue border for Stories, gray for Points
- **Interaction patterns**: Hover states, tooltips, mobile-friendly click

## What to REBUILD (cleaner architecture)

- **StoryCard/PointCard**: Same look, but no mock data imports — props only
- **QuotedCard**: Extract from nested components
- **HybridTooltip**: Unify tooltip patterns
- **Profile page**: Split by concern, not monolithic

## What to DEFER (backend — separate spec)

- Database schema + migrations
- API layer (stories-api, points-api, calibration-api)
- Real data fetching

---

## Verification

After each phase:
1. Run unit tests: `npm test`
2. Run E2E tests: `npm run test:e2e`
3. Manual check: View profile, switch tabs, hover tooltips
4. Pre-commit checks: `./scripts/pre-commit-checks.sh`

---

## Risk Mitigation

1. **Mock data isolation**: Keep mock data in `src/app/data/mock-stories.ts`, easy to swap for real API later
2. **Breaking changes**: Feature flag for new profile if needed
3. **Component boundaries**: Props-only components are easy to test and swap data sources

---

## Critical Files Reference

### Prototype (source for migration)

| Purpose | File | Notes |
|---------|------|-------|
| Position types + helpers | `src/app/prototypes/shared/types.ts` | `POSITION_VALUES`, `getPositionGroup()` |
| CalibrationDisplay | `src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx` | `InlineCalibration`, `CalibrationTooltip` |
| PositionButton | `src/app/prototypes/linkedin-like/components/shared/PositionButton.tsx` | 3-button + dropdown pattern |
| StoryCard | `src/app/prototypes/linkedin-like/components/StoryCard.tsx` | Extract QuotedPoint, remove mock imports |
| PointCard | `src/app/prototypes/linkedin-like/components/PointCard.tsx` | Extract QuotedStory, remove mock imports |
| Profile | `src/app/prototypes/linkedin-like/components/Profile.tsx` | Reference only — too large, will split |
| Route config | `src/app/prototypes/linkedin-like/config.ts` | Good pattern: `routes.story(id)` |

### Production (targets)

| Purpose | File |
|---------|------|
| Profile page | `src/app/pages/profile-page.tsx` |
| Types | `src/app/types/stories.ts` (new) |
| Mock data | `src/app/data/mock-stories.ts` (new, temporary) |
| Calibration components | `src/app/components/calibration/` (new) |
| Position components | `src/app/components/position/` (new) |
| Content components | `src/app/components/content/` (new) |
| Navigation | `src/app/components/layout/navigation-menu-items.tsx` |

### Decision Sources

| Doc | Relevant Decisions |
|-----|-------------------|
| [decisions.md](../docs/decisions.md) | Story-Point N:N, calibration display, story visibility |
| [definitions.md](../docs/definitions.md) | Position scale, verification threshold, visibility model |
