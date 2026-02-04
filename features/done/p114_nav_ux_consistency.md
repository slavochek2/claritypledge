---
status: done
sort_order: 1000005
completed_at: '2026-02-04'
---
# P114: Navigation & UX Consistency Fixes

---
status: implemented
prepped_date: 2026-02-03
implemented_date: 2026-02-04
reviews:
  ux: passed
  architect: passed-with-notes
  lean_coach: passed
  alignment: passed
decisions:
  button_text: "Start Clarity Session"
  button_icon: none (removed)
  back_fallback: /events
  logged_out_cta: goes to /live (existing redirect handles auth)
---

## Background

P113_v2 plugged prototype components into production but left inconsistencies:
- Menu has redundant/broken items
- Back buttons inconsistent across pages
- Profile missing prototype features (calibration, tabs, cards)
- Mobile bottom nav missing
- Button text inconsistent

This spec fixes all identified issues for a consistent, minimal UX.

## Principle

**Navigation should be predictable.** Same items, same behavior, everywhere.

---

## Prep-Spec Findings

### Key Technical Finding (Architect)

**The root cause is `/home`, not `/dashboard`:**
- Menu links point to `/home` which doesn't exist in App.tsx
- React Router falls through to blank page
- Spec originally misdiagnosed as "dashboard route broken"
- Fix: Remove menu items that link to `/home` (Issues 2, 3)

### Decisions Made

| Question | Decision | Rationale |
|----------|----------|-----------|
| Button text | "Start Clarity Session" | Clearer than "Start Live" |
| Button icon | Remove VideoIcon | Consistency over visual interest |
| Back button fallback | `/events` | When no history, go to events hub |
| Logged-out CTA | Goes to `/live` | Existing redirect handles auth → signup |

### Out of Scope

**Prototype banner (original Issue 9)** — Accept risk:
- Low traffic to prototype URLs
- Not worth adding code for edge case
- No action needed

### UX Notes for Profile Features

From UX review — define these before implementing Issue 8:
- **Empty state:** What do users with 0 stories/0 points see? Show CTA "Create your first story"
- **Mock data:** Use mock data since backend doesn't exist yet
- **Card destinations:** Story/Point cards can show toast "Coming soon" when clicked

---

## Issues & Solutions

### ISSUE 1: Menu Links to Non-existent `/home` Route

| | |
|---|---|
| **Root cause** | Menu "Dashboard" links to `/home`, which doesn't exist |
| **Symptom** | Blank white page when clicking Dashboard |
| **User impact** | Broken page = lost trust |

**Solution:** Remove the broken menu items (handled by Issues 2, 3).

---

### ISSUE 2: Remove "Dashboard" from Menu

| | |
|---|---|
| **Reproduce** | Log in → Click avatar menu → Click "Dashboard" |
| **Current** | Goes to `/home` which shows blank page |
| **Expected** | "Dashboard" should not be in menu |

**Solution:**
- File: `src/app/components/layout/navigation-menu-items.tsx`
- Action: Remove Dashboard link from both mobile (lines 116-125) and dropdown (lines 228-234) variants

---

### ISSUE 3: Simplify Menu to Settings + Log Out

| | |
|---|---|
| **Reproduce** | Log in → Click avatar menu |
| **Current menu** | Dashboard, View My Profile, View My Pledge, Co-create, Settings, Log Out |
| **Expected menu** | Settings, Log Out |

**Why remove the others:**
| Item | Already accessible via |
|------|----------------------|
| Dashboard | Doesn't exist (broken) |
| View My Profile | "My Profile" icon in nav bar |
| View My Pledge | "See my Clarity Pledge" button on profile |
| Co-create | "Co-create" button on Events page |

**Solution:**
- File: `src/app/components/layout/navigation-menu-items.tsx`
- Action: For `showUserMenu` state, keep only: Settings, Log Out
- Remove: Dashboard, View My Profile, View My Pledge, Co-create (both mobile and dropdown variants)

