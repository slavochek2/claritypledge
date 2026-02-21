---
status: in-progress
type: story
rank: 0.5
milestone: C1
tags:
  - navigation
  - sessions
  - history
  - mobile
  - ux
prepped_date: '2026-02-20'
delivery_stage: arch-review
reviews:
  ux: null
  architect: null
  alignment: null
uat_file: features/uat/p405.md
test_files:
  - src/tests/sessions-service.test.ts
  - e2e/integration/p405-sessions-data.spec.ts
  - e2e/p405-my-sessions.spec.ts
  - e2e/a11y/p405-accessibility.spec.ts
  - e2e/p405-smoke.spec.ts
locked_at: '2026-02-21T09:02:06.960Z'
created_date: 2026-02-20
---

# P405: My Sessions — Session History in Global Nav

## Problem Statement

**Current state:** The `/live` main screen shows a "THIS SESSION" block listing completed rounds from the current active session. This is the only place session history appears — there is no way to review past sessions anywhere in the app.

**Pain points:**
- The main `/live` screen is cluttered with round history that users don't need to act on — it competes visually with the primary actions (start a session, search stories)
- There is no way to look back at past sessions ("what did we do last time with Slava?")
- History is ephemeral — once a session ends, the data is gone from the UI entirely
- First-time visitors see history they have no context for

**Who's affected:** Logged-in users who have completed one or more live sessions, particularly repeat users returning for a second or third session.

---

## Intention (Why This Matters)

**Strategic importance:** Session continuity is a core value prop for coaches using the product with clients. "My Sessions" turns a series of disconnected live events into a visible practice history — reinforcing habit formation and making the tool feel like a real practice log.

**Why now:** The `/live` screen is accumulating UI debt. Cleaning it up is a prerequisite for making the flow feel polished enough to show to coaches (C1 milestone). The data is already there — this is a presentation problem, not a data problem.

**Impact if not solved:** The main screen stays cluttered. Past session data remains permanently invisible after sessions end. Coaches can't review what was practiced with a client.

---

## Business Requirements

**Must-haves:**
- Users can access a list of their past live sessions from global navigation (both mobile and desktop)
- Each session entry shows: date, partner name, number of rounds completed
- Sessions with zero completed rounds are not shown (filtered out)
- The `/live` main screen no longer shows the "THIS SESSION" history block
- Sessions are visible to both participants (creator and joiner, if both have accounts)
- Guest participants (no account) do not see history (nothing to query against)
- Bottom nav does not offer "Sessions" tab while user is mid-session on `/live` (prevents accidental navigation away from active session)

**Success conditions:**
- User can answer "what did we practice last time?" without asking their partner
- The `/live` main screen feels focused — only actionable content remains

**Constraints:**
- No new database columns required (data exists in `live_state.sessionHistory` and `clarity_sessions`)
- My Events tab stays — it is a separate concept (calendar events, not live sessions)

---

## User Stories

**As a returning user before starting a new session:**
- I want to see a list of my past sessions, so I can remind myself what we practiced last time
- I want to see who I practiced with and how many rounds we did, so I can gauge session depth at a glance

**As a coach reviewing client progress:**
- I want to see a chronological list of all sessions with a client, so I can track how consistently we're practicing

**As a user on the `/live` main screen:**
- I want the main screen to show only actionable content, so I'm not distracted by history I don't need right now

**As a mobile user:**
- I want "My Sessions" reachable from the bottom nav, so I don't have to dig through menus

**As a desktop user:**
- I want "My Sessions" accessible from the top navigation or avatar menu, so it's always reachable

---

## Jobs to Be Done

**When I'm about to start a new session with the same partner:**
- I want to quickly see what we practiced before, so I can pick up where we left off without asking

**When I'm on the `/live` screen ready to practice:**
- I want to focus on starting or joining, so I'm not distracted by past round data

**When I'm a coach reviewing a client's engagement:**
- I want to see session frequency and depth, so I can assess how committed they are to the practice

---

## Outcomes (Success Metrics)

**Clutter reduction:**
- `/live` main screen: "THIS SESSION" block removed — 0 history items visible by default

**New capability:**
- Users can access past session list (currently impossible)

**Engagement signal:**
- Returning users who visit "My Sessions" at least once per week → indicates habit formation (track via Mixpanel)

---

## Acceptance Criteria

- [ ] "THIS SESSION" history block is removed from the `/live` main screen
- [ ] "My Sessions" is accessible from mobile bottom nav (new tab alongside My Events, My Profile, Start a Session)
- [ ] "My Sessions" is accessible from desktop navigation (avatar dropdown or top nav link)
- [ ] Sessions list shows: date, partner name, round count — in reverse chronological order
- [ ] Sessions with 0 completed rounds are not shown
- [ ] Both participants (if logged in) see the session in their own "My Sessions" list
- [ ] Guest participants (no account) see nothing — "My Sessions" requires login
- [ ] Bottom nav "Sessions" tab is hidden or disabled while user is in an active live session
- [ ] Tapping a session row shows the rounds completed in that session (title + skipped/completed status)
- [ ] Private sessions are visible to both participants but not to anyone else

---

## Next Steps

1. ~~Run `/ux features/p405_my-sessions-history.md`~~ — done, see UX section below
2. Run `/architect features/p405_my-sessions-history.md` — technical approach (query, nav wiring, nav suppression during live)
3. Run `/generate-tests features/p405_my-sessions-history.md`
4. Run `/dev features/p405_my-sessions-history.md`

---

## UX Design

### Navigation Inventory (Current State)

**Mobile bottom nav** (visible to logged-in users only, `lg:hidden`):
- My Events → `/events`
- My Profile → `/p/:slug` or `/me`
- Clarity Session → `/live`

**Desktop top nav** (logged-in users):
- Icon links: My Events, My Profile, "Start a Clarity Session" CTA button
- Avatar dropdown: Pledgers, Manifesto, Blog, About, Settings, Log Out
- When in active session: dropdown strips nav links — only Settings and Log Out remain

