# P97: TDD Rebuild - LinkedIn-Like Prototype to Production

## Overview

Migrate prototype (~8,600 lines) UI to production.

**Scope:** Profile (Stories/Points/Calibration) + Events + Navigation

### Frontend Only — Mock Data

**P97 is frontend-only.** All data comes from mock files, not the database.

| What | P97 (this spec) | Backend phase (future) |
|------|-----------------|------------------------|
| Data source | `mock-stories.ts` | Supabase API |
| Persistence | None (state resets on refresh) | Real database |
| Focus | UI fidelity, responsive behavior, interactions | Schema, API, data flow |

**Why frontend first:**
- Validate UI with real users/devices before backend work
- Catch layout/responsive issues early
- Components are props-only — easy to swap mock → API later
- De-risks backend phase (UI already validated)

**Backend phase comes after P97 frontend is verified in production.**

### Reuse Existing Components

**Maximize reuse of production components.** Don't rebuild what already exists.

| Use From Production | Don't Rebuild |
|---------------------|---------------|
| `src/components/ui/*` (shadcn/ui) | Button, Dialog, Dropdown, Tooltip, etc. |
| `GravatarAvatar` | Avatar with pledge ring |
| `SimpleNavigation` | Navigation wrapper |
| Existing layout components | Header structure, page wrappers |
| Tailwind utilities | All styling |

**From prototype, take only:**
- Component logic/behavior patterns
- Responsive breakpoint decisions
- Interaction patterns (hover vs tap)
- Content structure (what goes where)

**Prototype components to extract (not copy wholesale):**
- `CalibrationDisplay` → new, uses existing Tooltip
- `PositionButtons` → new, uses existing Button/Dropdown
- `StoryCard`/`PointCard` → new, uses existing Avatar/Tooltip
- `BottomNav` → new, uses existing patterns

**Rule:** If a shadcn/ui or existing component can do it, use it. Only create new components for domain-specific UI (calibration bars, position buttons, story/point cards).

### TDD Methodology

**Every component follows Red-Green-Refactor:**

1. **Red:** Write a failing test that describes expected behavior (from prototype analysis)
2. **Green:** Write minimal code to make the test pass
3. **Refactor:** Clean up while keeping tests green

**Test-first order for each component:**
```
1. Write unit test (what it renders, props, interactions)
2. Run test → see it fail (red)
3. Create component file
4. Implement until test passes (green)
5. Refactor if needed (keep green)
6. Repeat for next behavior
```

**What tests verify (derived from prototype):**
- Renders expected elements (avatar, text, buttons)
- Responds to interactions (click, hover, tap)
- Desktop vs mobile behavior (breakpoint-dependent rendering)
- Tooltip content matches prototype
- Touch targets meet 44px minimum on mobile

**No implementation without a failing test first.**

### What We Take from Prototype

| Area | Take from Prototype | Notes |
|------|---------------------|-------|
| **Profile page** | Stories/Points tabs, CalibrationDisplay, credibility stats | Full rebuild with mock data — works for own profile AND viewing others |
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
- **Live sessions (`/live`)** — already in production, no changes needed
- Any other production pages not listed above

**If the prototype has changes to these areas, we ignore them.**

### Rebuild Means Full Fidelity

For in-scope areas, all hover states, tooltips, and interactive feedback from the prototype must be preserved:
- Hover tooltips explaining calibration metrics (Ear/Mic credibility)
- Hover states on cards (Stories, Points, Events)
- Tooltip explanations on position buttons (Likert scale meanings)
- Any contextual help/info icons with hover content

### Profile Works for Any User

Same route `/p/:slug` handles both own profile and viewing others. One `ProfilePage` component, `isOwnProfile` controls what's editable.

| Feature | Own Profile | Other's Profile |
|---------|-------------|-----------------|
| View Stories/Points tabs | ✅ | ✅ |
| View CalibrationDisplay | ✅ | ✅ |
| Take position on Points | ✅ | ✅ |
| Start Session on Stories | ✅ | ✅ |
| BrainDump composer | ✅ | ❌ |
| Edit profile info | ✅ | ❌ |

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

## Future: Backend (Separate Spec)

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

**This will be a separate feature spec after P97 frontend is complete.**

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

---

## Mobile Requirements (Prototype Analysis)

