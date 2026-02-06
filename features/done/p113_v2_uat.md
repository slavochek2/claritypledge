---
status: done
sort_order: 1000004
completed_at: '2026-02-04'
---
# P113 v2: Plug Prototype Components — UAT

## Scorecard

| Category | Pass | Total |
|----------|------|-------|
| Task 1: Desktop Nav Labels | ⬜ | 5 |
| Task 2: Bottom Nav on /live | ⬜ | 3 |
| Task 3: Profile Page | ⬜ | 9 |
| Task 4: Remove /home | ⬜ | 2 |
| Integration | ⬜ | 4 |
| **Total** | **0** | **23** |

---

## Task 1: Desktop Nav Labels

Visual reference: `~/Screenshots/Screenshot at Feb 02 19-33-40.png` (prototype header)

### UAT-1.1: Icon Nav Structure (Logged-in Desktop)
- [ ] Icons have text labels UNDERNEATH (not just tooltips)
- [ ] Layout: icon on top, label below (`flex-col items-center`)
- [ ] Labels: "My Events", "Create", "My Profile"

### UAT-1.2: My Events Icon
- [ ] CalendarIcon with "My Events" label
- [ ] Links to `/events`
- [ ] Active state highlights when on events pages

### UAT-1.3: Create Icon
- [ ] SparklesIcon with "Create" label
- [ ] Disabled appearance (opacity or muted color)
- [ ] Shows toast "Coming soon" on click

### UAT-1.4: My Profile Icon
- [ ] UserIcon with "My Profile" label
- [ ] Links to `/p/{user-slug}`
- [ ] Active state when on profile pages

### UAT-1.5: Start Live Button
- [ ] Visible in nav (not just icon — actual button)
- [ ] Blue CTA styling
- [ ] Links to `/live`

---

## Task 2: Bottom Nav on /live

### UAT-2.1: Presence on /live
- [ ] Bottom nav visible on `/live` page (mobile)
- [ ] Bottom nav visible during active session (mobile)

### UAT-2.2: Bottom Padding on /live
- [ ] Content not hidden behind bottom nav
- [ ] `pb-20` class applied on mobile for /live pages

### UAT-2.3: All Other Pages Unchanged
- [ ] Bottom nav still works on `/events`, `/p/:slug`, etc.
- [ ] No visual regressions

---

## Task 3: Profile Page

Visual reference: `~/Screenshots/Screenshot at Feb 02 19-33-40.png` (prototype profile)

### UAT-3.1: UI Matches Prototype
- [ ] Card-based layout (white card with border/shadow)
- [ ] Centered content (`max-w-lg mx-auto`)
- [ ] Back button at top

### UAT-3.2: Profile Header
- [ ] Avatar with pledger ring (if pledged)
- [ ] Name + role/company
- [ ] Share button (top right)
- [ ] "See my Clarity Pledge" link (if pledged)

### UAT-3.3: Calibration Display
- [ ] Shows calibration bars (if data exists)
- [ ] OR shows "Complete X sessions to see calibration"
- [ ] Uses InlineCalibration component style

### UAT-3.4: Create Stories & Points CTA
- [ ] Blue full-width button (owner view only)
- [ ] SparklesIcon + "Create Stories & Points"
- [ ] Shows toast on click (feature not ready)

### UAT-3.5: Stories/Points Tabs
- [ ] Two tabs: "Stories (N)" and "Points (N)"
- [ ] Active tab has blue underline
- [ ] Tab switching works

### UAT-3.6: Stories Tab Content
- [ ] StoryCard components display
- [ ] Empty state: "No stories shared yet" + CTA button (owner)
- [ ] Empty state: "No stories shared yet" (visitor)

### UAT-3.7: Points Tab Content
- [ ] PointCard components display
- [ ] Empty state: "No positions taken yet"

### UAT-3.8: Real Data Integration
- [ ] Profile loads from `getProfileBySlug()` (real Supabase)
- [ ] Auth state from `useAuth()` (real auth)
- [ ] Owner detection works (`session.user.id === profile.id`)

### UAT-3.9: Mock Data for Stories/Points
- [ ] Stories display from mock service
- [ ] Points display from mock service
- [ ] Calibration from mock service

---

## Task 4: Remove /home Route

### UAT-4.1: Route Removed
- [ ] `/home` returns 404 or redirects
- [ ] No "home" in navigation links

### UAT-4.2: No Import Errors
- [ ] Build succeeds without HomePage import
- [ ] No console errors related to missing route

---

## Integration Tests

### UAT-5.1: Production Systems Intact
- [ ] `/live` works (real live session)
- [ ] Events shows real data (Supabase)
- [ ] Auth works (`useAuth()`, login/logout)

### UAT-5.2: Prototype Untouched
- [ ] `/prototype/linkedin-like/profile` still works
- [ ] `/tree` route still works
- [ ] Prototype files not modified

### UAT-5.3: Design System Compliance
- [ ] New components use design tokens
- [ ] `text-muted-foreground` instead of `text-gray-500`
- [ ] `bg-background` instead of `bg-white`

### UAT-5.4: Mobile/Desktop Responsive
- [ ] Desktop (>1024px): Icon nav with labels in header
- [ ] Mobile (<768px): Bottom nav, hamburger menu

---

## Test Execution

**Setup:**
1. Logged-in test user with profile
2. Logged-out browser session
3. Test both desktop and mobile viewports

**Critical paths:**
1. Desktop logged-in → See icon nav with labels → Click Profile → See prototype-style UI
2. Mobile logged-in → Navigate to /live → Bottom nav visible
3. Visit `/home` → Should 404 or redirect

**Visual comparison:**
- Open prototype: `/prototype/linkedin-like/profile`
- Open production: `/p/{your-slug}`
- UI should match (except real data vs mock)
