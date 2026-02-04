---
status: done
reviews:
  ux: passed
  architect: passed
  alignment: passed
---

# P115: Navigation & Data Source Fixes

## Problem Statement

After P114 implementation, several UX issues remain:

1. **Events page shows mock data** — `/events/list` displays fake events (Clarity Coffee, Clarity Hike) instead of real database events
2. **Logged-in users lose navigation** — Public links (Pledgers, Manifesto, About) disappear when logged in
3. ~~**`/live` page missing nav items**~~ — **By design:** Live session is a focused mode. `SimpleNavigation` is intentionally skipped; `LiveSessionBanner` provides session controls. Fix 2 will improve the dropdown inside `LiveSessionBanner` automatically.
4. **Profile page missing features** — Real profile (`/p/:id`) lacks functionality from prototype (deferred to P116)

## Root Causes

### 1. Events Mock Data
- `src/app/data/events-service.ts` has a feature flag: `VITE_USE_REAL_EVENTS_API`
- Flag is **not set** in `.env.local`, so defaults to mock service
- Mock data should ONLY appear in `/prototype/linkedin-like/my-events`

### 2. Navigation State Gap
Current navigation logic (P114):
- **Logged-out:** Text links (Events, Pledgers, Manifesto, About) + hamburger dropdown
- **Logged-in:** Icon nav (My Events, Create, My Profile) + avatar dropdown with ONLY Settings/Log Out

The dropdown for logged-in users removed all public navigation links.

### 3. Profile Feature Gap
| Feature | Prototype | Real Profile |
|---------|-----------|--------------|
| Story expansion (shows related points) | ✅ `StoryCard.tsx` | ❌ `StoryCardSimple` |
| Point expansion (shows related stories) | ✅ `PointCard.tsx` | ❌ `PointCardSimple` |
| Voting buttons (Disagree/Unsure/Agree) | ✅ `PositionButton.tsx` | ❌ Just displays counts |

## Proposed Solutions

### Fix 1: Enable Real Events API
**What:** Add `VITE_USE_REAL_EVENTS_API=true` to `.env.local`

**Why:** Events page should show real database events, not mock data.

**Risk:** Low — just a config change, real service already exists and works.

### Fix 2: Sandwich Navigation Pattern
**What:** Add public navigation links to logged-in user dropdown, above Settings/Log Out.

**New dropdown structure:**
```
┌─────────────────┐
│ Pledgers        │  ← Public navigation
│ Manifesto       │     (site discovery)
│ About           │
├─────────────────┤  ← Visual separator
│ Settings        │  ← Account actions
│ Log Out         │
└─────────────────┘
```

**Note:** Co-create removed from logged-in menu (accessible via My Events page).

**Why:**
- Users shouldn't lose access to public pages when logged in
- Top section = "Where can I go?" (site navigation)
- Bottom section = "What about my account?" (clearly separated)
- Scannable with visual separator

**Files to modify:**
- `src/app/components/layout/navigation-menu-items.tsx`

### Fix 3: ~~Consistent Navigation Across Pages~~ (Not Needed)

**Investigation result:** `/live` page navigation is intentional design, not a bug.

- `clarity-landing-layout.tsx` sets `hasOwnNavigation = true` for `/live`
- `SimpleNavigation` is skipped; `LiveSessionBanner` provides session controls
- `BottomNav` still renders on mobile
- The dropdown inside `LiveSessionBanner` uses `NavigationMenuItems`, so Fix 2 automatically improves it

**No separate work needed** — Fix 2 handles this.

### Fix 4: Profile Feature Migration (Future)
**What:** Bring prototype components to real profile page.

**Scope:** This is larger work — document here but implement separately.

**Options:**
1. Copy components from `src/app/prototypes/linkedin-like/components/` to `src/app/components/`
2. Import prototype components directly into real profile
3. Rewrite `StoryCardSimple`/`PointCardSimple` with full features

**Decision:** Defer to P116 — focus P115 on navigation/data fixes only.

## Implementation Plan

### Phase 1: Config Fix (5 min)
1. Add `VITE_USE_REAL_EVENTS_API=true` to `.env.local`
2. Restart dev server
3. Verify `/events/list` shows real events (or empty state if no events in DB)

### Phase 2: Navigation Fix (30 min)
1. Modify `navigation-menu-items.tsx`:
   - Add public links (Pledgers, Manifesto, About, Co-create) for logged-in users
   - Add separator between public links and account actions
   - Keep Settings and Log Out at bottom
2. Update both `dropdown` and `mobile` variants
3. Test navigation on desktop and mobile

### Phase 3: Verification
1. Test logged-in navigation on multiple pages:
   - `/events/list`
   - `/live`
   - `/p/:slug` (profile)
   - `/home`
2. Verify public links work and lead to correct pages
3. Verify Settings and Log Out still work

## Out of Scope (Deferred)

- Profile feature migration (StoryCard, PointCard, voting) → P116
- `/home` redirect to profile vs dashboard decision → separate discussion
- Bottom nav mobile implementation review → check if working correctly

## Success Criteria

- [x] `/events/list` shows real events from database (or empty state)
- [x] Logged-in users can access Pledgers, Manifesto, About, Co-create from dropdown
- [x] Navigation is consistent across all pages
- [x] Visual separator clearly distinguishes site nav from account actions
- [x] Mobile menu has same structure as desktop dropdown

## Test Plan

1. **Events data:** Navigate to `/events/list` — should NOT show "Clarity Coffee" or other mock events
2. **Desktop nav:** Log in → click avatar → verify dropdown has Pledgers, Manifesto, About, Co-create above separator, Settings/Log Out below
3. **Mobile nav:** Log in → open hamburger → verify same structure
4. **Cross-page:** Check nav consistency on `/live`, `/events`, `/home`, `/p/:slug`

---

## Prep Notes

**Reviewed via `/prep-spec`**

### Blockers Resolved
- ✅ Empty state for events — already exists in `EventsList.tsx:126-147`
- ✅ `/live` navigation investigation — by design (focused mode)

### Suggestions to Consider
- **Mobile navigation redundancy:** Logged-in users will have Events in BOTH bottom nav AND hamburger dropdown. Document this tension or resolve in follow-up.
- **Update tests:** Check `navigation-acceptance-full.test.tsx` after navigation changes

### Execution Notes
- Similar to: P114 (this is P114 cleanup)
- MCP opportunities: Chrome DevTools for visual verification of 4 navigation states (logged-in/out × desktop/mobile)
- Patterns to reuse: Existing `NavigationMenuItems` variants, `DropdownMenuSeparator`
