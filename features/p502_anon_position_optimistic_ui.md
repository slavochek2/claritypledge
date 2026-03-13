---
status: week
type: story
rank: 3
flow: dev
workstream: C2
tags:
  - auth
  - anonymous
  - position
  - conversion
  - embed
  - ux
prepped_date: '2026-03-13'
delivery_stage: 4-tests-ready
reviews:
  ux: null
  architect: null
  alignment: null
predecessor: p458
uat_file: features/uat/p502.md
test_files:
  - src/tests/p502-anon-position.test.ts
  - e2e/p502-anon-position-optimistic.spec.ts
  - e2e/p502-smoke.spec.ts
  - e2e/a11y/p502-accessibility.spec.ts
---

# P502 — Gentle Anonymous Position UX (Optimistic UI + Inline CTA)

## Problem Statement

### Current State

P458 shipped an auth gate that redirects anonymous users to `/signup` when they click a position button (Agree/Disagree/Unsure). The redirect preserves context (point ID, position, redirect URL) and auto-saves the position after signup.

### Pain Points

- **Aggressive redirect kills engagement.** The user expressed interest in a single interaction (clicking a button) and gets immediately ripped away from the content to a signup page. Most users bounce.
- **Embed visitors leave the blog.** On the Ghost blog, clicking a position redirects away from the article entirely. The user may never return.
- **5-step funnel between intent and result.** Click position → see signup → enter email + name → check email → click magic link → position saved. Too many steps for a low-commitment interaction.
- **Inconsistent with `/live` session.** P490 already lets guests set positions ephemerally in live sessions with a soft "sign up to save it" hint. The feed and detail pages use an aggressive redirect instead.

### Who's Affected

- Anonymous visitors browsing the feed or point detail pages
- Embed viewers on the Ghost blog (key distribution channel)
- Potential signups who abandon due to friction

## Intention (Why This Matters)

**Strategic importance:** Position-taking is the primary engagement action. Making it frictionless for anonymous users increases both engagement (more people interact) and conversion quality (users who sign up after experiencing the product are higher-intent).

**Why now:** Embed distribution on the Ghost blog is active. Every anonymous visitor who clicks a position and bounces from the signup page is a lost conversion opportunity.

**Impact if not solved:** Embeds remain passive (read-only for anonymous visitors). Conversion funnel stays at 5 steps. The product's core interaction (taking a position) is gated behind account creation, contradicting the transparency ethos.

## Business Requirements

### Must-Haves

- Anonymous users can visually "take" a position without an account
- Position is shown as selected (button highlighted) immediately on click
- A soft CTA appears prompting signup — not blocking, not redirecting
- Position persists across page navigation (localStorage)
- On signup, all previously-set anonymous positions are batch-saved
- Same behavior across feed, point detail, and embed contexts
- Aggregate position counts do NOT include anonymous positions (no ghost data)

### Success Conditions

- Anonymous users can interact with position buttons without leaving the page
- The CTA is visible but not intrusive (matches P490 live session pattern)
- Users who sign up after setting anonymous positions find all their positions saved

### Constraints

- No database changes (positions are client-side only until signup)
- No new API endpoints
- Must preserve existing P458 auth-gate URL infrastructure as fallback (magic links, deep links)

## User Stories

**As an anonymous visitor on the feed:**
- I want to click Agree on a point and see my position reflected, so I can express my stance without friction
- I want to see a hint about saving my position, so I understand the value of creating an account

**As an anonymous embed viewer on the blog:**
- I want to interact with position buttons inside the embed, so I can engage without leaving the article
- I want signup links to open in a new tab, so I don't lose my place in the blog

**As a returning anonymous user:**
- I want my previously-set positions to still be visible when I return to a page, so my choices feel persistent

**As a new user signing up after browsing anonymously:**
- I want all my anonymous positions saved automatically on signup, so I don't have to redo them

## Jobs to Be Done

**When I see a point I have an opinion about:**
- I want to express my stance immediately, so I can participate in the conversation (motivation: self-expression, low barrier)

**When I've taken a few positions and find value in the product:**
- I want to make my positions permanent, so I can be part of the community (motivation: commitment, identity)

**When reading a blog post with embedded points:**
- I want to interact without context-switching, so I can stay focused on the article (motivation: flow state, convenience)

## Outcomes (Success Metrics)

- **Position interaction rate** for anonymous users increases (baseline: ~0% because redirect bounces most users)
- **Signup conversion from position CTA** is measurable (new funnel: click position → see CTA → click signup)
- **Embed engagement** increases (anonymous visitors interact with position buttons)
- **Bounce rate** from signup page decreases (fewer forced redirects)

## Acceptance Criteria