**Mobile top nav**: Avatar/hamburger opens a slide-down panel with all links. Bottom nav handles primary destination tabs.

---

### Flow 1: Accessing My Sessions from Mobile (Bottom Nav)

**Entry point:** User is anywhere in the app on mobile, is logged in, and is NOT in an active `/live` session.

**Happy path:**

1. User notices "My Sessions" tab in the fixed bottom nav (new fourth tab, between "My Profile" and "Clarity Session" or as a second tab — see layout note below).
2. User taps the "My Sessions" tab icon and label.
3. Bottom nav highlights the Sessions tab with the top indicator bar (matching current active-tab style: `w-8 h-0.5 rounded-full bg-primary` positioned at top of the tab area) and bold label + heavier stroke on the icon.
4. App navigates to `/sessions`.
5. Page loads. While data is fetching, user sees a skeleton list (3 placeholder rows, same height as real rows).
6. Once loaded: sessions list appears in reverse chronological order. Each row shows date, partner name, and round count.
7. User scrolls if they have many sessions.
8. User taps a session row to view its details (see Flow 3).

**Tab position:** Four tabs total. Proposed order left to right: My Events | My Sessions | My Profile | Clarity Session. This groups history items (Events, Sessions) on the left and identity/action (Profile, Start) on the right. The Clarity Session tab remains the rightmost/most prominent CTA.

**Exit points:**
- Tap any other bottom nav tab to navigate away.
- Tap a session row to open session detail (stays within `/sessions`).

---

### Flow 2: Accessing My Sessions from Desktop (Nav)

**Entry point:** User is on desktop (viewport >= 1024px), is logged in, and is NOT in an active `/live` session.

**Happy path:**

1. The avatar dropdown (top-right of the nav) gains a new "My Sessions" item in the menu. It appears in the navigation section (before the separator that precedes Settings/Log Out), alongside Pledgers, Manifesto, Blog, About.
2. User clicks the avatar to open the dropdown.
3. User sees "My Sessions" as a menu item with a clock/history icon (e.g., `HistoryIcon` from lucide-react).
4. User clicks "My Sessions".
5. Dropdown closes, app navigates to `/sessions`.
6. Page loads with skeleton then sessions list.

**Alternative:** A dedicated icon link in the top nav bar alongside the existing "My Events" and "My Profile" icon links. This makes "My Sessions" a first-class nav destination on desktop — equivalent to its prominence in the mobile bottom nav. Recommendation: add it as a third icon link (between My Events and My Profile) to keep symmetry with mobile tab order. Label: "My Sessions", icon: `HistoryIcon` or `ListIcon`.

**Exit points:**
- Click any top nav link to navigate away.
- Click a session row to open session detail.

---

### Flow 3: Viewing Session Detail (Tapping a Session Row)

**Entry point:** User is on `/sessions`, looking at the sessions list.

**Happy path:**

1. User taps (mobile) or clicks (desktop) a session row.
2. A slide-up drawer opens from the bottom (mobile) or a right-side panel / modal opens (desktop).
3. Drawer header shows: date of session, partner name, and total rounds completed.
4. Below the header: a list of rounds in order, each showing:
   - Round number or position in session
   - Story or point title (if it was a story/point round) or "Free conversation" (if free-form)
   - Status badge: "Completed" (with a check icon) or "Skipped" (with muted styling)
5. User scrolls through rounds if there are many.
6. User taps a completed round row to view the rating summary for that round (checker and responder ratings, gap). This is a secondary detail level — could be an inline accordion expand or a deeper drill-in within the drawer.
7. User closes the drawer by:
   - Swiping down on mobile (drag handle at top of drawer)
   - Tapping outside the drawer / pressing Escape (desktop)
   - Tapping a "Back" or "Close" chevron/button in the drawer header

**Exit:** Drawer closes, user is back on the sessions list.

---

### Flow 4: User is in an Active Live Session (Nav Tab Suppressed)

**Entry point:** User is on `/live`, actively in a session (view state = `live` or `waiting`).

**Behavior:**

- On mobile: The "My Sessions" bottom nav tab is **hidden** (not rendered), keeping the bottom nav focused on in-session actions. The existing pattern for active session already hides nav items in the dropdown menu (`inActiveSession` prop) — the same principle applies here. The user should not be able to accidentally navigate away from the active session.
- On desktop: "My Sessions" is removed from the avatar dropdown and from the top nav icon links during active session, consistent with the existing `inActiveSession` pattern that already strips Pledgers, Manifesto, Blog, About from the dropdown.

**When the session ends** (user leaves, partner leaves, session ended): Nav items restore to their normal state. The Sessions tab reappears in the bottom nav. The user can now navigate to My Sessions to see the session they just completed.

**Decision point:** "Should we show the tab as disabled (visible but greyed out) or hidden?" Recommendation: **hidden**. Disabled tabs require explanation; hidden tabs remove the temptation entirely. The existing `inActiveSession` pattern on the desktop dropdown uses a hide-not-disable approach. Match that pattern for consistency.

---

### Screen Designs

#### My Sessions List Screen — Mobile (320px–767px)

```
┌─────────────────────────────────┐
│  [← Back]    My Sessions        │  ← Standard page header, 16px padding
├─────────────────────────────────┤
│  Feb 19, 2026                   │  ← Date group header (text-xs muted-foreground
│  ┌─────────────────────────────┐│     uppercase tracking-wide, like "THIS SESSION")
│  │ 👤 Slava          3 rounds  ││  ← Session row
│  │    Feb 19 · 2:34 PM     ›  ││     Partner name bold, date+time muted-sm, rounds badge
│  └─────────────────────────────┘│
│                                 │
│  Feb 17, 2026                   │
│  ┌─────────────────────────────┐│
│  │ 👤 Masha          5 rounds  ││
│  │    Feb 17 · 10:12 AM    ›  ││
│  └─────────────────────────────┘│
│                                 │
│  Feb 14, 2026                   │
│  ┌─────────────────────────────┐│
│  │ 👤 Slava          1 round   ││
│  │    Feb 14 · 4:51 PM     ›  ││
│  └─────────────────────────────┘│
│  ...                            │
├─────────────────────────────────┤
│  My Events │ My Sessions │ Me │ ⊙ │  ← Bottom nav (4 tabs)
└─────────────────────────────────┘
```