Extracted from `src/app/prototypes/linkedin-like/` on 2026-01-25.

### Responsive Breakpoint

**Single breakpoint:** `lg:` (1024px) — used consistently throughout prototype.

| Viewport | Classification | Key Behavior |
|----------|----------------|--------------|
| < 1024px | Mobile | Bottom nav, compact buttons, tap tooltips |
| ≥ 1024px | Desktop | Header nav, hover states, dropdown tooltips |

### Bottom Navigation

**File:** `PrototypeLayout.tsx:18-25`, `BottomNav.tsx`

| Property | Value | Notes |
|----------|-------|-------|
| Visibility | `lg:hidden` | Hidden on desktop |
| Position | `fixed bottom-0 left-0 right-0` | Fixed to bottom |
| Height | `h-14` (56px) | Nav bar height |
| Safe area | `pb-[env(safe-area-inset-bottom)]` | iOS notch/home indicator |
| Z-index | `z-50` | Above content |
| Background | `bg-white border-t border-gray-200` | With shadow |
| Items | 3 buttons: My Events, Start Session, My Profile | Equal width |

**Main content padding:** `pb-20` (80px) when bottom nav visible.

### Touch Targets

All interactive elements on mobile use minimum 44x44px:

```tsx
// Pattern from prototype
className="min-w-[44px] min-h-[44px] flex items-center justify-center"
```

| Element | Desktop | Mobile |
|---------|---------|--------|
| Position buttons | `sm:min-h-[44px]` | `min-h-[32px]` |
| Icon buttons | Standard | `min-w-[44px] min-h-[44px]` |
| Dropdown items | Standard | `min-h-[44px]` |
| Tooltip triggers | Standard | 44x44px touch area |

### Header Differences

**Desktop (PrototypeHeader.tsx:77-141):**
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] Clarity Pledge    [📅 My Events] [👤 My Profile]  [CTA] [▼] │
└─────────────────────────────────────────────────────────────┘
```
- Height: `h-20` (80px)
- Icon nav: `flex flex-col items-center px-4 py-2`
- CTA button visible in header

**Mobile (PrototypeHeader.tsx:143-184):**
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo]                                              [▼]     │
└─────────────────────────────────────────────────────────────┘
```
- Height: `h-16` (64px)
- Avatar dropdown only (nav moves to bottom)
- CTA moved inside avatar dropdown menu

### Tooltip Behavior

**File:** `MobileTooltip.tsx`, `CalibrationDisplay.tsx:15-74`

| Behavior | Desktop | Mobile |
|----------|---------|--------|
| Trigger | Hover | Tap/click |
| Show delay | 100-300ms | Immediate |
| Auto-dismiss | On mouse leave | After 2-3 seconds |
| Click lock | N/A | Prevents hover-close during auto-dismiss |

```tsx
// Click-lock pattern (MobileTooltip.tsx:35-51)
const handleClick = useCallback((e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setOpen(true);
  setClickLocked(true);
  timeoutRef.current = setTimeout(() => {
    setOpen(false);
    setClickLocked(false);
  }, AUTO_DISMISS_MS); // 2000-3000ms
}, []);
```

### Card Actions (Desktop vs Mobile)

**Desktop (StoryCard.tsx:105-127):**
- Hover-revealed: `sm:opacity-0 sm:group-hover:opacity-100`
- Share button + Open button inline

**Mobile (StoryCard.tsx:129-156):**
- Overflow menu: `<OverflowMenu items={[...]} />`
- Always visible (no hover state)
- 44px touch target

### Position Buttons

**File:** `PositionButton.tsx:184-269`

| Property | Desktop | Mobile |
|----------|---------|--------|
| Container | `sm:w-auto` | `w-full` (full width) |
| Button height | `sm:min-h-[44px]` | `min-h-[32px]` |
| Font size | `sm:text-xs` | `text-[11px]` |
| Dropdown | Visible on Agree/Disagree | Hidden in compact mode |
| Spacing | `sm:gap-1 sm:px-3` | `gap-0.5 px-1.5` |

### Content Layout

| Element | Value | Notes |
|---------|-------|-------|
| Max width | `max-w-lg` (512px) | Centered on all viewports |
| Side padding | `px-4` | 16px on both sides |
| Card spacing | `space-y-3` | 12px between cards |
| Profile top margin | `mt-3` | 12px below header |

