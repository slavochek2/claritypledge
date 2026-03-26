---
status: all-done
type: change-request
rank: 0.25
changes: p469
tags:
  - redesign
  - p469
  - live-session
  - mobile
  - layout
created_date: 2026-03-26T00:00:00.000Z
completed_at: 2026-03-26
flow: dev
uat_file: features/uat/p588.md
test_files:
  - e2e/p588-live-layout-sticky-cta.spec.ts
  - e2e/p588-smoke.spec.ts
  - e2e/a11y/p588-accessibility.spec.ts
---

# P588: /live Layout — Sticky CTA, Merged Header, Accordion Story, Peek Points

> **Redesign of:** [P469: /live Layout — Revert P455 Reorder, KISS Space Savings](features/done/22_mar_26/p469_live_layout_revert_p455_kiss_fixes.md)
> **Chain:** P455 → P468 (rejected) → P469 (shipped) → **P588** (this spec)
> **What was wrong:** P469 recovered space via KISS fixes (threshold 100, smaller icon, collapsed history) but kept all 4 components in a single scroll flow. On mobile, when a story has 2+ linked points and the user expands them, the CTA buttons are pushed below the viewport and behind the fixed bottom nav bar. The CTA buttons — the most critical element driving the session forward — become unreachable. The problem scales with point count: 5 linked points make the page unnavigable.

## Problem Statement

In /live result phases (gap-revealed, calibrated), the page stacks: Journey card → Story card (with expandable points) → Calibration banner → Helper text → CTA buttons → Bottom nav. On a 375px mobile viewport (~500px usable), even the collapsed state barely fits — CTA buttons sit at the bottom edge. When the user expands "N points" on the story card, the content grows by ~100px per point, pushing CTAs behind the fixed bottom nav with no way to scroll to them.

This was confirmed via screenshots (Mar 26, 12:42-12:43) showing: (1) CTA hidden behind bottom nav in collapsed state, (2) content completely cut off when points expanded, (3) wasted whitespace between Journey and Story card.

The root issue is structural: P455/P468/P469 all treated component ordering and space savings as the solution. But the problem is that **variable-height content (expandable points) and fixed-position CTA buttons are incompatible in a single scroll flow**. No amount of reordering or compacting solves the "5 expanded points" case.

## Jobs To Be Done

- **Preserved from P469:** User can see primary CTA without scrolling on 375px viewport
- **Preserved from P469:** Story text truncates to short preview; expands on "Show more"
- **Preserved from P469:** Component positions are stable across all /live phases
- **Preserved from P469:** Journey card history is collapsed by default when multiple rounds exist
- **Corrected:** CTA buttons are ALWAYS reachable regardless of how many points are expanded (0, 5, or 15)
- **Corrected:** Journey + Calibration have no wasted gap between them (tightened spacing)
- **New:** Points expand one at a time with 2-line previews (peek mode) — user sees point context without vertical blowout
- **New:** Story card accordion — story text and points list are mutually exclusive expanded sections

## Current State

**Collapsed (result phase, e.g. calibrated):**
```
Header (fixed)
─────────────────────────────
🔒 Private session

┌─ Journey card (~80px) ─────┐
│ Your confidence  ●●●●●  5  │
│ Partner's belief ●●●●●  5  │
└────────────────────────────┘
                                ← ~24px gap
┌─ Story card (~150px) ──────┐
│ 👤 Author · date           │
│ "Story text truncated..."  │
│ Show more                  │
│ > 2 points                 │
└────────────────────────────┘

[Perfectly calibrated] badge   ← ~60px
Insight text

Help X understand you better.  ← helper text
Withhold premature judgment.

[Explain back what I heard]    ← CTA BARELY VISIBLE / HIDDEN
[Speak freely]
─────────────────────────────
Bottom nav (fixed)
```

**Expanded points (2 points):**
```
...same as above but story card grows ~200px...
[CTA buttons]                  ← COMPLETELY HIDDEN behind bottom nav
```

## Root Cause

The layout uses a single scrollable container for all content. CTA buttons are inline at the bottom of the flow. The fixed bottom navigation bar (~56px) overlaps the last ~56px of content. There is no bottom padding to compensate, and no mechanism to keep CTAs visible when content grows.

Additionally:
- Journey card (~80px) and Calibration banner (~60px) are separate full-width blocks with ~24px gap — recoverable space
- Points expand inline with no height cap, pushing everything below them off-screen
- No accordion behavior — story text AND points can both be fully expanded simultaneously