**Row anatomy:**
- Min height 64px (touch target comfort)
- Left: avatar initial circle (matching GravatarAvatar `size="sm"`, uses partner name)
- Center: partner name (`font-medium text-foreground`), date + time (`text-xs text-muted-foreground`)
- Right: round count badge (`text-sm font-medium`) + chevron right (`ChevronRight w-4 h-4 text-muted-foreground`)
- Full row is a tappable button (`min-h-[64px]`, `hover:bg-muted/50`, `active:bg-muted`, `focus-visible:ring-2`)

**Grouping:** Sessions grouped by date (day), with a small date section header above each group. This mirrors common mobile list patterns and helps scanning.

**Loading state:** 3 skeleton rows, each with a muted grey placeholder bar for the name and a shorter bar for the date. No spinner — skeleton loads feel faster.

**Scroll:** Simple scrollable list, no pagination for MVP. The list starts with most recent session at top.

---

#### My Sessions List Screen — Desktop (1024px+)

Same data, but rendered in the main content area (not full-screen):

```
┌────────────────────────────────────────────────────┐
│  [Logo]  My Events  My Sessions  My Profile  [CTA] [Avatar ▾] │  ← Top nav
├────────────────────────────────────────────────────┤
│                                                    │
│  My Sessions                                       │  ← H1, centered or left-aligned
│                                                    │
│  ┌────────────────────────────────────────────┐   │
│  │  Feb 19, 2026                              │   │  ← Date group header
│  │  ┌──────────────────────────────────────┐ │   │
│  │  │  👤 Slava          3 rounds       ›  │ │   │  ← Session row
│  │  │     Feb 19 · 2:34 PM               │ │   │
│  │  └──────────────────────────────────────┘ │   │
│  └────────────────────────────────────────────┘   │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

Max content width: `max-w-2xl mx-auto` (matching the live page's `max-w-md md:max-w-2xl` pattern). Rows are wider but same structure — partner avatar, name, date, round count, chevron.

---

#### Session Detail Drawer — Mobile

Triggered by tapping a session row. Slides up from bottom using the existing sheet/drawer pattern.

```
┌─────────────────────────────────┐
│              ────               │  ← Drag handle (4px × 32px, rounded, muted)
│  Feb 19, 2026 · Slava           │  ← Header: date · partner name
│  3 rounds completed             │  ← Sub-header: round count (muted-foreground)
├─────────────────────────────────┤
│  ✓  The Clarity Framework       │  ← Completed round row
│     Story · Checker: 8, You: 7  │     Title, type, rating summary
│                                 │
│  ✓  Active listening techniques │  ← Completed round row
│     Story · Checker: 10, You:10 │
│     Perfect understanding ✨    │     Badge for perfect round
│                                 │
│  ✗  Free conversation           │  ← Skipped round row (opacity-60)
│     Skipped                     │
│                                 │
│  ✓  Clear communication         │  ← Completed round row
│     Point · Checker: 9, You: 8  │
│                                 │
│             [Close]             │  ← Close button (text button, muted)
└─────────────────────────────────┘
```

**Round row anatomy:**
- Check icon (`CheckCircle2 w-4 h-4 text-primary`) for completed, muted X icon for skipped
- Type icon: BookOpen (story), MessageSquare (point), none (free)
- Title: `text-sm font-medium text-foreground`
- Rating summary: `text-xs text-muted-foreground` — "Checker: N, You: N" or "Skipped"
- Row min-height: 56px, full-width

---

#### Session Detail Panel — Desktop

Same content, shown as a right-side slide-in panel or centered modal dialog:

- Width: 480px max, slides in from right
- Header: date, partner name, close (X) button in top-right
- Body: same round list as mobile
- Footer: "Close" button (secondary variant)

Alternatively: a full-width section below the session row that expands inline (accordion pattern). This avoids modal complexity for desktop and keeps context visible. Recommendation: **inline expand** on desktop (simpler), **drawer** on mobile (better touch ergonomics).

---

#### /live Main Screen — After Removing "THIS SESSION" Block

The "THIS SESSION" `SessionHistoryList` component is removed from `live-mode-view.tsx`. The screen becomes:

**Before (current):**
- Active story/point card (if selected)
- Rating controls / "I spoke" button
- [THIS SESSION] header + list of completed rounds

**After (target):**
- Active story/point card (if selected)
- Rating controls / "I spoke" button
- _(History is gone — screen is focused on current action only)_

The `hasScrollableContent` check that currently factors in `sessionHistory.length > 0` for layout purposes will collapse back to only considering actual content (stories, points, rating data). The centered layout (`CONTENT_LAYOUT_CENTERED`) will be used more often for idle state, giving the screen more breathing room.

---

#### Bottom Nav — With Sessions Tab

**4-tab layout:**

```
┌─────┬──────────────────┬──────┬──────────────────────────────┐
│  📅  │        🕐         │  👤  │             ⊙                │
│My   │   My Sessions   │ My   │      Clarity Session          │
│Events│                 │Profile│                              │
└─────┴──────────────────┴──────┴──────────────────────────────┘
```

Icon choices:
- My Events: `CalendarIcon` (existing)
- My Sessions: `HistoryIcon` or `ClockIcon` (from lucide-react) — "History" conveys past sessions well
- My Profile: `UserIcon` (existing)
- Clarity Session: `MicIcon` (existing)

Tab width: `flex-1` on each tab so they fill the nav evenly. With 4 tabs, each tab is narrower — labels will be shortened if needed. "My Sessions" may use "Sessions" as the short label. "Clarity Session" may use "Session" to fit.

Active state: top indicator bar (`w-8 h-0.5 rounded-full bg-primary`), bold label, heavier icon stroke. Same as current 3-tab behavior.

**During active /live session:** The "My Sessions" tab is not rendered. The 3-tab layout (My Events, My Profile, Clarity Session) is shown — matching the current state of the nav.

---

#### Empty State — No Past Sessions

Shown when user is logged in but has no completed sessions (or all sessions had 0 rounds).

```
┌─────────────────────────────────┐
│  My Sessions                    │
│                                 │
│         🎙  (muted icon)        │
│                                 │
│    No sessions yet              │  ← Heading, text-lg font-medium
│                                 │
│    Start your first session     │  ← Sub-text, text-sm muted-foreground
│    to see your history here.    │
│                                 │
│    [Start a Clarity Session]    │  ← Blue CTA button → /live
│                                 │
└─────────────────────────────────┘
```

Icon: `MicIcon` or `CalendarDaysIcon` in a muted/large treatment. CTA button uses the same blue button style as the nav CTA.

---

### Edge Cases

#### Error States

**API call fails (network error / server error):**
- Show an inline error message replacing the skeleton: "Couldn't load your sessions. Check your connection and try again."
- Include a "Try again" button (text button, `text-primary`) that retries the fetch.
- Do not show a toast for this error — the page-level inline message is sufficient since the user is already on the Sessions page.

**Session detail fails to load rounds:**
- Drawer opens but shows: "Couldn't load round details. Try again later."
- Include a retry button inside the drawer.

**Partial data (session exists but rounds data is malformed):**
- Show only the fields that are available.
- If no round data is available at all, show: "No round details available for this session."

---

#### Loading States

**Sessions list:**
- Skeleton loader: 3 placeholder rows (grey bars at title/date/count positions), same height as real rows. No spinner.
- If load takes > 3 seconds: show the skeleton with a very subtle shimmer animation (matching Tailwind's `animate-pulse`).

**Session detail drawer:**
- Drawer opens immediately (frame is visible).
- Inside: skeleton rows for rounds (2–3 placeholder bars) while data loads.
- Rounds appear once loaded.

---

#### Empty States

| Situation | What user sees |
|---|---|
| Logged in, no sessions | Empty state with MicIcon + CTA (described above) |
| Logged in, all sessions had 0 rounds | Same empty state (sessions with 0 rounds are filtered) |
| Session has rounds but detail fetch fails | Error state inside drawer |

---

#### Guest / Unauthenticated Access

- Visiting `/sessions` without being logged in: redirect to `/login?redirect=/sessions`.
- After login, user is returned to `/sessions`.
- Guest users (joined a session without an account) have no profile — they never see `/sessions` because the bottom nav and nav items are only rendered for `showUserMenu === true` (verified, logged-in users).

---

#### User in Active Live Session

- Navigating directly to `/sessions` via URL while in an active session: the page loads normally (no active session check needed on the page itself). However, the nav tab is hidden so the user won't accidentally trigger this from the UI.
- If user does navigate to `/sessions` mid-session (via URL bar): they see their history. Navigating back to `/live` restores their session (existing session restoration logic handles this via sessionStorage).

---

#### Session with Only One Logged-In Participant

- If creator has an account and joiner was a guest: creator sees the session in their My Sessions list. The guest does not (they have no account).
- If joiner has an account and creator was a guest: joiner sees the session in their My Sessions list. The guest creator does not.
- Both cases are handled by the query filtering on the user's profile ID (matching either `creator_profile_id` or `joiner_profile_id`).

---

### Accessibility

#### Screen Reader Support

- The `/sessions` page `<main>` has `aria-label="My Sessions"`.
- The sessions list is a `<ul>` with each session as a `<li>` containing a `<button>`.
- Each session button has `aria-label` combining date, partner name, and round count: `aria-label="Session with Slava on February 19, 2026 — 3 rounds"`.
- The session detail drawer is a `<dialog>` (or Radix Sheet) with `aria-labelledby` pointing to the drawer header.
- Rounds list inside the drawer: `<ul>` with each round as `<li>`. Completed rounds: icon has `aria-label="Completed"`. Skipped rounds: icon has `aria-label="Skipped"`.
- Loading skeleton: `aria-busy="true"` on the list container, `aria-label="Loading sessions"`.
- Error state: `role="alert"` on the error message so screen readers announce it immediately.
- Empty state: `aria-label="No past sessions"` on the container.

#### Live Regions

- When the sessions list loads (replacing skeleton): `aria-live="polite"` on the list container announces the count: "3 sessions loaded."
- When the session detail drawer opens: focus is moved to the drawer (standard sheet/dialog behavior). `aria-live="polite"` announces "Session detail loaded."

#### Keyboard Navigation

- Tab order on the sessions list page:
  1. Top nav / back button
  2. Sessions list items (each is a focusable `<button>`)
  3. Bottom nav tabs
- Within a session row, `Enter` or `Space` opens the detail drawer.
- Drawer: `Escape` closes it. Focus returns to the session row that triggered it.
- Inside the drawer, `Tab` cycles through round rows (if rows are interactive/expandable) and the Close button.
- Bottom nav: arrow keys move between tabs (matches existing behavior if implemented, otherwise Tab cycles through all nav items).

#### Color Contrast

- All text on white/background surfaces must meet WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Session row: partner name uses `text-foreground` (passes). Date and round count use `text-muted-foreground` — verify this color achieves 4.5:1 against `background`.
- Active nav tab: `text-primary` against `background/95` (verify).
- Muted/skipped round rows use `opacity-60` — this must be applied carefully so the underlying muted text still meets contrast (consider `text-muted-foreground/60` may drop below threshold). Prefer a slightly higher opacity (`opacity-70`) or a specific text color token that is guaranteed to pass.
- "Perfect understanding" badge: verify that the badge background + text combination passes 4.5:1.

#### Focus Indicators

- All interactive elements (session rows, drawer close, retry button) must show a visible focus ring: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`. This matches the existing design system pattern.
- Bottom nav tabs: focus ring matching the existing tab implementation.

