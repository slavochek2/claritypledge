---
status: done
sort_order: 1000001
completed_at: '2026-02-04'
---
# P113: Promote LinkedIn Prototype to Production

## Summary

Promote prototype UI patterns to production while keeping mock data for stories/points until backend is ready.

**Key insight:** Production EventsList already matches prototype design. This is mostly about adding Stories/Points to profiles and improving navigation.

## Motivation

The prototype has better UI for:
- Navigation (icon nav for logged-in users, bottom nav for mobile)
- Profile (stories/points display, calibration)

Rebuilding from scratch failed (lost 1 day). Instead: adapt existing production code, add new elements.

---

## Guiding Principles

### P1: Merge, Don't Replace

Production has real data and working auth. Add prototype UI patterns to it.

| Keep From Production | Add From Prototype |
|---------------------|-------------------|
| Profile data (Supabase) | Stories/Points tabs |
| Auth (`useAuth()`) | Calibration display |
| Events service | Icon nav, bottom nav |
| Verification email flow | UI layout patterns |

### P2: Don't Break Production

These MUST keep working:
- `/live` — real live session
- Events backend — real Supabase data
- Auth system — `useAuth()`, sessions
- Profile data — real profiles

### P3: KISS Service Abstraction

Mock files only. Skip interface/switcher pattern until backend exists.

```
src/app/data/
├── stories-service-mock.ts     # mock stories
├── points-service-mock.ts      # mock points
└── calibration-service-mock.ts # mock calibration + threshold
```

### P4: Design System Tokens

Convert hardcoded colors during copy:
- `bg-white` → `bg-background`
- `text-gray-900` → `text-foreground`
- `text-gray-500` → `text-muted-foreground`
- `border-gray-200` → `border-border`

---

## Phase 1: Events Page (Minor Tweak)

### Goal

Update EventsList layout to match prototype (button positions).

### Changes to `EventsList.tsx`

Current layout:
```
[Events title]                    [Host Event button]
[Tabs: Upcoming | Past]
```

New layout:
```
[Events title]
[Tabs: Upcoming | Past]    [Co-create] [Host Event]
```

### What to Change

1. Move "Host Event" button below title, next to tabs
2. Add "Co-create" button (links to `/co-create`)
3. Stack buttons on mobile, inline on desktop

### Acceptance Criteria

- [ ] Tabs and action buttons on same row (desktop)
- [ ] Buttons stack below tabs (mobile)
- [ ] "Co-create" button links to `/co-create`
- [ ] Everything else unchanged (already uses real data)

---

## Phase 2: Navigation

### Goal

Add icon nav for logged-in desktop users + bottom nav for mobile.

### Desktop: Icon Nav