---

### ISSUE 4: Button Text Consistency

| | |
|---|---|
| **Reproduce** | Compare nav button logged-out vs logged-in |
| **Current** | Logged-out: "Start a Clarity Session" (no icon) / Logged-in: "Start Live" (with icon) |
| **Expected** | "Start Clarity Session" everywhere, no icon |

**Decision:** Use "Start Clarity Session" with no icon for consistency.

**Solution:**
- File: `src/app/components/layout/simple-navigation.tsx`
- Action:
  - Line 136: Change "Start Live" to "Start Clarity Session"
  - Line 135: Remove `<VideoIcon className="w-4 h-4" />`
  - Line 174: Already says "Start a Clarity Session" — change to "Start Clarity Session" (remove "a")

---

### ISSUE 5: Back Button Inconsistencies

| | |
|---|---|
| **Reproduce** | Navigate profile → pledge → try to go back |
| **Current** | Profile: "← Back to Home" / Pledge: NO back button |
| **Expected** | Both have "← Back" using browser history |

**Decision:** Use `history.back()` with fallback to `/events` when no history.

**Solution:**
- File: `src/app/pages/profile-page-v2.tsx`
  - Change "Back to Home" to "← Back"
  - Use `onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/events')}`

- File: `src/app/pages/pledge-page.tsx`
  - Add back button: "← Back" that goes to `/p/${slug}`

---

### ISSUE 6: Pledge Page Title Duplication

| | |
|---|---|
| **Reproduce** | Go to `claritypledge.com/p/slava/pledge`, check browser tab |
| **Current** | "Vyacheslav Ladischenski's Clarity Pledge's Clarity Pledge" |
| **Expected** | "Vyacheslav Ladischenski's Clarity Pledge" |

**Technical finding (Architect):** SEO component appends suffix when `profile` prop exists. Pledge page passes full title + profile prop, causing double append.

**Solution:**
- File: `src/app/pages/pledge-page.tsx`
- Action: Change `title="${profile.name}'s Clarity Pledge"` to just `title="${profile.name}"` (line ~183)
- Let SEO component append the suffix

---

### ISSUE 7: Mobile Bottom Nav Not Showing

| | |
|---|---|
| **Reproduce** | Open any production page on mobile |
| **Current** | No bottom nav |
| **Expected** | Fixed bottom nav: My Events, Create, My Profile, Start Live |

**Solution:**
- File: `src/app/layouts/clarity-landing-layout.tsx`
- Action: Check if `<BottomNav />` is conditionally hidden. Enable it.
- Add safe area insets for iPhone notch: `padding-bottom: env(safe-area-inset-bottom)`

---

### ISSUE 8: Profile Page Missing Prototype Features

| | |
|---|---|
| **Reproduce** | Go to `claritypledge.com/p/slava` |
| **Current** | Minimal: avatar, name, "View their pledge" link |
| **Expected** | Full prototype UI with calibration, tabs, cards |
| **Verify against** | Prototype at `/prototype/linkedin-like/profile` |

**Missing features:**
- [ ] Calibration display (understanding bars)
- [ ] Stories/Points tabs
- [ ] Story cards
- [ ] Point cards
- [ ] "Create Stories & Points" button
- [ ] Calibration score badge next to name

**Empty state design:**
- Users with 0 stories/points see: "No stories yet" with CTA "Create your first story"
- "Create Stories & Points" button shows toast "Coming soon"

**Solution:**
- File: `src/app/pages/profile-page-v2.tsx`
- Action: Import and render prototype components with mock data
- Source components: `src/app/prototypes/linkedin-like/components/`
  - `calibration-display.tsx`
  - `story-card.tsx`
  - `point-card.tsx`
  - Tab components

**Note:** This is the largest task. Consider implementing in sub-phases:
1. First: Calibration display + tabs (structure)
2. Then: Story cards with mock data
3. Then: Point cards with mock data