---

### Responsive Design

#### Mobile (320px–767px)

- Full-screen sessions list with fixed bottom nav (4 tabs, `h-16`, `pb-[env(safe-area-inset-bottom)]`).
- Session rows are full-width, min-height 64px.
- Session detail opens as a bottom sheet (slide-up drawer), covering ~75% of screen height. Drag handle at top.
- Empty state is centered vertically on screen.
- Page has `container px-4` padding.

#### Tablet (768px–1023px)

- Bottom nav still visible (`lg:hidden` — bottom nav only hides at `lg` = 1024px+).
- Sessions list uses wider rows (`max-w-2xl mx-auto`).
- Session detail opens as a bottom sheet (same as mobile) or a centered modal (better use of horizontal space). Recommendation: modal at tablet width — more comfortable than a full-height bottom sheet.
- Bottom nav remains 4 tabs.

#### Desktop (1024px+)

- Bottom nav is hidden (`lg:hidden`).
- Top nav shows icon links including My Sessions (matching My Events and My Profile).
- Sessions list fills the main content area with `max-w-2xl mx-auto px-8` padding.
- Session detail opens as an inline expand (accordion) below the row, or a right-side slide-in panel (480px wide). Inline expand recommended for desktop — avoids blocking list context.
- No bottom nav. Navigation is entirely via top nav + avatar dropdown.
- Page layout: standard page container, consistent with other content pages in the app (`container mx-auto px-4 lg:px-8`).