Code references:
- `src/app/components/partners/live-mode-view.tsx` — `UnderstandingScreen` (~line 2800+), `JourneyToUnderstanding` (~line 1746), `ActionArea` (~line 2042)
- `src/app/components/partners/live-story-card-expanded.tsx` — inline point expansion

## Redesign

Design selected from 40 brainstormed ideas, scored on 5 weighted criteria (CTA reachability ×3, content scalability ×2, cognitive load ×2, implementation simplicity ×1, visual coherence ×1). Winning hybrid scored 40/45.

### Change 1 — Hide BottomNav on /live, Red "End Session" Button

Add `/live` to the `focusRoutes` array in `bottom-nav.tsx` so the global BottomNav is hidden during live sessions. This recovers ~98px (64px nav + 34px safe area) of viewport space.

Since users lose the BottomNav as their navigation exit, make the "End Session" button in the header a red filled button (`bg-red-500 text-white`) so it's an obvious exit affordance.

### Change 2 — Sticky Bottom CTA Bar

Pin the ActionArea (helper text + CTA buttons) to the actual bottom of the viewport with safe-area insets. No BottomNav to clear — the sticky bar IS the bottom element.

**Implementation strategy:** Add a `sticky` prop to the `ActionArea` component (default `true`). When `sticky={true}`, ActionArea renders with `fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border pb-[env(safe-area-inset-bottom)]`. When `sticky={false}`, it renders inline as today. Pass `sticky={false}` for: perfect celebration phase, free-form idle (no story). All other phases use the default `sticky={true}`.

**ActionArea is used 10+ times** across IdleScreen, UnderstandingScreen phases, and other sub-components. The prop approach means each call site opts in by default — no wrapper needed at each site.

**"Speak freely" and other elements outside ActionArea:** On IdleScreen, "Speak freely" button, StorySearchPicker, and SessionHistoryList currently render OUTSIDE ActionArea. These must remain in the scroll area (not in the sticky bar). Only ActionArea's own children (title + primary CTA buttons) go in the sticky bar. "Speak freely" must be moved INSIDE ActionArea's children on all screens where it currently renders outside.

```
┌─────────────────────────────┐
│ Scrollable content area     │
│ (journey, calibration,      │
│  story, points,             │
│  StorySearchPicker,         │
│  SessionHistoryList)        │
├─────────────────────────────┤ ← sticky boundary
│ Help X understand you       │ ← fixed, always visible
│ [Explain back] [Speak free] │
│        [safe-area]          │
└─────────────────────────────┘
```

### Change 3 — Move Calibration Banner Above Story Card, Tighten Spacing

Currently the calibration banner renders BELOW the story card, between story and ActionArea. Move it to render directly after the Journey card, before the story card. This groups the result (dots + interpretation) together, with the story as reference context below.

**Implementation note:** The calibration banner is NOT a component — it is duplicated inline JSX in two separate phase branches:
- **Gap-revealed phase** (~line 2824): `<div className="border-blue-200 bg-blue-50 ...">` with blue pill badge
- **Calibrated phase** (~line 2961): `<div className="border-input bg-muted/50 ...">` with green pill badge

Both blocks must be relocated. Moving one and missing the other is the most likely implementation error.

Also remove the ~24px gap between Journey and Calibration. The vertical stack becomes:

Journey card → Calibration banner (tight, no gap) → Story card

### Change 4 — Accordion Story Card

Story text and points list are mutually exclusive expanded sections. When points expand, story text auto-collapses to author line + first sentence. When story text expands (Show more), points collapse to "N points" summary.

```
STORY EXPANDED:                 POINTS EXPANDED:
┌────────────────────────┐     ┌────────────────────────┐
│ 👤 Author · date       │     │ 👤 Author · date       │
│ Full story text here   │     │ "First sentence..."    │  ← collapsed
│ that spans multiple    │     │ ˅ 3 points             │
│ lines when expanded... │     │  Point 1 preview...    │
│ ^ 3 points             │     │  Point 2 preview...    │  ← peek mode
└────────────────────────┘     │  Point 3 preview...    │
                               └────────────────────────┘
```

### Change 5 — Peek Mode for Points

Each linked point shows a 2-line preview (author + first line of position text + tags). Tapping a point expands it inline; siblings auto-collapse (one expanded at a time).