---

## Desktop/Mobile Verification Checklist

Use this checklist when testing production against prototype.

### Breakpoints to Test

| Viewport | Width | Device Example |
|----------|-------|----------------|
| Mobile (small) | 375px | iPhone SE/13 mini |
| Mobile (large) | 428px | iPhone 14 Pro Max |
| Tablet | 768px | iPad Mini |
| Desktop (small) | 1024px | Breakpoint boundary |
| Desktop (large) | 1440px | MacBook Pro |

### Navigation Checklist

| Test | Desktop | Mobile | Pass? |
|------|---------|--------|-------|
| Header shows icon nav | ✓ | ✗ | |
| Header shows avatar dropdown | ✓ | ✓ | |
| Bottom nav visible | ✗ | ✓ | |
| Bottom nav has safe area padding | N/A | ✓ | |
| Active nav item highlighted (blue) | ✓ | ✓ | |
| CTA button in header | ✓ | ✗ (in dropdown) | |
| Logo visible | ✓ | ✓ | |

### Profile Page Checklist

| Test | Desktop | Mobile | Pass? |
|------|---------|--------|-------|
| Back button visible | ✓ | ✓ | |
| Profile card renders | ✓ | ✓ | |
| Calibration bar shows | ✓ | ✓ | |
| Calibration tooltips work | Hover | Tap | |
| Stories/Points tabs work | ✓ | ✓ | |
| Brain dump composer (own profile) | ✓ | ✓ | |
| Share button works | Hover | Overflow menu | |

### Card Behavior Checklist

| Test | Desktop | Mobile | Pass? |
|------|---------|--------|-------|
| StoryCard blue left border | ✓ | ✓ | |
| PointCard gray left border | ✓ | ✓ | |
| Action buttons visible | On hover | In overflow menu | |
| Position buttons work | ✓ | ✓ | |
| Position dropdown (intensity) | ✓ | Hidden (compact) | |
| Linked content expands | ✓ | ✓ | |
| "Start Session" CTA visible | ✓ | ✓ | |

### Touch Target Checklist (Mobile Only)

| Element | Min Size | Pass? |
|---------|----------|-------|
| Bottom nav buttons | 44x44px | |
| Avatar dropdown trigger | 44x44px | |
| Position buttons | 32px height | |
| Overflow menu button | 44x44px | |
| Overflow menu items | 44px height | |
| Tooltip triggers | 44x44px | |

### Tooltip Checklist

| Test | Desktop | Mobile | Pass? |
|------|---------|--------|-------|
| Calibration icons show tooltip | Hover | Tap | |
| Ear credibility shows tooltip | Hover | Tap | |
| Position buttons show tooltip | Hover | Tap | |
| Auto-dismiss after tap | N/A | 2-3s | |

---

## Architecture Improvements

Changes from prototype patterns for cleaner production code.

### 1. Extract QuotedCard Component

**Current (prototype):** `QuotedPoint` nested in StoryCard.tsx:269-367, `QuotedStory` nested in PointCard.tsx:233-335

**Proposed:** `src/app/components/content/quoted-card.tsx`

```tsx
// Single component handles both types
interface QuotedCardProps {
  type: 'story' | 'point';
  // ... shared props
}

export function QuotedCard({ type, ...props }: QuotedCardProps) {
  return type === 'story' ? <QuotedStory {...props} /> : <QuotedPoint {...props} />;
}
```

**Why:** Testable independently, reduces StoryCard/PointCard file size by ~200 lines each.

### 2. Extract usePositionCounts Hook

**Current (prototype):** Duplicated in StoryCard.tsx:292-327, PointCard.tsx:44-74, QuotedPoint

**Proposed:** `src/app/hooks/use-position-counts.ts`

```tsx
export function usePositionCounts(
  baseCounts: SevenPointCounts,
  initialPosition: PositionType | null,
  currentPosition: PositionType | null
): SevenPointCounts {
  return useMemo(() => {
    // Adjust counts based on position change
  }, [baseCounts, initialPosition, currentPosition]);
}
```

**Why:** Single source of truth, easier to test count adjustment logic.

### 3. Extract ResponsiveActions Component

**Current (prototype):** Duplicated pattern in StoryCard.tsx:105-157, PointCard.tsx:129-154

**Proposed:** `src/app/components/shared/responsive-actions.tsx`