---

## Technical

### Technical Analysis

#### Current Code State

**Bottom Nav (`src/app/components/layout/bottom-nav.tsx`)**

Currently renders 3 tabs for logged-in users: My Events (`/events`), My Profile (`/p/:slug` or `/me`), and Clarity Session (`/live`). Tab icons are `CalendarIcon`, `UserIcon`, `MicIcon` from lucide-react. Active state detection uses path prefix matching. The component reads `showUserMenu` and `slug` from `useNavAuthState()`. No concept of active session suppression exists here — the component does not know if the user is mid-session.

**Desktop Navigation (`src/app/components/layout/simple-navigation.tsx`)**

For logged-in users on desktop (`lg` breakpoint+), renders two icon-link columns: My Events and My Profile. Then a blue "Start a Clarity Session" CTA button. Then an avatar dropdown that delegates to `NavigationMenuItems`. The icon links are hardcoded in `simple-navigation.tsx` directly (not via `NavigationMenuItems`).

**Navigation Menu Items (`src/app/components/layout/navigation-menu-items.tsx`)**

Shared component used by both `SimpleNavigation` (desktop dropdown) and `LiveSessionBanner` (in-session dropdown). Accepts `inActiveSession` boolean prop. When `inActiveSession === true`, the nav-link block (`{!inActiveSession && (...)}`) is suppressed — only Settings and Log Out appear. This is the existing pattern for session-aware nav suppression on the desktop dropdown.

**Live Session Banner (`src/app/components/partners/live-session-banner.tsx`)**

Used as the in-session header replacement (instead of `SimpleNavigation`). Passes `inActiveSession={isLiveMeeting}` to `NavigationMenuItems`. The `isLiveMeeting` prop comes from the `ClarityLivePage` view state. This is where the active session detection happens — the banner knows it is in-session.

**`ClarityLivePage` (`src/app/pages/clarity-live-page.tsx`)**

Tracks `view: ViewState` as local state (`'start' | 'waiting' | 'live'`). The `view === 'live'` or `view === 'waiting'` state maps to an active session. When in `live` view, `LiveSessionBanner` is rendered with `isLiveMeeting={true}`, suppressing nav items. The standard `SimpleNavigation` (rendered by `ClarityLandingLayout`) is replaced by `LiveSessionBanner` inside the page body — this means the layout's `BottomNav` still renders independently since it is mounted at the layout level and has no knowledge of `view`.

**`ClarityLandingLayout` (`src/app/layouts/clarity-landing-layout.tsx`)**

Renders `<BottomNav />` unconditionally for all routes. There is no mechanism to suppress the bottom nav per-route or per-session-state. The layout does not know about `/live` session state.

**Session Data Storage**

`clarity_sessions` table: columns `creator_profile_id` (UUID, references `profiles.id`) and `joiner_profile_id` (UUID, references `profiles.id`) were added in migration `20260204_stories_points_calibration.sql` with indexes `idx_sessions_creator_profile` and `idx_sessions_joiner_profile`.

`live_state` column: JSONB column on `clarity_sessions`, contains the full `LiveSessionState` object including `sessionHistory: SessionHistoryItem[]`. The `SessionHistoryItem` type (`src/app/types/index.ts`, line 522) has fields: `title`, `type` ('story'|'point'|'free'), `checkerRating`, `responderRating`, `explainBackRatings`, `checkerName`, `partnerName`, `completedAt`, `skipped`, `isChecker`, and `storyData`.

The `SessionHistoryList` component (`src/app/components/partners/live-content-cards.tsx`, line 386) currently renders this data inside the live meeting view. It consumes the `sessionHistory` from `liveState.sessionHistory ?? []` (line 842 of `live-mode-view.tsx`).

RLS on `clarity_sessions` SELECT: `USING (true)` — public read. No row-level filtering. The My Sessions query will need to filter client-side or via a WHERE clause (`creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`).

**`SessionHistoryList` Component (to be removed from `/live`)**

Currently rendered at line 1068–1074 of `live-mode-view.tsx`. Rendered inside the `IdleScreen` component when `sessionHistory.length > 0`. Removing it requires: (1) deleting the render block, (2) removing `selectedHistoryIndex` state and `summaryStory` memo since they back the history-click detail view, (3) updating `hasScrollableContent` at line 926 (currently `hasContent || sessionHistory.length > 0`) to just `hasContent`.

**Events Service Pattern (reference implementation)**

`src/app/data/events-service-real.ts` follows the pattern: typed DB row interface → `mapEventFromDb()` function → service object with async methods → supabase query. This is the pattern to follow for the sessions service.