```
COLLAPSED:                      ONE EXPANDED:
˅ 3 points                     ˅ 3 points
  👤 Alice · Disagrees          ▸ 👤 Alice · Disagrees
  "If someone can't just..."     "If someone can't just trust
  👤 Bob · Agrees                 you, no amount of process
  "This resonates with..."       will fix that. Trust is the
  👤 Carol · Neutral              foundation..." #trust #st8
  "I see both sides..."         👤 Bob · Agrees
                                "This resonates with..."
                                👤 Carol · Neutral
                                "I see both sides..."
```

### Final Layout (all changes applied)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CALIBRATED — 3 points, story collapsed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[C] Clarity Pledge        [End Session]  ← red filled button
    🔒 Private session

┌─ Journey card ────────────────────────┐
│ Your journey to understand Vyacheslav │
│ Your confidence    ●●●●●●●○○○  5     │
│ Vyacheslav's belief ●●●●●○○○○○  5    │
└───────────────────────────────────────┘
┌─ Calibration banner ─────────────────┐  ← tight, no gap from journey
│ [✓ Perfectly calibrated]             │
│ Vyacheslav believes you understand   │
│ exactly as much as you think         │
└───────────────────────────────────────┘

┌─ Story card (accordion) ──────────────┐
│ 👤 Vyacheslav · Mar 17                │
│ "I had fourteen co-founders..."       │  ← 1 line (auto-collapsed)
│ ˅ 3 points                            │
│   👤 Alice · Disagrees                │  ← peek
│   "If someone can't just..."          │
│   👤 Bob · Agrees                     │
│   "This resonates with..."            │
│   👤 Carol · Neutral                  │
│   "I see both sides..."              │
└───────────────────────────────────────┘

    ← spacer (height of sticky bar)

┌─ Sticky CTA bar ─────────────────────┐
│ Help Vyacheslav understand you        │
│ [Explain back what I heard]           │
│ [Speak freely]                        │
│         [safe-area]                   │
└───────────────────────────────────────┘
                                         ← NO BottomNav on /live