- [ ] Anonymous user clicks a position button → button highlights as selected, no redirect
- [ ] Position counts do NOT increment for anonymous positions (no ghost data in aggregates)
- [ ] A text CTA appears below buttons: "Sign up or log in to save your position"
- [ ] CTA includes links to both signup and login pages with auth-gate params
- [ ] Toggling to a different position updates the highlight; CTA stays visible
- [ ] Deselecting (clicking same position again) removes highlight and hides CTA
- [ ] Anonymous position persists in localStorage across page navigation
- [ ] On page load, previously-set anonymous positions are pre-highlighted
- [ ] In embed mode, CTA links open in a new tab (not inside iframe)
- [ ] In embed mode, CTA copy includes "ClarityPledge" for brand awareness
- [ ] After signup, all anonymous positions from localStorage are batch-saved to database
- [ ] After batch-save, localStorage is cleared
- [ ] Existing P458 auth-gate URL flow still works as fallback (magic link email → auto-save)
- [ ] Logged-in users see no change in behavior

## UX Requirements

### User Flow

**Entry:** Anonymous user sees a point card (feed, detail page, or embed) with position buttons.

**Happy path:**
1. User clicks "Agree" → button highlights (emerald selected state), CTA text fades in below buttons
2. User reads CTA → optionally clicks "Sign up" or "Log in" link
3. If signup: auth-gate params carried through → positions batch-restored after auth → user returns to page with positions saved
4. If ignore: user continues browsing. Position persists in localStorage.

**Toggle path:**
1. User clicks "Agree" → button highlights, CTA appears
2. User clicks "Disagree" → Agree unhighlights, Disagree highlights, CTA stays
3. User clicks "Disagree" again → Disagree unhighlights, CTA hides (no position set)

**Return visit path:**
1. User returns to page with previously-set anon position
2. On load, localStorage is read → button pre-highlighted, CTA visible

### Screen Designs

#### Feed Card — After anon clicks "Agree"

```
+--card-clickable-area----------------------------+
| 🔵  "Remote work increases productivity         |
| Pin   for most knowledge workers"               |
|                                                  |
|     #remote-work  #productivity                  |
|                                                  |
|     [*Agree* 13] [Disagree 5] [Unsure 2]  [🔗]  |
|     Sign up or log in to save your position      |
+--------------------------------------------------+
```

- CTA sits directly below the buttons row, inside the content column (same left alignment as buttons)
- `text-xs text-gray-500` — matches P490 live hint style
- "Sign up" and "log in" are `text-blue-600 hover:text-blue-700` links
- Separator: "or" (natural language, not `·`)
- Spacing: `mt-1.5` above CTA text (tight, not a new section)
- No border-t — feed cards are compact, a border would feel heavy
- Count does NOT change (stays at 13, not 14)

#### Point Detail Page — After anon clicks "Agree"

```
+--card--------------------------------------------+
| 🔵  "Remote work increases productivity          |
| Pin   for most knowledge workers"                |
|                                                   |
|     #remote-work  #productivity                   |
|                                                   |
|     Context: Based on 2024 Stanford study...      |
|                                                   |
|     [*Agree* 13] [Disagree 5] [Unsure 2]         |
|                                                   |
+- - - - - - - - - - - - - - - - - - - - - - - - -+
| Sign up or log in to save          [Share]        |
| your position                                     |
+--------------------------------------------------+
```

- CTA in footer row (existing `border-t border-border` section)
- CTA left-aligned, ShareButton right-aligned (existing `flex justify-between` pattern)
- `text-xs text-gray-500` for plain text, `text-blue-600` for links
- Footer padding: existing `px-4 py-3`

#### Embed — After anon clicks "Agree"

```
+--card--------------------------------------------+
| 👤 Alice     [Agree badge]                       |
| ┌─quoted point──────────────────────────────────┐|
| │ 🔵 "Remote work increases productivity..."   │|
| │    [*Agree* 13] [Disagree 5] [Unsure 2]      │|
| │                                                │|
| │  Join ClarityPledge — sign up or log in       │|
| │  to save your position                         │|
| └────────────────────────────────────────────────┘|
+--------------------------------------------------+
```

- Same `text-xs text-gray-500` + `text-blue-600` links
- Copy starts with "Join ClarityPledge" for brand awareness
- "sign up" and "log in" links open in `_blank` (new tab)
- CTA sits inside the quoted point box, below PositionButtons (mirrors P490 pattern)

### Edge Cases

**No position set (default):** No CTA visible. Buttons in unselected state.

**Position set → page refresh:** localStorage read on mount → button pre-highlighted, CTA visible immediately (no flash of unselected state).

**localStorage unavailable (incognito/disabled):** Position works for current session only (component state). CTA still appears. On page refresh, position is lost. No error shown — graceful degradation.

**Multiple positions across different points:** Each point independently stores its anon position. CTA appears per-card. Batch restore on signup saves all.