---

#### Dependencies

- `lucide-react`: `HistoryIcon` or `ClockIcon` for the new Sessions tab (check availability)
- `supabase` client: already imported everywhere relevant via `@/lib/supabase`
- `useNavAuthState`: hook provides `user.id` needed for the query filter
- `useAuth`: hook provides `user` and session — used in `ClarityLivePage` to determine session state
- No new DB migrations needed (data exists in `live_state.sessionHistory` and `clarity_sessions`)
- No new Supabase RLS policies needed for the query (using existing `USING(true)` SELECT policy with client-side WHERE clause)
- A new RLS SELECT policy scoped to authenticated users will be needed if we want to enforce server-side data isolation (see Security Review)

---

### Architecture Decisions

**Decision 1: Data Source for My Sessions list**

- **Chosen:** Query `clarity_sessions` table WHERE `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`, order by `created_at DESC`, filter client-side for sessions where `live_state->>'sessionHistory'` is non-empty (or round count > 0).
- **Rationale:** All data needed (date, partner name, round count) already lives in `clarity_sessions`. `creator_name` / `joiner_name` contain partner info. `live_state` JSONB contains `sessionHistory` array length for round count. No new tables, no migrations, no schema changes — matches the spec constraint.
- **Trade-off:** Parsing `sessionHistory` from JSONB in the query (or fetching full `live_state` and filtering in JS) is slightly inefficient for users with many sessions, but the volume is low enough that a simple JS filter is acceptable for MVP.
- **Alternative rejected:** Creating a separate `session_summary` table with denormalized round counts. Adds migration complexity, requires a trigger or backfill, violates the spec constraint "no new database columns required."

---

**Decision 2: Active Session Detection for Bottom Nav Suppression**

- **Chosen:** Use a new React context (`LiveSessionContext`) or a simple custom hook (`useIsInActiveSession`) that reads a sessionStorage flag. The flag is written by `ClarityLivePage` when `view` transitions to `'waiting'` or `'live'`, and cleared when the session ends. `BottomNav` reads this flag and suppresses the Sessions tab when it is true.
- **Rationale:** `BottomNav` is mounted at layout level (in `ClarityLandingLayout`) and has no access to `ClarityLivePage`'s local `view` state. The cleanest solution without global state management (no Redux/Zustand in this codebase) is to use sessionStorage as a cross-component signal. This is already the established pattern in `ClarityLivePage` (which uses `sessionStorage` via `STORAGE_KEYS` for session code, user name, and creator flag). A custom hook wrapping `sessionStorage` reads naturally and can be reactive if needed via a `storage` event listener or simple polling.
- **Trade-off:** sessionStorage is tab-isolated (which is correct — each tab has its own session). The flag must be cleaned up on unmount/exit. If the page crashes before cleanup, the flag may persist until the user returns to `/live`. This is acceptable: worst case is the Sessions tab is briefly hidden after an unexpected exit — a minor UX glitch, not a data issue.
- **Alternative rejected:** Lifting `view` state to a React context wrapping the whole app. This would require refactoring `ClarityLivePage` to push state upward, touching auth context, and risks introducing re-render performance issues across unrelated components. Over-engineered for a single-flag problem.

---

**Decision 3: Session Detail — Drawer vs Inline Expand**

- **Chosen:** Radix `Sheet` (bottom sheet) on mobile, inline accordion expand on desktop. Both are already available in the codebase — the `Drawer` component (`src/components/ui/drawer.tsx`) is used in `live-mode-view.tsx` for the responder rating drawer; accordion-style inline expand is used in `ContentPicker` / `LiveStoryCard`. No new UI dependencies needed.
- **Rationale:** Matches the UX spec exactly. Re-uses existing Radix primitives. Minimizes new component surface area.
- **Trade-off:** Two interaction modes for the same content (drawer vs inline) adds conditional render logic in the session detail component. Manageable with a responsive breakpoint prop or `useMediaQuery`.
- **Alternative rejected:** Modal dialog for both mobile and desktop. Would require backdrop handling, scroll-lock on mobile (awkward), and diverges from the existing drawer pattern already in use on `/live`.

---

**Decision 4: Sessions Service — New Service File vs Adding to `api.ts`**

- **Chosen:** New service file `src/app/data/sessions-service.ts`, following the `events-service-real.ts` pattern: typed DB row interface, `mapSessionFromDb()` mapper, exported async functions.
- **Rationale:** `api.ts` already contains `clarity_sessions` CRUD functions (create, join, get, subscribe, update, patch, end). Adding a read-only "get user sessions list" function there would work, but the file is large (1100+ lines). A dedicated service file keeps concerns separated and is consistent with the `events-service-real.ts` precedent for list/query endpoints.
- **Trade-off:** Another file to maintain. The mapper in `sessions-service.ts` may partially duplicate the `mapSessionFromDb` in `api.ts`. These can share a type but the mappers serve different shapes (full session vs summary for list view).
- **Alternative rejected:** Adding to `api.ts`. Works but exacerbates the already large file.

---

**Decision 5: New Page File Location and Routing**

- **Chosen:** `src/app/pages/my-sessions-page.tsx`, lazy-loaded in `App.tsx`, route `/sessions`. Wrapped in `ClarityLandingLayout` consistent with all other pages.
- **Rationale:** Every page in the app lives under `src/app/pages/`. The routing pattern in `App.tsx` uses lazy imports for secondary pages. `/sessions` is a clean URL matching the nav label.
- **Trade-off:** The `/sessions` URL is new — no redirect needed for existing users since this page didn't exist before.
- **Alternative rejected:** `/my-sessions` (longer URL, inconsistent with `/events`, `/me`). `/history` (ambiguous). `/live/history` (nests under live, but this is a standalone page, not part of the live flow).

---

### Security Review

**RLS Policies:**

