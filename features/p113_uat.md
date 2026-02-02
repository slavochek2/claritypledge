# P113: Prototype Promotion — UAT

## Scorecard

| Category | Pass | Total |
|----------|------|-------|
| Phase 1: Events | ⬜ | 4 |
| Phase 2: Navigation | ⬜ | 7 |
| Phase 3: Profile | ⬜ | 8 |
| Integration | ⬜ | 4 |
| **Total** | **0** | **23** |

---

## Phase 1: Events Page

### UAT-1.1: Button Layout (Desktop)
- [ ] Tabs and action buttons on same row
- [ ] "Co-create" button appears before "Host Event"
- [ ] Both buttons use consistent styling

### UAT-1.2: Button Layout (Mobile)
- [ ] Buttons stack below tabs
- [ ] Full-width on mobile (or appropriately sized)

### UAT-1.3: Co-create Button
- [ ] Links to `/co-create`
- [ ] Uses outline variant styling

### UAT-1.4: No Regressions
- [ ] Real events data still loads
- [ ] RSVP functionality works
- [ ] Logged-out view unchanged

---

## Phase 2: Navigation

### UAT-2.1: Desktop Icon Nav (Logged-in)
- [ ] My Events icon visible → links to `/events`
- [ ] My Profile icon visible → links to `/p/{user-slug}`
- [ ] Icons have tooltips on hover
- [ ] Avatar menu still works

### UAT-2.2: Desktop Nav (Logged-out)
- [ ] Text links visible (Events, Pledgers, Manifesto, About)
- [ ] No icon nav shown
- [ ] Behavior unchanged from before

### UAT-2.3: Mobile Bottom Nav (Logged-in)
- [ ] Bottom nav visible with 4 icons (Events, Profile, Create, Live)
- [ ] Events → `/events`
- [ ] Profile → `/p/{user-slug}`
- [ ] Live → `/live` (real session)

### UAT-2.4: Create Button (Bottom Nav)
- [ ] Shows "Coming soon" toast on tap
- [ ] Button appears disabled (visual indicator)

### UAT-2.5: Mobile Nav (Logged-out)
- [ ] No bottom nav shown
- [ ] Hamburger menu works as before

### UAT-2.6: Page Padding
- [ ] Content not hidden behind bottom nav
- [ ] Padding applied on mobile only (`pb-20 lg:pb-0`)

### UAT-2.7: Safe Area
- [ ] Bottom nav respects safe-area-inset-bottom (iPhone notch)

---

## Phase 3: Profile

### UAT-3.1: Real Profile Data
- [ ] Name, avatar, role display correctly
- [ ] Pledge status shows
- [ ] Verification email flow still works (if applicable)

### UAT-3.2: Stories Tab
- [ ] Stories tab visible
- [ ] Mock stories display in StoryCard format
- [ ] Empty state: "No stories shared yet"

### UAT-3.3: Points Tab
- [ ] Points tab visible
- [ ] Mock points display in PointCard format
- [ ] Empty state: "No positions taken yet"

### UAT-3.4: Calibration Display (Sufficient Data)
- [ ] Calibration bars show when ≥5 sessions
- [ ] Listener/Speaker calibration visible

### UAT-3.5: Calibration Display (Insufficient Data)
- [ ] Message: "Complete X sessions to see your calibration"
- [ ] Shows sessions needed (5 - current)

### UAT-3.6: Create Button (Owner View)
- [ ] Button visible but disabled
- [ ] Desktop: Tooltip "Coming soon" on hover
- [ ] Mobile: Toast "Coming soon" on tap

### UAT-3.7: Create Button (Visitor View)
- [ ] Button hidden entirely
- [ ] No "Create" CTA visible

### UAT-3.8: Share Button
- [ ] Generates correct `/p/{slug}` URL
- [ ] Share dialog works

---

## Integration Tests

### UAT-4.1: Production Systems Intact
- [ ] `/live` works (real live session)
- [ ] Events backend works (Supabase data)
- [ ] Auth system works (`useAuth()`)

### UAT-4.2: Design System Compliance
- [ ] No hardcoded colors (`bg-white`, `text-gray-900`)
- [ ] Uses design tokens (`bg-background`, `text-foreground`)

### UAT-4.3: Service Files Created
- [ ] `stories-service-mock.ts` exists and works
- [ ] `points-service-mock.ts` exists and works
- [ ] `calibration-service-mock.ts` exists with threshold logic

### UAT-4.4: Prototype Untouched
- [ ] `src/app/prototypes/linkedin-like/**/*` unchanged
- [ ] `/tree` route still works

---

## Test Execution Notes

**Pre-test setup:**
1. Have a logged-in test user
2. Have a logged-out browser session
3. Test on both desktop (>1024px) and mobile (<768px) viewports

**Critical paths to verify:**
1. Logged-in → Events → Bottom nav → Profile → Stories tab
2. Logged-out → Events → No bottom nav → Profile (public view)
3. Create button → Toast appears → No navigation