---

## Execution Order

**Phase 1: Fix Menu** (Issues 2, 3)
1. Remove all redundant menu items
2. Keep only Settings + Log Out for logged-in users

**Phase 2: Fix Button** (Issue 4)
3. Change to "Start Clarity Session" everywhere
4. Remove VideoIcon

**Phase 3: Fix Back Buttons** (Issue 5)
5. Profile: "← Back" with history fallback to `/events`
6. Pledge: Add "← Back" to profile

**Phase 4: Fix Mobile** (Issue 7)
7. Enable bottom nav
8. Add safe area insets

**Phase 5: Fix Title** (Issue 6)
9. Fix pledge page title

**Phase 6: Profile Features** (Issue 8)
10. Add calibration display + tabs
11. Add story cards with mock data
12. Add point cards with mock data
13. Add empty states

---

## Definition of Done

- [x] Menu for logged-in users shows only: Settings, Log Out
- [x] No "Dashboard" anywhere in navigation
- [x] "Start Clarity Session" button text consistent (no icon)
- [x] Profile page has "← Back" button (uses history, fallback to /events)
- [x] Pledge page has "← Back" button (goes to profile)
- [x] Pledge page title doesn't have duplicate "Clarity Pledge"
- [x] Mobile bottom nav appears on all pages (with safe area insets)
- [x] Profile page shows calibration display (matching prototype)
- [x] Profile page has Stories/Points tabs (matching prototype)
- [x] Profile page shows story cards (with mock data)
- [x] Profile page shows point cards (with mock data)
- [x] Profile page has "Create Stories & Points" button (shows toast)
- [x] Empty state shows when user has 0 stories/points
- [ ] All changes verified on production after deploy

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/app/components/layout/navigation-menu-items.tsx` | Remove Dashboard, View My Profile, View My Pledge, Co-create for logged-in users (both mobile and dropdown) |
| `src/app/components/layout/simple-navigation.tsx` | Change "Start Live" to "Start Clarity Session", remove VideoIcon, fix "Start a Clarity Session" to "Start Clarity Session" |
| `src/app/pages/profile-page-v2.tsx` | Change "Back to Home" to "← Back" with history fallback; Add calibration display, tabs, story/point cards from prototype |
| `src/app/pages/pledge-page.tsx` | Add back button, fix title (pass just name, not full title) |
| `src/app/layouts/clarity-landing-layout.tsx` | Enable BottomNav on mobile, add safe area insets |

**Prototype components to import** (from `src/app/prototypes/linkedin-like/components/`):
- Calibration display
- Story card
- Point card
- Tab components

---

## Test Checklist

For each page, verify nav consistency:

| Page | Desktop Nav | Mobile Nav | Back Button | Menu Items |
|------|-------------|------------|-------------|------------|
| `/` (home) | ✓ | ✓ | N/A | Correct |
| `/events` | ✓ | ✓ | N/A | Correct |
| `/p/:slug` | ✓ | ✓ | "← Back" | Correct |
| `/p/:slug/pledge` | ✓ | ✓ | "← Back" | Correct |
| `/live` | ✓ | ✓ | N/A | Correct |
| `/settings` | ✓ | ✓ | N/A | Correct |

---

## Comprehensive Test Matrix

### Source of Truth
- **Prototype location:** `/prototype/linkedin-like/*`
- **Key prototype pages:**
  - Profile: `/prototype/linkedin-like/profile`
  - Events: `/prototype/linkedin-like/my-events`
  - Live: `/prototype/linkedin-like/live`

### Test 1: Menu Consistency Across ALL Pages

**Logged-OUT state** — Test on each page:

| Page | Desktop Nav Items | Desktop Menu (hamburger) | Mobile Menu | Bottom Nav |
|------|-------------------|-------------------------|-------------|------------|
| `/` | Events, Pledgers, Manifesto, About, [Start Clarity Session] | Co-create, Take Pledge, Log In, Create Account | Same as desktop menu | N/A (logged out) |
| `/events` | Same | Same | Same | N/A |
| `/events/list` | Same | Same | Same | N/A |
| `/pledgers` | Same | Same | Same | N/A |
| `/article` | Same | Same | Same | N/A |
| `/about` | Same | Same | Same | N/A |
| `/p/:slug` | Same | Same | Same | N/A |
| `/p/:slug/pledge` | Same | Same | Same | N/A |
| `/live` | Same | Same | Same | N/A |
| `/sign-pledge` | Same | Same | Same | N/A |
| `/co-create` | Same | Same | Same | N/A |
| `/login` | Same | Same | Same | N/A |
| `/signup` | Same | Same | Same | N/A |

**Logged-IN state** — Test on each page:

| Page | Desktop Nav Items | Desktop Menu (avatar) | Mobile Menu | Bottom Nav (mobile) |
|------|-------------------|----------------------|-------------|---------------------|
| `/` | My Events, Create (disabled), My Profile, [Start Clarity Session] | Settings, Log Out | Same | My Events, Create, My Profile, Start Live |
| `/events` | Same | Same | Same | Same |
| `/events/list` | Same | Same | Same | Same |
| `/pledgers` | Same | Same | Same | Same |
| `/article` | Same | Same | Same | Same |
| `/about` | Same | Same | Same | Same |
| `/p/:slug` | Same | Same | Same | Same |
| `/p/:slug/pledge` | Same | Same | Same | Same |
| `/live` | Same | Same | Same | Same |
| `/settings` | Same | Same | Same | Same |
| `/co-create` | Same | Same | Same | Same |

**How to verify:**
1. Navigate to each page
2. Check desktop nav bar items match expected
3. Click hamburger/avatar menu, verify items match expected
4. Resize to mobile, verify same menu items
5. Verify bottom nav appears on mobile (logged-in only)

---

### Test 2: Back Navigation from Every Page

| From Page | Back Button | Expected Behavior |
|-----------|-------------|-------------------|
| `/` | None | N/A (home) |
| `/events` | None | N/A (top-level) |
| `/events/list` | None | N/A (events home) |
| `/events/:id` | "← Back" | Returns to `/events` |
| `/pledgers` | None | N/A (top-level) |
| `/article` | None | N/A (top-level) |
| `/about` | None | N/A (top-level) |
| `/p/:slug` | "← Back" | Uses `history.back()`, fallback to `/events` |
| `/p/:slug/pledge` | "← Back" | Returns to `/p/:slug` |
| `/live` | None | N/A (top-level action) |
| `/live/:code` | "← Back" or "Leave" | Returns to `/live` or shows confirmation |
| `/settings` | "← Back" | Uses `history.back()` |
| `/co-create` | None | N/A (top-level) |
| `/sign-pledge` | None | N/A (top-level action) |
| `/sign-pledge/confirm` | None | N/A (confirmation) |

**How to verify:**
1. Navigate: Home → Events → Profile → Pledge
2. Click back on Pledge → should go to Profile
3. Click back on Profile → should go to Events
4. Click back on Events → should go to Home

**Edge case:** Direct link to profile (no history) → back button goes to `/events`

---

### Test 3: Profile Page Feature Parity with Prototype

**Compare:** Production `/p/:slug` vs Prototype `/prototype/linkedin-like/profile`

| Feature | Prototype | Production | Status |
|---------|-----------|------------|--------|
| **Header** |
| Avatar | ✅ Circle with initials/photo | | |
| Name | ✅ Bold heading | | |
| Calibration badge | ✅ Number next to name | | |
| Role + Company | ✅ "Product Manager at TechCorp" | | |
| "See my Clarity Pledge" button | ✅ | | |
| Share button | ✅ With dropdown | | |
| **Calibration Section** |
| "Understanding Calibration" header | ✅ | | |
| Info tooltip/button | ✅ | | |
| Calibration bars | ✅ Visual progress bars | | |
| **Tabs** |
| Stories tab with count | ✅ "Stories (3)" | | |
| Points tab with count | ✅ "Points (4)" | | |
| Active tab highlight | ✅ | | |
| **Create Button** |
| "Create Stories & Points" | ✅ Full-width blue button | | |
| Shows toast when clicked | ✅ "Coming soon" toast | | |
| **Story Cards** |
| Author avatar | ✅ | | |
| Author name (clickable) | ✅ | | |
| Calibration badge | ✅ | | |
| Role | ✅ | | |
| Date | ✅ | | |
| Privacy indicator | ✅ Globe/lock icon | | |
| Story text content | ✅ | | |
| "X understood" button | ✅ | | |
| "Expand linked points" button | ✅ Expandable | | |
| Share button | ✅ | | |
| Open button | ✅ | | |
| **Point Cards** (when Points tab active) |
| Similar structure to story cards | ✅ | | |
| Linked to stories | ✅ | | |
| **Empty State** |
| Message when 0 stories | "No stories yet" | | |
| CTA button | "Create your first story" | | |

**How to verify:**
1. Open prototype profile in one tab
2. Open production profile in another tab
3. Compare side-by-side
4. Check each feature in table above

---

### Test 4: Interactive Elements Work

| Element | Location | Expected Behavior | Toaster? |
|---------|----------|-------------------|----------|
| **Navigation** |
| "Create" nav item (disabled) | Desktop nav | Shows toast "Coming soon" | ✅ Yes |
| "My Events" nav item | Desktop nav | Navigates to `/events` | No |
| "My Profile" nav item | Desktop nav | Navigates to `/p/:slug` or `/me` | No |
| "Start Clarity Session" button | Desktop nav | Navigates to `/live` | No |
| **Profile Page** |
| "See my Clarity Pledge" button | Profile header | Navigates to `/p/:slug/pledge` | No |
| Share button | Profile header | Opens share dropdown | No |
| Share → Copy link | Share dropdown | Copies URL to clipboard | ✅ Yes "Link copied" |
| Stories tab | Profile tabs | Shows stories, updates active tab | No |
| Points tab | Profile tabs | Shows points, updates active tab | No |
| "Create Stories & Points" button | Profile | Shows toast "Coming soon" | ✅ Yes |
| Story card → "X understood" | Story card | Shows toast or modal | ✅ Yes |
| Story card → "Expand linked points" | Story card | Expands to show linked points | No |
| Story card → Share | Story card | Opens share options | No |
| Story card → Open | Story card | Shows toast "Coming soon" | ✅ Yes |
| Point card → Open | Point card | Shows toast "Coming soon" | ✅ Yes |
| **Settings Page** |
| Save button | Settings form | Saves settings | ✅ Yes on success |
| **Live Page** |
| "Create Meeting" button | Live page | Creates meeting room | No (navigates to room) |
| Join code input | Live page | Accepts code | No |
| Join button | Live page | Joins meeting room | ✅ Yes on invalid code |

**How to verify:**
1. Click each interactive element
2. Verify expected behavior occurs
3. Verify toaster appears where marked "Yes"
4. Toaster should be clear, actionable message

---

### Test 5: Mobile-Specific Tests

| Test | Steps | Expected |
|------|-------|----------|
| Bottom nav appears | Log in → View any page on mobile | Fixed bottom nav with: My Events, Create, My Profile, Start Live |
| Bottom nav items work | Tap each item | Navigates to correct page |
| Bottom nav "Create" | Tap Create | Shows toast "Coming soon" |
| Bottom nav active state | Navigate to Events | "My Events" icon highlighted |
| Mobile menu opens | Tap hamburger/avatar | Full-screen menu slides in |
| Mobile menu items | View menu | Settings, Log Out only (logged in) |
| Touch targets | Tap all buttons | All are easily tappable (min 44x44px) |
| Horizontal scroll | View all pages | No horizontal scrolling (content fits) |
| Safe area | iPhone with notch | Bottom nav doesn't overlap home indicator |

---

### Test 6: Edge Cases

| Scenario | Test | Expected |
|----------|------|----------|
| Deep link to profile | Direct URL to `/p/slava` | Page loads correctly with nav, back goes to /events |
| Deep link to pledge | Direct URL to `/p/slava/pledge` | Page loads correctly with back button to profile |
| Refresh on any page | F5 / Cmd+R | Page reloads correctly, nav intact |
| Browser back button | Navigate Profile → Pledge → Browser back | Returns to Profile |
| 404 page | Go to `/nonexistent` | Shows 404 with nav intact |
| `/dashboard` (broken) | Go to `/dashboard` | Should redirect to `/` or show 404 |
| `/home` (broken) | Go to `/home` | Should redirect to `/` or show 404 |
| Logged in, view own profile | Go to `/p/{your-slug}` | Shows "Edit" options, not "Accept promise" |
| Logged out, view profile | Go to `/p/slava` | Shows "Accept promise" form |

---

### Test 7: Data Consistency

| Check | Location | Expected |
|-------|----------|----------|
| Events show REAL data | `/events` | Shows actual events from database (may be 0) |
| Profile shows REAL user data | `/p/:slug` | Real name, avatar, pledge text from database |
| Profile shows MOCK stories/points | `/p/:slug` | Mock data for Stories/Points (backend doesn't exist) |
| Prototype shows MOCK data | `/prototype/*` | All mock data, clearly labeled |

---

## UAT Checklist (User Acceptance)

Before marking P114 complete, verify ALL of the following:

### Navigation Consistency
- [ ] Logged-out: Same nav items on ALL pages (desktop)
- [ ] Logged-out: Same menu items on ALL pages (hamburger)
- [ ] Logged-in: Same nav items on ALL pages (desktop)
- [ ] Logged-in: Same menu items on ALL pages (avatar dropdown)
- [ ] Logged-in: Menu only shows Settings + Log Out (no redundant items)
- [ ] Mobile: Bottom nav appears on ALL pages when logged in
- [ ] Mobile: Same menu items as desktop
- [ ] Mobile: Safe area insets work on iPhone

### Back Navigation
- [ ] Profile page: "← Back" button works (uses history)
- [ ] Profile page: Direct link → back goes to /events (fallback)
- [ ] Pledge page: "← Back" button exists and goes to profile
- [ ] Settings page: "← Back" button works
- [ ] Event detail: "← Back" button works

### Button Consistency
- [ ] "Start Clarity Session" text is same logged-in and logged-out
- [ ] No VideoIcon on button

### Profile Features (from prototype)
- [ ] Calibration display shows
- [ ] Stories/Points tabs work
- [ ] Story cards render correctly
- [ ] Point cards render correctly
- [ ] "Create Stories & Points" button shows toast
- [ ] Share button works
- [ ] "See my Clarity Pledge" navigates to pledge
- [ ] Empty state shows when 0 stories/points

### Toasters
- [ ] "Create" nav item → toast "Coming soon"
- [ ] "Create Stories & Points" → toast "Coming soon"
- [ ] Share → Copy link → toast "Link copied"
- [ ] Any unimplemented feature → appropriate toast

### No Broken Routes
- [ ] `/dashboard` doesn't show blank page
- [ ] `/home` doesn't show blank page
- [ ] No "Dashboard" in any menu

### Page Titles
- [ ] Pledge page title doesn't have duplicate "Clarity Pledge"

---

## Verification Method

For each test:
1. **Reproduce** — Follow the exact steps
2. **Compare** — Check against prototype (source of truth) at `/prototype/linkedin-like/*`
3. **Screenshot** — Capture evidence if issue found
4. **Log** — Note pass/fail in checklist above