```

**With 5 points expanded (worst case):** Page scrolls within the content area. Sticky CTA bar remains visible at bottom (no BottomNav competing). Each point is 2 lines (~40px), so 5 points = ~200px — fits with scrolling. One expanded point adds ~60px more. Total never exceeds what the scroll area can handle because only one point expands at a time.

## Predecessor Sections Superseded

| Section | P469 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Problem Statement | "Neither mechanism worked correctly" (re: P455 reorder + line-clamp) | **Extended** | P469's fixes were correct but insufficient — variable-height points still push CTA off-screen |
| Redesign: "CTA visibility problem is solved by space savings, not repositioning" | Single scroll flow with KISS space savings | **Superseded** | CTA pinned via sticky positioning; space savings alone can't solve expandable points |
| AC #6 | "Component order is stable: journey at top, story below, CTA below story" | **Superseded** | CTA is now sticky at bottom, not inline below story |
| AC #7 | "On 375px viewport with 2+ explain-back rounds, primary CTA is visible without scrolling" | **Superseded** | CTA visible via sticky bar, not via fitting in viewport |
| What Stays the Same: Journey card min-h-[180px] | Preserved | **Preserved** | Journey card kept as-is (no merge), calibration stays separate |

## Requirements

1. BottomNav must be hidden on `/live` routes (add to `focusRoutes`)
2. "End Session" button must be red filled (`bg-red-500 text-white`) as the primary exit affordance
3. CTA buttons (ActionArea) must be visible and tappable at all times during a /live session, regardless of scroll position or expanded content
4. Journey card and Calibration banner remain separate components but with no gap between them
5. Story card must implement accordion: story text and points list cannot both be fully expanded simultaneously
6. Each point in the expanded list must show a 2-line preview; only one point may be fully expanded at a time
7. Bottom padding must account for the sticky CTA bar to prevent content overlap
8. iOS Safari safe-area insets must be handled (`env(safe-area-inset-bottom)`) on the sticky CTA bar
9. ActionArea emoji icons (`🎤`, `👂`) must be hidden when in sticky mode to save vertical space
10. RatingScreen keeps its existing inline ActionArea (no sticky) — BottomNav hidden is the only change affecting it

## What Stays the Same

- Story card character threshold (STORY_THRESHOLD=100 from P469)
- ActionArea icon size (48px from P469)
- Journey card history collapse (from P469) — still applies within the journey card
- "Speak freely" placement immediately below primary CTA
- Free-form idle screen (no story selected)
- Database, API, auth logic — no changes
- Component order stability principle (from P469) — journey content still at top, story below, CTA at bottom
- All phase-specific rendering logic (gap-revealed vs calibrated vs idle)

## Surfaces in Scope

**In scope:**
- `src/app/components/partners/live-mode-view.tsx` — ActionArea sticky positioning, scroll container padding, tighten Journey→Calibration gap, "End Session" button red styling
- `src/app/components/partners/live-story-card-expanded.tsx` — accordion behavior (mutual exclusion of story text / points), peek mode for points (2-line preview, one-at-a-time expand)
- `src/app/components/layout/bottom-nav.tsx` — add `/live` to `focusRoutes` array
- `src/app/components/partners/live-session-banner.tsx` — "End Session" button styling (red filled)

**Out of scope:**
- IdleScreen free-form layout (no story)
- RatingScreen layout
- Database, API, auth, edge functions
- Bottom nav component itself
- LiveSessionBanner layout/structure (End Session button styling IS in scope)
- Story content or point data fetching

## Acceptance Criteria

- [ ] BottomNav is hidden on all `/live` routes
- [ ] "End Session" button in header is red filled (`bg-red-500 text-white`)
- [ ] CTA buttons (ActionArea) are pinned to bottom of viewport, always visible in all /live phases
- [ ] CTA buttons remain visible when story card points are expanded (0, 2, 5+ points)
- [ ] Journey card and Calibration banner appear as separate blocks with no gap between them
- [ ] Story text auto-collapses when points are expanded; points collapse when story is expanded (accordion)
- [ ] Each point shows a 2-line preview in collapsed state
- [ ] Only one point can be fully expanded at a time; expanding one collapses the previously expanded point
- [ ] Content area scrolls freely when content exceeds viewport
- [ ] Bottom padding prevents content from being hidden behind sticky CTA bar
- [ ] iOS Safari safe-area handled on sticky CTA bar (no overlap with home indicator)
- [ ] Surfaces NOT in scope are visually unchanged
- [ ] All existing tests for P469 still pass
- [ ] Free-form idle (no story selected) unchanged

## UX Design

### Key Decision: Hide BottomNav on /live

The global `BottomNav` renders on `/live` routes (`fixed bottom-0 z-50`, `h-16` + safe-area padding). Current /live content has **zero bottom padding** — this is the direct cause of CTA buttons being hidden behind it.

**Decision:** Hide BottomNav on `/live` by adding it to `focusRoutes` in `bottom-nav.tsx`. This recovers ~98px and lets the sticky CTA bar sit at `bottom-0` with its own safe-area padding. The "End Session" button (red filled) provides the exit affordance.

---

### User Flow: Sticky CTA Bar

**Entry:** User enters any /live phase where ActionArea is rendered (all phases except `perfect` celebration).

**Interaction:**
1. Page loads → ActionArea renders as sticky bar at viewport bottom (with `pb-[env(safe-area-inset-bottom)]`)
2. User scrolls content (journey, calibration, story, points) → CTA bar stays pinned
3. User taps CTA → action fires (explain-back, rate, etc.) → phase transitions
4. "Speak freely" secondary button sits immediately below primary CTA inside the sticky bar

**Sticky bar content varies by phase:**

| Phase | Title | Primary CTA | Secondary |
|-------|-------|-------------|-----------|
| idle (owner) | "Help {partner} understand you better." | "Does {partner} understand you?" | "Do you understand {partner}?" |
| idle (reviewer) | — | — (no CTA for reviewer) | — |
| waiting | WaitingIndicator | — | "Speak freely" |
| gap-revealed (listener) | "Help {checker} understand you better.\nWithhold premature judgment." | "Explain back what I heard" | "Speak freely" |
| calibrated (listener) | Same as gap-revealed | "Explain back what I heard" | "Speak freely" |
| explain-back (listener) | "Explain back what you heard" | "I'm done with active listening" | "Speak freely" |
| explain-back (checker) | "Rate {partner}'s explanation" | "[Rate the explanation]" | "Speak freely" |
| results | Varies by clarification sub-phase | Varies | "Speak freely" |

**No icon in sticky bar** — icons (`🎤`, `👂`) are dropped from the sticky bar to save ~52px height. The title text already conveys context.

**Sticky bar layout (375px mobile):**
```
┌─────────────────────────────────────┐
│  Help Vyacheslav understand you     │  ← title (text-sm, center)
│  better. Withhold premature         │
│  judgment.                          │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  Explain back what I heard  │    │  ← primary (full-width btn)
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │      Speak freely           │    │  ← secondary (ghost btn)
│  └─────────────────────────────┘    │
│           [safe-area]               │
└─────────────────────────────────────┘
                                       ← NO BottomNav