Merge INTO `simple-navigation.tsx` (don't replace):

**Logged-in users see:**
- My Events icon → `/events`
- My Profile icon → `/p/{slug}`
- Start a Clarity Session button
- Avatar menu (existing)

**Logged-out users see:**
- Text links (Events, Pledgers, Manifesto, About) — unchanged

### Mobile: Bottom Nav

Create `src/app/components/layout/bottom-nav.tsx`:

| Icon | Label | Route | Notes |
|------|-------|-------|-------|
| Calendar | Events | `/events` | |
| User | Profile | `/p/{slug}` | From auth |
| Sparkles | Create | — | Disabled, toast "Coming soon" |
| Video | Live | `/live` | Real /live |

**Only show when logged in.**

### Page Padding

Create layout wrapper for bottom nav padding:
```tsx
// Pages with bottom nav need pb-20 on mobile
<div className="pb-20 lg:pb-0">
  {children}
</div>
```

### Acceptance Criteria

- [ ] Desktop logged-in: icon nav visible
- [ ] Desktop logged-out: text links (unchanged)
- [ ] Mobile logged-in: bottom nav visible
- [ ] Mobile logged-out: no bottom nav (hamburger menu only)
- [ ] "Create" shows toast "Coming soon" on click
- [ ] Pages have bottom padding when nav present
- [ ] `/live` goes to real live session

---

## Phase 3: Profile with Stories/Points

### Goal

Add stories, points, and calibration to production profile page.

### Merge Strategy

**Keep from production `profile-page.tsx`:**
- Real profile data (`getProfileBySlug`)
- Owner detection (`session?.user?.id === profile.id`)
- Verification email flow
- Pledge status display

**Add from prototype:**
- New UI layout (centered, card-based)
- Stories/Points tabs
- StoryCard, PointCard components
- CalibrationDisplay
- Mock data via service files

### Service Files (KISS)

```typescript
// stories-service-mock.ts
export const storiesService = {
  getStoriesForUser: (userId: string) => mockStories.filter(s => s.authorId === userId)
};

// points-service-mock.ts
export const pointsService = {
  getPointsForUser: (userId: string) => mockPoints.filter(p => p.positions[userId] != null)
};

// calibration-service-mock.ts
export const calibrationService = {
  getCalibration: (userId: string) => {
    const sessions = getSessionCount(userId);
    if (sessions < 5) return { status: 'insufficient_data', sessionsNeeded: 5 - sessions };
    return mockCalibration[userId];
  }
};
```

### Calibration States

| Sessions | Display |
|----------|---------|
| < 5 | "Complete 5 sessions to see your calibration" |
| ≥ 5 | Calibration bars (listener/speaker) |

### Owner vs Visitor View

| Element | Owner | Visitor |
|---------|-------|---------|
| Profile header | Edit button | — |
| Stories tab | Their stories | Their stories |
| Points tab | Their points | Their points |
| Calibration | Full display | Full display |
| Create button | Disabled + toast | Hidden |

### Create Button UX

- **Desktop:** Disabled button, tooltip "Coming soon" on hover
- **Mobile:** Disabled button, toast "Coming soon" on tap
- **Visitor view:** Button hidden entirely

### Empty States

- **No stories:** "No stories shared yet" + (owner only) "Share your first story" disabled button
- **No points:** "No positions taken yet"
- **Insufficient calibration:** "Complete 5 sessions to see your calibration"

### Acceptance Criteria

- [ ] Profile shows real user data (name, avatar, role, pledge)
- [ ] Stories tab shows mock stories (or empty state)
- [ ] Points tab shows mock points (or empty state)
- [ ] Calibration shows mock data OR "insufficient data" message
- [ ] Owner sees disabled "Create" with toast
- [ ] Visitor sees profile without create button
- [ ] Share button generates correct `/p/{slug}` URL
- [ ] All production functionality preserved (verification email, etc.)

---

## Technical Notes

### Files to Modify

| File | Changes |
|------|---------|
| `EventsList.tsx` | Button layout only |
| `simple-navigation.tsx` | Add icon nav for logged-in |
| `profile-page.tsx` | Add stories/points/calibration UI |

### Files to Create

| File | Purpose |
|------|---------|
| `bottom-nav.tsx` | Mobile bottom navigation |
| `stories-service-mock.ts` | Mock stories data |
| `points-service-mock.ts` | Mock points data |
| `calibration-service-mock.ts` | Mock calibration + threshold |

### Files NOT to Touch

- `src/app/prototypes/**/*` — keep intact for continued development
- `live-meeting-page.tsx` — real /live stays unchanged
- Auth system files

---

## Future Phases (Not P113)

Per roadmap, after P113:
1. Disable Points tab (Stories-only backend first)
2. Build Stories backend
3. Re-enable Points when Sifter returns
4. Build Points backend

---

## Definition of Done

- [ ] Events page has updated button layout
- [ ] Desktop nav has icons for logged-in users
- [ ] Mobile has bottom nav for logged-in users
- [ ] Profile shows stories/points/calibration (mock data)
- [ ] Calibration shows "insufficient data" when < 5 sessions
- [ ] Create buttons disabled with "Coming soon" toast
- [ ] All production routes work correctly
- [ ] Design system tokens used (no hardcoded colors)