- ⚠️ **`clarity_sessions` SELECT is fully open (`USING (true)`)** — Any caller (including unauthenticated) can read all session rows via Supabase's API. This includes `live_state` (JSONB with `sessionHistory`, round content, ratings), `creator_name`, `joiner_name`, `creator_note`, and `is_private`. The My Sessions query filter (`creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`) is application-level only — not enforced at the DB layer.
- ⚠️ **`clarity_live_turns` SELECT is fully open (`USING (true)`)** — Round-level data (speaker/listener names, ratings, transcripts) is publicly readable.
- ⚠️ **`clarity_sessions` UPDATE policy uses `USING (true)`** — Any caller can attempt to update any session row. `WITH CHECK (creator_profile_id IS NOT NULL)` only blocks writes to legacy NULL-creator rows, not unauthorized writers. A malicious actor can overwrite `live_state`, flip `is_private`, or change `joiner_name` on any session.
- ✅ **INSERT requires verified host** — P396 migration correctly restricts session creation to `auth.uid() IS NOT NULL AND profiles.is_verified = true`.
- ✅ **RLS is enabled** on all relevant tables.

**Authentication:**

- ⚠️ **`/sessions` route does not exist yet** and has no auth guard. Must implement redirect to `/login?redirect=/sessions` using the `useAuth` pattern from `me-page.tsx`.
- ✅ **Auth pattern is established** — `me-page.tsx` shows the correct pattern: check `sessionChecked`, `isLoading`, then `if (!user) navigate("/login")`.
- ✅ **Guest participants are excluded by design** — no `joiner_profile_id` means they never appear in My Sessions queries. Nav items are gated on `showUserMenu === true`.

**Authorization:**

- ⚠️ **No DB-level enforcement that only participants see their sessions** — Anyone can bypass the application and query `clarity_sessions` directly via REST API, reading all session data including `is_private` sessions.
- ✅ **UI query is correctly scoped** — Filter on `creator_profile_id = uid OR joiner_profile_id = uid` is the right application logic; it just needs DB enforcement too.

**Input Validation:**

- ✅ **Session lookup by room code** — normalized (`toUpperCase().trim()`) with parameterized Supabase queries; no injection risk.
- ⚠️ **Session UUID from URL params** — If `/sessions/:id` is implemented for deep-linking, session UUIDs from URL must be validated. UUIDs are low injection risk but open SELECT RLS makes enumeration meaningful.
- ✅ **Content length constraints exist** on chat, verifications, ideas tables. `live_state` JSONB has no size constraint — large payload writes are theoretically possible via the open UPDATE path.

**Data Protection:**

- ⚠️ **Partner names are PII stored in plain text** (`creator_name`, `joiner_name`, `speaker_name`, `listener_name`) and publicly readable via open SELECT RLS.
- ⚠️ **Round content and ratings are PII-adjacent** — story titles, calibration scores, and `creator_note` (invitation context) are all in the open SELECT.
- ✅ **`/sessions` page will be UI-gated** — auth redirect for unauthenticated visitors; nav items only shown to verified logged-in users.
- ⚠️ **No data retention or delete mechanism** — session data including partner names and round content is stored indefinitely with no user-facing deletion option.

**Highest-priority items for P405:**

1. **Tighten `clarity_sessions` SELECT RLS** to `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`. This breaks the current "join by code" flow (which fetches a session before the user authenticates) — that flow must be restructured (fetch by code unauthenticated, verify participant identity post-login). This is a pre-coach-launch requirement.
2. **Scope the UPDATE policy** to restrict writes to session creator and joiner only.
3. **Add auth guard** to the new `/sessions` page (using `me-page.tsx` pattern).

---

### Implementation Approach

#### Files to Create

1. **`src/app/pages/my-sessions-page.tsx`** — New page component for `/sessions` route. Renders sessions list, handles loading/empty/error states, skeleton, and opens session detail on row click. Redirects to `/login?redirect=/sessions` if not authenticated (check `showUserMenu`).

2. **`src/app/data/sessions-service.ts`** — Data layer. Exports `getUserSessions(profileId: string): Promise<SessionSummary[]>`. Types: `SessionSummary` (shaped for the list view — date, partner name, round count). Queries `clarity_sessions` where `creator_profile_id = profileId OR joiner_profile_id = profileId`, orders by `created_at DESC`, maps results, filters sessions with 0 completed rounds.

3. **`src/app/components/sessions/session-list.tsx`** — Presentational list component: renders date-grouped rows, skeleton state, empty state, error state. Used by `my-sessions-page.tsx`.

4. **`src/app/components/sessions/session-detail-drawer.tsx`** — Detail view: bottom sheet on mobile, inline accordion on desktop. Renders rounds from `live_state.sessionHistory`. Accepts `sessionId` or full `SessionSummary` + `sessionHistory`.

5. **`src/hooks/use-is-in-active-session.ts`** — Custom hook that reads/writes a `clarity_live_active` key in `sessionStorage`. Returns `{ isInActiveSession: boolean }`. Used by `BottomNav` to conditionally suppress the Sessions tab.

---

#### Files to Modify

1. **`src/app/components/layout/bottom-nav.tsx`**
   - Import `HistoryIcon` (or `ClockIcon`) from lucide-react.
   - Import `useIsInActiveSession` hook.
   - Add Sessions nav item (`{ icon: HistoryIcon, label: 'Sessions', to: '/sessions' }`) between My Events and My Profile.
   - Suppress Sessions item when `isInActiveSession === true` (do not render the item — match hide-not-disable pattern).
   - Update `isActive` to handle `/sessions` path matching.

2. **`src/app/components/layout/simple-navigation.tsx`**
   - Add `HistoryIcon` import.
   - Add "My Sessions" icon link in the desktop logged-in nav bar, between My Events and My Profile.
   - Add "My Sessions" to the `NavigationMenuItems` dropdown via `navigation-menu-items.tsx` (or directly in `simple-navigation.tsx` for the icon-link row).