```

**Height estimate:** Title (~40px) + primary button (~44px) + secondary button (~44px) + padding (~16px) + safe-area (~34px) = **~178px** for the sticky bar.

On 667px viewport (iPhone SE): ~489px remaining for scroll content. Journey (~80px) + calibration (~60px) + story card (~100px) = ~240px → ~249px breathing room. Comfortable.

---

### User Flow: "End Session" Button

With BottomNav hidden, users need a clear way to leave the /live session.

**Current:** "End Session" button in the header bar, styled as a red outline button (`text-destructive border-destructive`). Visible but not filled.

**Redesign:** `bg-red-500 text-white font-medium rounded-lg px-3 py-1.5` — red filled button, unmistakable exit affordance. Same position (header, right side).

```
[C] Clarity Pledge         [End Session]  ← red filled
    🔒 Private session
```

---

### User Flow: Journey + Calibration (Separate, Tight)

Journey card and Calibration banner stay as separate components. Two changes: (1) move calibration banner from after the story card to directly after the journey card, (2) remove the gap between them.

```
┌─ Journey card ────────────────────────┐
│ Your journey to understand Vyacheslav │
│ Your confidence    ●●●●●●●○○○  7     │
│ Vyacheslav's belief ●●●●●○○○○○  5    │
└───────────────────────────────────────┘  ← no gap (margin-0)
┌─ Calibration banner ─────────────────┐
│ [3 point gap]                        │
│ You think Vyacheslav understands     │
│ less than they think                 │
└───────────────────────────────────────┘
```

**States:**
- **No calibration yet** (waiting, explain-back before results): Journey card only, no calibration banner
- **Gap detected**: Blue badge + insight text
- **Perfectly calibrated**: Green badge + insight text
- **Perfect (checker rated 10)**: Celebration screen, neither component shown in this layout

---

### User Flow: Accordion Story Card

**States:**

**A. Default state (page loads):**
```
┌─ Story card ─────────────────────┐
│ 👤 Vyacheslav · Mar 17  🌐      │  ← author row
│ "I had fourteen co-founders..."  │  ← truncated (100 chars)
│  Show more                       │  ← text toggle
│ ▸ 2 points                       │  ← points collapsed
└──────────────────────────────────┘
```
Story text is truncated (existing behavior). Points are collapsed (existing behavior). This is the initial state — no accordion conflict.

**B. User taps "Show more" (story expands):**
```
┌─ Story card ─────────────────────┐
│ 👤 Vyacheslav · Mar 17  🌐      │
│ "I had fourteen co-founders.     │
│  Nine separations. None of us    │
│  wanted them. Most of the        │
│  friction was unnecessary..."    │  ← full text
│  Show less                       │
│ ▸ 2 points                       │  ← stays collapsed
└──────────────────────────────────┘
```
Points stay collapsed. Story is fully visible.

**C. User taps "2 points" (points expand, story collapses):**
```
┌─ Story card ─────────────────────┐
│ 👤 Vyacheslav · Mar 17  🌐      │
│ "I had fourteen co-founders..."  │  ← auto-collapsed back to truncated
│  Show more                       │
│ ˅ 2 points                       │  ← expanded
│  ┌─ Point peek ───────────────┐  │
│  │ 👤 Alice · Disagrees+      │  │  ← 2-line preview
│  │ "If someone can't just..." │  │
│  └────────────────────────────┘  │
│  ┌─ Point peek ───────────────┐  │
│  │ 👤 Bob · Agrees            │  │
│  │ "This resonates with..."   │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```
Story auto-collapses to truncated state. Points show peek previews.

**D. User taps a point peek (one point expands, siblings stay collapsed):**
```
│ ˅ 2 points                       │
│  ┌─ Point EXPANDED ───────────┐  │
│  │ 👤 Alice · Disagrees+      │  │
│  │ "If someone can't just     │  │
│  │  trust you, no amount of   │  │
│  │  process will fix that.    │  │  ← full position text
│  │  Trust is the foundation"  │  │
│  │  #misunderstanding #st8    │  │  ← tags
│  └────────────────────────────┘  │
│  ┌─ Point peek ───────────────┐  │
│  │ 👤 Bob · Agrees            │  │  ← still collapsed
│  │ "This resonates with..."   │  │
│  └────────────────────────────┘  │
```

**E. User taps "Show more" while points are expanded:**
Points collapse back to "2 points" summary. Story expands. Mutual exclusion.

**Transition behavior:** No animation for MVP — instant swap. Animation (height transition) can be added later if the instant swap feels jarring.

---

### User Flow: Peek Mode for Points

**Point peek card layout (each point, collapsed):**
```
┌───────────────────────────────────┐
│ 👤 Alice Ladischenski · Disagrees+│  ← author + stance badge
│ "If someone can't just trust..."  │  ← first line of position, truncated
└───────────────────────────────────┘
```

**Point expanded (tapped):**
```
┌───────────────────────────────────┐
│ 👤 Alice Ladischenski · Disagrees+│
│ "If someone can't just trust      │
│  you, no amount of process will   │
│  fix that. Trust is the           │
│  foundation of everything."       │  ← full position text
│  #misunderstanding #st8           │  ← tags row
│                                   │
│  [PositionButtons disabled]       │  ← existing compact buttons (view only in /live)
└───────────────────────────────────┘
```

**Interaction rules:**
- Tap collapsed point → expands it, collapses any other expanded point
- Tap expanded point → collapses it (all points in peek mode)
- Points list header ("N points") tap → collapses all points AND triggers accordion (story re-expands)
- No swipe gestures — tap only

---

### Screen Designs: All /live Phases with New Layout

**Phase: idle (story selected, owner, no history)**
```
[C] Clarity Pledge    [End Session]  ← red filled
    🔒 Private session