```tsx
interface ResponsiveActionsProps {
  items: { icon: ReactNode; label: string; onClick: () => void }[];
}

export function ResponsiveActions({ items }: ResponsiveActionsProps) {
  return (
    <>
      {/* Desktop: hover-revealed buttons */}
      <div className="hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100">
        {items.map(item => <IconButton ... />)}
      </div>
      {/* Mobile: overflow menu */}
      <div className="sm:hidden">
        <OverflowMenu items={items} />
      </div>
    </>
  );
}
```

**Why:** Consistent desktop/mobile action pattern across all cards.

### 4. Unify Tooltip Components

**Current (prototype):** `MobileTooltip.tsx`, `CalibrationTooltip` in CalibrationDisplay.tsx

**Proposed:** Single `HybridTooltip` in `src/app/components/shared/hybrid-tooltip.tsx`

```tsx
interface HybridTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
  autoDismissMs?: number;
}
```

**Why:** One component for all tooltip use cases, configurable behavior.

---

## Prototype Component Inventory

Complete list of components in `src/app/prototypes/linkedin-like/` for migration reference.

### Layout (3 files)

| File | Lines | Migrate? | Notes |
|------|-------|----------|-------|
| `PrototypeLayout.tsx` | 29 | Pattern only | Main layout structure |
| `PrototypeHeader.tsx` | 190 | Pattern only | Desktop/mobile header |
| `BottomNav.tsx` | 77 | **Yes** | Mobile bottom nav |

### Pages (5 files)

| File | Lines | Migrate? | Notes |
|------|-------|----------|-------|
| `Profile.tsx` | 433 | Split | Too large, extract reusable parts |
| `MyEvents.tsx` | 145 | **No** | Events already in production |
| `StoryDetail.tsx` | 209 | Pattern | Detail page structure |
| `PointDetail.tsx` | 253 | Pattern | Detail page structure |
| `index.tsx` | 51 | **No** | Route config only |

### Content (3 files)

| File | Lines | Migrate? | Notes |
|------|-------|----------|-------|
| `StoryCard.tsx` | 368 | **Yes** | Extract QuotedPoint |
| `PointCard.tsx` | 336 | **Yes** | Extract QuotedStory |
| `IdeaCard.tsx` | — | **No** | Legacy, not in P97 scope |

### Shared (14 files)

| File | Lines | Migrate? | Notes |
|------|-------|----------|-------|
| `CalibrationDisplay.tsx` | 412 | **Yes** | InlineCalibration, CalibrationDisplay |
| `PositionButton.tsx` | 328 | **Yes** | PositionButtons, SevenPointCounts |
| `PositionBadge.tsx` | 97 | **Yes** | Position display badge |
| `MobileTooltip.tsx` | 89 | **Yes** | → HybridTooltip |
| `UserCredibility.tsx` | 38 | **Yes** | Ear count display |
| `PointHeader.tsx` | 61 | **Yes** | Header for Points |
| `VisibilityBadge.tsx` | 41 | **Yes** | Public/private indicator |
| `ShareDialog.tsx` | 217 | **Yes** | Share dialog + button |
| `OverflowMenu.tsx` | 54 | **Yes** | Mobile overflow menu |
| `FilterTabs.tsx` | — | **Yes** | Position filter tabs |
| `RatingDots.tsx` | — | Defer | For verification display (P98) |
| `VerifyButton.tsx` | — | Defer | For verification flow (P98) |
| `VerificationStatusDialog.tsx` | — | Defer | For verification (P98) |
| `VerificationStatusPanel.tsx` | — | Defer | For verification (P98) |

### Types (shared/types.ts)

| Type | Lines | Migrate? | Notes |
|------|-------|----------|-------|
| `PositionType` | 19-27 | **Yes** | 7-point Likert |
| `Position` | 28 | **Yes** | PositionType | null |
| `POSITION_VALUES` | 40-48 | **Yes** | Numeric mapping |
| `getPositionGroup()` | 54-67 | **Yes** | Button group helper |
| `Story` | 315-326 | **Yes** | Story interface |
| `Point` | 331-338 | **Yes** | Point interface |
| `UserCalibration` | 297-300 | **Yes** | Calibration metrics |
| `RoleCalibration` | 281-285 | **Yes** | Per-role metrics |