**User logs in (not signup):** Same batch-restore flow. Read localStorage, save positions, clear storage.

**User already has a server-side position (logged in):** Anon flow never triggers — `user` / `session?.user` check prevents it. No conflict.

**Embed in Safari with ITP:** Safari may block localStorage in third-party iframes. Position works for current interaction only (component state). CTA links open new tab where localStorage works normally.

### Accessibility

- CTA text is part of the card's content flow — screen readers announce it naturally after position buttons
- "Sign up" and "log in" links have `role="link"` (native `<a>` tags), keyboard-focusable via Tab
- ARIA: Position buttons already have `role="group" aria-label="Your position"` — no changes needed
- Color contrast: `text-gray-500` on white = 5.4:1 (passes WCAG AA). `text-blue-600` on white = 4.8:1 (passes AA)
- Focus indicator: Default browser outline on links (consistent with existing CTA links in the app)

### Responsive Design

**Mobile (320px-767px):**
- CTA text wraps naturally — "Sign up or log in to save your position" fits in 2 lines at 320px
- Touch targets: links are inline text (not buttons), but they're spaced enough by surrounding text
- No layout change needed — CTA flows under buttons in all viewports

**Tablet + Desktop (768px+):**
- CTA text fits in a single line
- No special treatment — same as mobile layout

### Component Analysis

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| PositionButtons | **Reuse** | `src/app/prototypes/converged/components/shared/PositionButtons.tsx` — no changes. Already accepts `selectedPosition` prop. | No |
| Guest position hint (P490) | **Extend** | `src/app/components/partners/live-story-card-expanded.tsx` lines 297-304. Extract pattern into shared component. Same `text-xs text-gray-500` style but add clickable links. | No |
| GuestPositionHint (new shared) | **New** | `src/app/components/shared/guest-position-hint.tsx` — small component accepting `isEmbed`, `pointId`, `position` props. Renders CTA text with sign up / log in links. | No |
| useAnonPosition hook | **New** | `src/app/hooks/useAnonPosition.ts` — localStorage wrapper for anon position state. | No |
| Feed card CTA placement | **Extend** | `src/app/components/feed/feed-point-card.tsx` — add CTA below existing PositionButtons row. | No |
| Detail page footer | **Extend** | `src/app/pages/point-detail-page.tsx` — add CTA text to existing footer row (left side). | No |
| Point card with links | **Extend** | `src/app/components/social/point-card-with-links.tsx` — add CTA below PositionButtons inside quoted box. | No |
| AuthCallbackPage batch restore | **Extend** | `src/auth/AuthCallbackPage.tsx` — add localStorage read + batch setPosition after auth. | No |

## Test Coverage Strategy

**Files created:**
- Unit tests: `src/tests/p502-anon-position.test.ts` (5 describe blocks, ~15 tests)
- E2E tests: `e2e/p502-anon-position-optimistic.spec.ts` (10 tests across 5 describe blocks)
- Accessibility tests: `e2e/a11y/p502-accessibility.spec.ts` (3 tests)
- Smoke tests: `e2e/p502-smoke.spec.ts` (3 tests)
- UAT scenarios: `features/uat/p502.md` (7 scenarios, 12 test cases)

**Test pyramid:**
- Unit (15): localStorage hook — get, set, toggle, clear, batch, corrupted data, Safari ITP
- E2E (10): Optimistic UI flow — highlight, CTA, toggle, deselect, feed, embed, logged-in regression, persistence
- A11y (3): Keyboard focus, accessible names, button group after selection
- Smoke (3): Page loads, no errors, buttons visible

**What's tested:**
- ✅ localStorage CRUD operations (unit) — all code paths including error handling
- ✅ Optimistic UI interaction (E2E) — click → highlight + CTA, no redirect
- ✅ No ghost data (E2E) — counts unchanged for anon positions
- ✅ Toggle/deselect behavior (E2E) — CTA stays/hides correctly
- ✅ Embed mode (E2E) — branded CTA, target=_blank links
- ✅ Logged-in regression (E2E) — no CTA for authenticated users
- ✅ Persistence (E2E) — position survives page reload
- ✅ Keyboard navigation (A11y) — CTA links focusable
- ✅ Batch restore after signup (UAT) — manual verification

**What's NOT tested (rationale):**
- ❌ AuthCallbackPage batch restore (requires real signup flow — magic link email interception not feasible in E2E; covered by UAT-7)
- ❌ Cross-browser localStorage (covered by UAT manual testing)
- ❌ Component rendering internals (covered by E2E interaction tests)

## Next Steps

1. Run `/dev features/p502_anon_position_optimistic_ui.md` — implement
2. Run `/verify` on Ghost blog test post `https://blog.claritypledge.com/p/b57ec166-b393-4fc0-a537-22b9a58a34d0/` — visual QA for embeds