┌─ Story card (default) ───────────┐
│ 👤 Vyacheslav · Mar 17  🌐      │
│ "I had fourteen co-founders..."  │
│  Show more                       │
│ ▸ 2 points                       │
└──────────────────────────────────┘

        (no journey — no rating data yet)

┌─ Sticky CTA bar ─────────────────┐
│ [Does Gosha understand you?]     │
│ [Do you understand Gosha?]       │
│         [safe-area]              │
└──────────────────────────────────┘
```

**Phase: idle (story selected, after round 1, history visible)**
```
Header (red End Session)

┌─ Journey card ───────────────────┐
│ Your journey to understand V.    │
│ Your confidence    ●●●●●●● 7    │
│ V.'s belief        ●●●●● 5      │
└──────────────────────────────────┘
┌─ Calibration banner ─────────────┐  ← tight, no gap
│ [3 point gap] You think V.       │
│   understands less than they...  │
└──────────────────────────────────┘

┌─ Story card ─────────────────────┐
│ 👤 Vyacheslav · Mar 17          │
│ "I had fourteen co-founders..."  │
│ ▸ 2 points                       │
└──────────────────────────────────┘

┌─ Sticky CTA bar ─────────────────┐
│ [Does Gosha understand you?]     │
│ [Do you understand Gosha?]       │
│         [safe-area]              │
└──────────────────────────────────┘
```

**Phase: gap-revealed (listener view, 3 points expanded)**
```
Header (red End Session)

┌─ Journey card ───────────────────┐
│ Gosha's journey to understand you│
│ Gosha's confidence  ●●●●● 5     │
│ Your belief         ●●●●●●●● 8  │
└──────────────────────────────────┘
┌─ Calibration banner ─────────────┐
│ [3 point gap] You think Gosha    │
│   understands less than they...  │
└──────────────────────────────────┘

┌─ Story card (accordion: points) ─┐
│ 👤 Vyacheslav · Mar 17          │
│ "I had fourteen co-founders..."  │  ← auto-collapsed
│ ˅ 3 points                       │
│  👤 Alice · Disagrees+           │  ← peek
│  "If someone can't just..."      │
│  👤 Bob · Agrees                 │
│  "This resonates with..."        │
│  👤 Carol · Neutral              │
│  "I see both sides..."           │
└──────────────────────────────────┘

    ← content scrolls if needed

┌─ Sticky CTA bar ─────────────────┐
│ Help Gosha understand you better │
│ Withhold premature judgment.     │
│ [Explain back what I heard]      │
│ [Speak freely]                   │
│         [safe-area]              │
└──────────────────────────────────┘
```

**Phase: calibrated (same layout, green badge)**
```
(same as gap-revealed but:)
│ [✓ Perfectly calibrated]         │  ← green badge
│ Gosha believes you understand    │
│ exactly as much as you think     │
```

**Phase: waiting (user submitted, partner hasn't)**
```
Header (red End Session)

┌─ Journey card (sealed-bid) ──────┐
│ Your journey to understand V.    │
│ Your confidence    ●●●●●●● 7    │
│ V.'s belief        ○○○○○○○○○○ ? │  ← hidden until both submit
└──────────────────────────────────┘