3. **`src/app/components/layout/navigation-menu-items.tsx`**
   - Import `HistoryIcon`.
   - Add "My Sessions" `DropdownMenuItem` and mobile `Link` inside the `{!inActiveSession && (...)}` block, so it is automatically hidden during active sessions on desktop and in the mobile top-nav dropdown.

4. **`src/app/components/partners/live-mode-view.tsx`**
   - Remove the `SessionHistoryList` render block (lines 1068–1074).
   - Remove `selectedHistoryIndex` state and `summaryStory` memo (lines 830–855) — these back the history detail view inside `/live`, which is no longer needed.
   - Update `hasScrollableContent` (line 926): change `hasContent || sessionHistory.length > 0` to just `hasContent`.
   - Remove the `RoundSummaryScreen` inline render that was triggered by `selectedHistoryIndex !== null` (line 973) if it solely served history review — confirm it is not used by other flows before removing.
   - Keep `sessionHistory` memo (line 842) if `live-mode-view` still needs it for any other purpose; otherwise remove the `useMemo` too.
   - Clean up the `SessionHistoryList` import from `'./live-content-cards'` if no other exports from that import are still needed.

5. **`src/app/pages/clarity-live-page.tsx`**
   - Write `clarity_live_active = 'true'` to `sessionStorage` when `view` transitions to `'waiting'` or `'live'` (useEffect watching `view`).
   - Clear `clarity_live_active` from `sessionStorage` when `view` returns to `'start'` or component unmounts.

6. **`src/App.tsx`**
   - Add lazy import for `MySessionsPage`.
   - Add route: `<Route path="/sessions" element={<ClarityLandingLayout><LazyRoute><MySessionsPage /></LazyRoute></ClarityLandingLayout>} />`

---

#### Build Sequence

1. **Data layer first** — Create `sessions-service.ts`. Test the query manually (Supabase Studio or a quick test file) to confirm round-count filtering from JSONB works correctly.

2. **Active-session hook** — Create `use-is-in-active-session.ts`. Wire into `ClarityLivePage` (write/clear flag). Verify sessionStorage key is set correctly when entering waiting/live states.

3. **Bottom nav update** — Add Sessions tab. Wire suppression via `useIsInActiveSession`. Verify 4-tab layout renders correctly and Sessions tab disappears during active session.

4. **Desktop nav update** — Add My Sessions icon link in `SimpleNavigation`. Add to `NavigationMenuItems` inside `!inActiveSession` block. Verify it disappears in `LiveSessionBanner` dropdown during active session.

5. **My Sessions page** — Create `my-sessions-page.tsx` with `SessionList` sub-component. Wire data fetch. Implement skeleton, empty, and error states. Add route in `App.tsx`.

6. **Session detail** — Create `SessionDetailDrawer`. Wire to row click. Test mobile sheet and desktop inline expand.

7. **Remove SessionHistoryList from `/live`** — Delete the render block and associated state from `live-mode-view.tsx`. Verify the `/live` idle screen renders correctly without history. Verify `hasScrollableContent` layout logic behaves correctly.

8. **E2E + visual QA** — Run `npm run test:e2e` for regression on nav and live flow. Run `/verify` for visual QA on mobile bottom nav and My Sessions page.

---

## Test Coverage Strategy

**What's Tested:**

- ✅ **Service mapper + filter logic (unit)** — `mapSessionFromDb()` partner name resolution (creator vs joiner perspective), zero-round filtering, null `live_state` handling, completed-only round count
- ✅ **Query scoping (integration)** — `clarity_sessions` query correctly scopes by `creator_profile_id OR joiner_profile_id`, both participants see shared session, unrelated user excluded, reverse-chronological ordering
- ✅ **User flows (E2E)** — `/sessions` page loads, empty state, auth guard redirect, session detail opens on row click, Sessions tab in mobile nav, Sessions tab hidden during active session, "THIS SESSION" block removed from `/live`
- ✅ **Accessibility (a11y)** — `<main aria-label>`, `<ul><li>` structure, session row aria-labels, keyboard activation (Enter/Space), Escape closes detail, focus restoration to triggering row, bottom nav tab label
- ✅ **Smoke** — `/sessions` loads without JS errors, unauthenticated redirect, mobile Sessions tab visible, desktop My Sessions link visible

**What's NOT Tested (rationale):**

- ❌ **RLS enforcement** — `clarity_sessions` SELECT policy is `USING (true)` (open). Application-level query filter is tested; DB-level enforcement is a security debt item noted in the spec, not introduced by P405.
- ❌ **Session detail round ratings (unit)** — Round data is read directly from `live_state.sessionHistory` JSONB; no transformation logic beyond display. Covered by E2E detail drawer test.
- ❌ **Date grouping UI** — Grouping logic is presentational (group by day). Tested via UAT visual check; not worth a separate automated test for MVP.
- ❌ **Skeleton animation** — CSS `animate-pulse` is a visual-only concern; no logic to test.
- ❌ **Drawer swipe-to-close** — Touch event simulation is unreliable in Playwright headless; covered by UAT-4.4 (manual).
- ❌ **`useIsInActiveSession` hook (unit)** — The hook wraps `sessionStorage` read/write. Simple enough that integration via E2E test (UAT-5.1) provides better coverage than a mocked unit test.

**Test Pyramid:**
```
       /\
      /  \   10 E2E tests
     /____\
    / 6 INT  \
   /__________\
  / 11 UNIT   \
 /______________\
```

**Files Generated:**
- `src/tests/sessions-service.test.ts` (11 unit tests)
- `e2e/integration/p405-sessions-data.spec.ts` (6 integration tests)
- `e2e/p405-my-sessions.spec.ts` (10 E2E tests)
- `e2e/a11y/p405-accessibility.spec.ts` (6 accessibility tests)
- `e2e/p405-smoke.spec.ts` (5 smoke tests)
- `features/uat/p405.md` (9 UAT scenario groups, ~25 scenarios)

**Total:** 38 automated tests + ~25 UAT scenarios
**Estimated run time:** ~3-4 minutes (E2E tests are the bottleneck; unit tests ~1s)
