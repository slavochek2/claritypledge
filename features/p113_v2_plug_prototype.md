# P113 v2: Plug Prototype Components into Production

## Background

P113 attempted to "merge" prototype UI patterns into production. It went wrong — partial implementation that doesn't match the prototype. This spec takes a different approach: **plug prototype components directly** into production routes.

## The Prototype IS the Spec

Target UI lives at: `/prototype/linkedin-like/`
- Profile: `/prototype/linkedin-like/profile`
- Events: `/prototype/linkedin-like/my-events`
- Navigation: `PrototypeHeader.tsx` shows icons WITH labels

Reference screenshots (Feb 02):
- `~/Screenshots/Screenshot at Feb 02 19-33-40.png` — Target profile UI
- `~/Screenshots/Screenshot at Feb 02 19-33-08.png` — Current production profile (wrong)
- `~/Screenshots/Screenshot at Feb 02 19-32-20.png` — Events page

## Current State (w2 branch)

| Component | Location | Status |
|-----------|----------|--------|
| Desktop Nav | `src/app/components/layout/simple-navigation.tsx` | Icons only, NO labels (wrong) |
| Bottom Nav | `src/app/components/layout/bottom-nav.tsx` | Works, but excluded from /live |
| Profile | `src/app/pages/profile-page.tsx` | Old UI, doesn't match prototype |
| Events | `src/app/prototypes/events/components/EventsList.tsx` | Uses real data (correct) |
| /home route | `src/App.tsx:312` | Still exists, should be removed |

## Tasks

### Task 1: Fix Desktop Nav Labels (~15 min)

**File:** `src/app/components/layout/simple-navigation.tsx`

**Current (lines 97-139):** Icons with tooltips only
```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Link to="/events">
        <CalendarIcon className="w-5 h-5" />
      </Link>
    </TooltipTrigger>
    <TooltipContent>My Events</TooltipContent>
  </Tooltip>
  ...
</TooltipProvider>
```

**Target (from `PrototypeHeader.tsx:81-98`):** Icons WITH labels underneath
```tsx
<Link to="/events" className="flex flex-col items-center justify-center px-4 py-2 min-w-[80px]">
  <CalendarIcon size={20} />
  <span className="text-xs mt-1 font-medium">My Events</span>
</Link>
```

**Changes needed:**
1. Remove TooltipProvider wrapper for nav items
2. Add `flex flex-col items-center` layout
3. Add `<span>` labels under each icon
4. Match items: My Events, Create (disabled), My Profile, Start Live button

### Task 2: Bottom Nav on /live (~5 min)

**File:** `src/app/layouts/clarity-landing-layout.tsx`

**Current (line 41):**
```tsx
{!isLiveMeetingPage && <BottomNav />}
```

**Change to:**
```tsx
<BottomNav />
```

Also remove `isLiveMeetingPage` check from `needsBottomPadding` (line 28).

### Task 3: Plug Prototype Profile (~1-2 hours)

**Goal:** Production `/p/:slug` should render prototype UI with real data.

**Source:** `src/app/prototypes/linkedin-like/components/Profile.tsx`

**Approach:**
1. Create `src/app/pages/profile-page-v2.tsx`
2. Copy structure from prototype Profile.tsx
3. Replace mock data sources:

| Prototype (mock) | Production (real) |
|------------------|-------------------|
| `currentUser` from `mock-data.ts` | `useAuth()` hook |
| `getUserById(id)` | `getProfileBySlug(slug)` from api.ts |
| `mockPoints`, `mockStories` | Keep mock for now (backend doesn't exist) |
| `getUserCalibration()` | Keep mock for now |

4. Keep these from prototype:
   - UI layout (card-based, centered)
   - Stories/Points tabs
   - StoryCard, PointCard components (copy to production)
   - CalibrationDisplay component (copy to production)
   - "Create Stories & Points" button (disabled with toast)

5. Update `App.tsx` route:
```tsx
// Change from:
<Route path="/p/:slug" element={<ProfilePage />} />
// To:
<Route path="/p/:slug" element={<ProfilePageV2 />} />
```

**Components to copy from prototype:**
- `src/app/prototypes/linkedin-like/components/StoryCard.tsx`
- `src/app/prototypes/linkedin-like/components/PointCard.tsx`
- `src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx`

**Copy to:** `src/app/components/profile/`

### Task 4: Remove /home Route (~2 min)

**File:** `src/App.tsx`

Delete lines 310-320:
```tsx
{/* P62: Dashboard for logged-in users */}
<Route
  path="/home"
  element={
    <ClarityLandingLayout>
      <LazyRoute>
        <HomePage />
      </LazyRoute>
    </ClarityLandingLayout>
  }
/>
```

Also remove the lazy import for HomePage (line 31).

## File Reference

### Prototype files (source of truth for UI):
- `src/app/prototypes/linkedin-like/components/Profile.tsx` — Target profile UI
- `src/app/prototypes/linkedin-like/components/PrototypeHeader.tsx` — Target nav with labels
- `src/app/prototypes/linkedin-like/components/BottomNav.tsx` — Bottom nav reference
- `src/app/prototypes/linkedin-like/components/StoryCard.tsx` — Story card component
- `src/app/prototypes/linkedin-like/components/PointCard.tsx` — Point card component
- `src/app/prototypes/linkedin-like/components/shared/CalibrationDisplay.tsx` — Calibration bars
- `src/app/prototypes/linkedin-like/data/mock-data.ts` — Mock data (keep using until backend)

### Production files to modify:
- `src/app/components/layout/simple-navigation.tsx` — Add labels to icons
- `src/app/layouts/clarity-landing-layout.tsx` — Show bottom nav on /live
- `src/App.tsx` — Update routes, remove /home
- `src/app/pages/profile-page-v2.tsx` — New file (create)

### Production files to keep unchanged:
- `src/app/prototypes/**/*` — Don't modify prototypes
- `src/auth/**/*` — Auth system
- `src/app/data/api.ts` — Real data layer
- `src/app/data/events-service.ts` — Real events service

## Execution Order

1. Task 1 (nav labels) — Quick visual win
2. Task 2 (bottom nav on /live) — Quick fix
3. Task 4 (remove /home) — Quick cleanup
4. Task 3 (profile) — Main work

## Definition of Done

- [ ] Desktop nav shows icons WITH text labels underneath (My Events, Create, My Profile)
- [ ] "Start Live" button visible in desktop nav
- [ ] Bottom nav appears on ALL mobile screens including /live
- [ ] Profile page matches prototype screenshot (cards, tabs, calibration)
- [ ] /home route removed
- [ ] All existing production functionality preserved (auth, real events, etc.)

## Notes

- Keep mock data for Stories/Points/Calibration — backend doesn't exist yet
- Design system tokens: prototype uses hardcoded colors (gray-500, etc.) — convert to tokens (text-muted-foreground, etc.) during copy
- Test on both desktop and mobile