┌─ Story card ─────────────────────┐
│ 👤 Vyacheslav · Mar 17          │
│ "I had fourteen co-founders..."  │
│ ▸ 2 points                       │
└──────────────────────────────────┘

┌─ Sticky CTA bar ─────────────────┐
│ [⏳ Waiting for Gosha...]        │
│ [Speak freely]                   │
│         [safe-area]              │
└──────────────────────────────────┘
```

**Phase: explain-back (listener active listening)**
```
(journey + story cards above, scrollable)

┌─ Sticky CTA bar ─────────────────┐
│ Explain back what you heard      │
│ or ask a clarifying question     │
│ [I'm done with active listening] │
│ [Speak freely]                   │
│         [safe-area]              │
└──────────────────────────────────┘
```

**Phase: explain-back (checker — rating partner's explanation)**
```
(journey + story cards above, scrollable)

┌─ Sticky CTA bar ─────────────────┐
│ Rate Gosha's explanation         │
│ [Rate the explanation]           │
│ [Speak freely]                   │
│         [safe-area]              │
└──────────────────────────────────┘
```

**Phase: results (post explain-back)**
```
(journey + story cards above, scrollable)

┌─ Sticky CTA bar ─────────────────┐
│ [content varies by clarification │
│  sub-phase — follows existing    │
│  ActionArea content, no layout   │
│  change beyond sticky positioning│
│ [Speak freely]                   │
│         [safe-area]              │
└──────────────────────────────────┘
```
Results phase sticky bar follows existing ActionArea content — no layout change beyond sticky positioning.

**Phase: perfect (celebration) — NO STICKY BAR**
```
Header (red End Session)

        🎉
  Perfectly understood!

┌─ Journey (success variant) ──────┐
│ (green bg, celebration style)    │
└──────────────────────────────────┘

  [Continue]                        ← inline, not sticky (special phase)
```
The `perfect` phase is a celebration screen — no sticky bar needed. CTA is a single "Continue" button centered on screen.

**Phase: idle (free-form, no story) — MINIMAL CHANGE**
```
Header (red End Session)

  [Does Gosha understand you?]     ← inline, centered (no sticky needed)
  [Do you understand Gosha?]
```
No story card, no journey (no data). Simple centered layout. Sticky bar not applicable — there's no content that could push CTAs off screen.

---

### Edge Cases

**0 points on story:**
- "N points" toggle not rendered. Story card is just author + text + "Show more". No accordion conflict.

**1 point:**
- "1 point" toggle shown. Expanding shows single point peek. No accordion needed (single point doesn't push content significantly), but accordion still fires for consistency.

**5+ points (worst case):**
- 5 peek previews = 5 × ~48px = ~240px. With collapsed story text (~60px) + author row (~40px) = ~340px. Fits in the scroll area (~425px on iPhone SE). User scrolls through points. Expanding one point adds ~60px more — still fits.

**15+ points (extreme edge):**
- Scroll area handles it. Sticky bar stays pinned. The content just scrolls further.

**Story with no text (edge):**
- Story card shows author row + "N points" only. No truncation toggle. Accordion between text/points not applicable — points expand freely.

**Partner adds a point during session:**
- Story card's `story.points.length` updates via real-time subscription. The "N points" count updates. If points are collapsed, only the count changes. If expanded, new point appears at end of peek list (no forced collapse).

**Session history (multiple rounds):**
- Journey card's existing collapse behavior (from P469) still applies. "Show N earlier rounds" button handles 3+ rounds.

**Loading state:**
- No new loading state needed. Journey and story data are already loaded when the phase renders. The sticky bar renders with the phase content — no separate loading.

**Transition between phases:**
- When phase changes (e.g., gap-revealed → explain-back), the sticky bar content updates instantly. Accordion state resets to default (story truncated, points collapsed) on phase change. This prevents stale expanded state from a previous phase carrying over.

---

### Accessibility

**Sticky CTA bar:**
- `role="region"` with `aria-label="Session actions"`
- CTA buttons already have accessible names (existing ActionArea behavior)
- Tab order: scrollable content first, then sticky bar buttons. Use `tabindex` if needed to ensure the primary CTA is the first focusable element after the scroll area.

**Accordion story card:**
- "Show more" / "Show less" already has `aria-expanded` (existing)
- "N points" toggle already has `aria-expanded={isExpanded}` (existing)
- Add `aria-label="Expand points list"` to the toggle
- When accordion auto-collapses story text on points expand: announce via `aria-live="polite"` region — "Story text collapsed, showing N points"

**Peek points:**
- Each point peek is a `button` with `aria-expanded` (collapsed/expanded)
- Expanded point includes full text — screen reader reads it naturally
- On expand: focus moves to the expanded point content
- On collapse: focus returns to the point toggle button

**Keyboard navigation:**
- Tab through: scroll content → sticky bar title → primary CTA → secondary CTA
- Enter/Space on "N points" → expands points (collapses story)
- Enter/Space on point peek → expands that point
- Escape while a point is expanded → collapses it

**Color contrast:**
- Green "Perfectly calibrated" badge: white text on green-500 (#22c55e) → 3.15:1 against white. **Below WCAG AA for small text (4.5:1).** Use green-700 (#15803d) for the badge background to achieve 4.64:1.
- Blue "N point gap" badge: white text on blue-500 (#3b82f6) → 3.01:1. **Below WCAG AA.** Use blue-700 (#1d4ed8) for 5.83:1.
- Pre-existing issue — **out of scope for P588**. Fix separately if desired.

---

### Responsive Design

**Mobile (320px-767px) — Primary target:**
- BottomNav hidden on /live. Sticky CTA bar full-width at viewport bottom.
- Journey card + calibration banner span full width
- Story card spans full width
- Single column layout throughout

**Tablet (768px-1023px):**
- Same layout as mobile — /live is a focused conversation view, not a dashboard
- Sticky bar may have slightly more horizontal padding

**Desktop (1024px+):**
- BottomNav is already hidden (`lg:hidden`), so the /live focusRoutes change has no desktop effect
- Sticky CTA bar at `bottom-0`, centered to `max-w-sm` for consistency with current ActionArea width
- Keep sticky on all viewports for consistency — it's simpler and correct regardless

---

### Challenge Notes

**Challenge: Sticky bar height on small phones.**

The sticky CTA bar alone (no BottomNav) consumes ~178px on iPhone (title + 2 buttons + safe-area). On 667px viewport (iPhone SE): ~489px for content. Journey (~80px) + calibration (~60px) + story card (~100px) = ~240px → ~249px breathing room. Comfortable.

On smallest viewport (320px width, ~480px height): ~302px for content. Still fits the core components with room for 2-3 peek points.

**Recommendation:** Accept. The math works better now that BottomNav is hidden.

**Challenge: ActionArea icon in sticky bar.**

Some phases render an emoji icon (`🎤`, `👂`) inside ActionArea as a 48px circle. In the sticky bar, this adds ~64px of height.

**Recommendation:** Remove the icon from the sticky bar. Saves ~52px. The title text is sufficient. This is a viewport space vs. decoration trade-off — space wins on mobile.

## Test Coverage Strategy

**What's Tested:**
- ✅ BottomNav hidden on /live (E2E + smoke) — Change 1
- ✅ End Session red filled button (E2E + smoke) — Change 1
- ✅ Sticky CTA always visible: on load, after expand, after scroll (E2E) — Change 2
- ✅ Calibration banner DOM position: after journey, before story (E2E) — Change 3
- ✅ Accordion mutual exclusion: expand points → story collapses, expand story → points collapse (E2E) — Change 4
- ✅ Peek mode: 2-line preview, one-at-a-time expand, PositionButtons visible (E2E) — Change 5
- ✅ Free-form idle unchanged (E2E regression)
- ✅ Keyboard navigation: Tab/Enter/Escape for points and CTA (a11y)
- ✅ ARIA: region role, aria-expanded, aria-live announcements (a11y)
- ✅ Page loads without errors (smoke)

**What's NOT Tested (rationale):**
- ❌ Unit tests — no new utility functions or business logic; all changes are component layout/interaction
- ❌ Integration tests — no DB/API/auth changes
- ❌ iOS Safari safe-area rendering — requires real device; verified via UAT-11.1 manual check
- ❌ Multi-user live session flow — existing session tests cover this; P588 only changes layout, not session logic
- ❌ Phase transition state reset — implementation detail; covered implicitly by E2E phase-specific tests

**Test Pyramid:**
```
      /\
     /  \    12 E2E tests
    /    \
   /──────\
  / 5 A11Y \
 /──────────\
/ 3 SMOKE    \
```

**Files:**
- `e2e/p588-live-layout-sticky-cta.spec.ts` — 12 E2E tests (5 changes + regression)
- `e2e/p588-smoke.spec.ts` — 3 smoke tests
- `e2e/a11y/p588-accessibility.spec.ts` — 5 accessibility tests
- `features/uat/p588.md` — 27 UAT scenarios

**Total:** 20 automated tests + 27 UAT scenarios
