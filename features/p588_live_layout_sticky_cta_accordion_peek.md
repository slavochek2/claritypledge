---
status: week
type: change-request
rank: 1000026.0
changes: p469
tags:
  - redesign
  - p469
  - live-session
  - mobile
  - layout
created_date: 2026-03-26
flow: dev
delivery_stage: 2-ux-review
---

# P588: /live Layout — Sticky CTA, Merged Header, Accordion Story, Peek Points

> **Redesign of:** [P469: /live Layout — Revert P455 Reorder, KISS Space Savings](features/done/22_mar_26/p469_live_layout_revert_p455_kiss_fixes.md)
> **Chain:** P455 → P468 (rejected) → P469 (shipped) → **P588** (this spec)
> **What was wrong:** P469 recovered space via KISS fixes (threshold 100, smaller icon, collapsed history) but kept all 4 components in a single scroll flow. On mobile, when a story has 2+ linked points and the user expands them, the CTA buttons are pushed below the viewport and behind the fixed bottom nav bar. The CTA buttons — the most critical element driving the session forward — become unreachable. The problem scales with point count: 5 linked points make the page unnavigable.

## Problem Statement

In /live result phases (gap-revealed, calibrated), the page stacks: Journey card → Calibration banner → Story card (with expandable points) → Helper text → CTA buttons → Bottom nav. On a 375px mobile viewport (~500px usable), even the collapsed state barely fits — CTA buttons sit at the bottom edge. When the user expands "N points" on the story card, the content grows by ~100px per point, pushing CTAs behind the fixed bottom nav with no way to scroll to them.

This was confirmed via screenshots (Mar 26, 12:42-12:43) showing: (1) CTA hidden behind bottom nav in collapsed state, (2) content completely cut off when points expanded, (3) wasted whitespace between Journey and Story card.

The root issue is structural: P455/P468/P469 all treated component ordering and space savings as the solution. But the problem is that **variable-height content (expandable points) and fixed-position CTA buttons are incompatible in a single scroll flow**. No amount of reordering or compacting solves the "5 expanded points" case.

## Jobs To Be Done

- **Preserved from P469:** User can see primary CTA without scrolling on 375px viewport
- **Preserved from P469:** Story text truncates to short preview; expands on "Show more"
- **Preserved from P469:** Component positions are stable across all /live phases
- **Preserved from P469:** Journey card history is collapsed by default when multiple rounds exist
- **Corrected:** CTA buttons are ALWAYS reachable regardless of how many points are expanded (0, 5, or 15)
- **Corrected:** Journey + Calibration occupy less vertical space by merging into one compact row
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
- Journey card (~80px) and Calibration banner (~60px) are separate full-width blocks — 140px for what could be ~48px merged
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

```
┌─────────────────────────────┐
│ Scrollable content area     │
│ (journey, calibration,      │
│  story, points)             │
│                             │
├─────────────────────────────┤ ← sticky boundary
│ Help X understand you       │ ← fixed, always visible
│ [Explain back] [Speak free] │
│        [safe-area]          │
└─────────────────────────────┘
```

### Change 3 — Tighten Spacing (No Merge)

Keep Journey card and Calibration banner as separate components (no merge). Remove the ~24px gap between them. Remove any extra margin between calibration banner and story card. The vertical stack is:

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
| What Stays the Same: Journey card min-h-[180px] | Preserved | **Superseded** | Journey merged with calibration into ~48px compact row |

## Requirements

1. BottomNav must be hidden on `/live` routes (add to `focusRoutes`)
2. "End Session" button must be red filled (`bg-red-500 text-white`) as the primary exit affordance
3. CTA buttons (ActionArea) must be visible and tappable at all times during a /live session, regardless of scroll position or expanded content
4. Journey card and Calibration banner remain separate components but with no gap between them
5. Story card must implement accordion: story text and points list cannot both be fully expanded simultaneously
6. Each point in the expanded list must show a 2-line preview; only one point may be fully expanded at a time
7. Bottom padding must account for the sticky CTA bar to prevent content overlap
8. iOS Safari safe-area insets must be handled (`env(safe-area-inset-bottom)`) on the sticky CTA bar

## What Stays the Same

- Story card character threshold (STORY_THRESHOLD=100 from P469)
- ActionArea icon size (48px from P469)
- Journey card history collapse (from P469) — still applies within the merged header
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
- LiveSessionBanner / header
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

### Critical Discovery: BottomNav Overlap

The global `BottomNav` renders on `/live` routes (`fixed bottom-0 z-50`, `h-16` + safe-area padding). Current /live content has **zero bottom padding** — this is why CTA buttons are hidden behind it even today. The sticky CTA bar must sit ABOVE the BottomNav, not replace it.

**Decision:** Position the sticky CTA bar at `bottom-[calc(4rem+env(safe-area-inset-bottom))]` to clear the BottomNav. This is the same pattern used by `StoryGuideChat` input bar.

---

### User Flow: Sticky CTA Bar

**Entry:** User enters any /live phase where ActionArea is rendered (all phases except `perfect` celebration).

**Interaction:**
1. Page loads → ActionArea renders as sticky bar above BottomNav
2. User scrolls content (journey, story, points) → CTA bar stays pinned
3. User taps CTA → action fires (explain-back, rate, etc.) → phase transitions
4. "Speak freely" secondary button sits immediately below primary CTA inside the sticky bar

**Sticky bar content varies by phase:**

| Phase | Icon | Title | Primary CTA | Secondary |
|-------|------|-------|-------------|-----------|
| idle (owner) | — | "Help {partner} understand you better." | "Does {partner} understand you?" | "Do you understand {partner}?" |
| idle (reviewer) | — | — | — (no CTA for reviewer) | — |
| waiting | — | WaitingIndicator | — | "Speak freely" |
| gap-revealed (listener) | 🎤 | "Help {checker} understand you better.\nWithhold premature judgment." | "Explain back what I heard" | "Speak freely" |
| calibrated (listener) | 🎤 | Same as gap-revealed | "Explain back what I heard" | "Speak freely" |
| explain-back (listener) | 🎤 | "Explain back what you heard" | "I'm done with active listening" | "Speak freely" |
| explain-back (checker) | 👂 | "Rate {partner}'s explanation" | "[Rate the explanation]" | "Speak freely" |
| results | Varies | Varies by clarification sub-phase | Varies | "Speak freely" |

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
├─────────────────────────────────────┤  ← border-t
│  🏠 Home   🎙 Start   📅   👤     │  ← BottomNav (existing)
│             [safe-area]             │
└─────────────────────────────────────┘
```

**Height estimate:** Title (~40px) + primary button (~44px) + secondary button (~44px) + padding (~16px) = **~144px** for the sticky bar. With BottomNav (64px + 34px safe-area) = **~242px total fixed area**.

On 667px viewport (iPhone SE): ~425px remaining for scroll content. Tight but workable — the merged Journey+Calibration header (~48px) + story card (collapsed ~100px) fits in ~148px, leaving ~277px of breathing room.

**Optimization:** When the phase has no icon and short title, the sticky bar is shorter (~100px). When there's no title at all (idle reviewer), it's just the buttons (~88px).

---

### User Flow: Merged Journey + Calibration Header

**Design:**
```
┌──────────────────────────────────────────────┐
│  Your journey to understand Vyacheslav       │  ← heading (text-sm)
│                                              │
│  Your confidence    ●●●●●●●○○○  7           │  ← dot row 1
│  Vyacheslav's belief ●●●●●○○○○○  5          │  ← dot row 2
│                          [3 point gap]       │  ← calibration badge (inline)
└──────────────────────────────────────────────┘
```

**Decision on calibration placement:**

The original spec proposed merging everything into one ~48px row. After examining the actual JourneyToUnderstanding component, the heading + 2 dot rows + history collapse already exist as a well-tested unit. The lean approach:

- **Keep JourneyToUnderstanding as-is** (it already has compact mode, history collapse)
- **Move calibration badge INSIDE the journey card** as a row after the dot rows, instead of a separate block below the story card
- **Remove the standalone calibration banner block** (the `<div>` with insight text)
- **Keep insight text as a subtitle** under the badge inside the journey card

This saves the full ~60px of the standalone calibration block + ~24px gap, while reusing the existing component. Total saving: ~84px.

```
BEFORE (2 blocks, ~164px):          AFTER (1 block, ~80px):
┌─ Journey (~80px) ────────┐       ┌─ Journey + Calibration ──────────┐
│ Your confidence    ●●● 7 │       │ Your journey to understand V.    │
│ V's belief         ●●● 5 │       │ Your confidence    ●●●●●●● 7    │
└──────────────────────────┘       │ V's belief         ●●●●● 5      │
    ~24px gap                      │ [3 point gap] You think V.       │
┌─ Calibration (~60px) ───┐       │   understands less than they think│
│ [3 point gap]            │       └───────────────────────────────────┘
│ Insight text...          │
└──────────────────────────┘
```

**States:**
- **No calibration yet** (waiting, explain-back): Journey card with dots only, no badge
- **Gap detected**: Blue badge `"N point gap"` + insight text row appended
- **Perfectly calibrated**: Green badge `"Perfectly calibrated"` + insight text row appended
- **Perfect (checker rated 10)**: Not applicable — `perfect` phase uses a celebration screen, not this layout

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
Header: [C] Clarity Pledge    [End Session]
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
├──────────────────────────────────┤
│ 🏠  🎙  📅  👤                   │
└──────────────────────────────────┘
```

**Phase: idle (story selected, after round 1, history visible)**
```
Header

┌─ Journey + Calibration ──────────┐
│ Your journey to understand V.    │
│ Your confidence    ●●●●●●● 7    │
│ V.'s belief        ●●●●● 5      │
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
├──────────────────────────────────┤
│ 🏠  🎙  📅  👤                   │
└──────────────────────────────────┘
```

**Phase: gap-revealed (listener view, 3 points expanded)**
```
Header

┌─ Journey + Calibration ──────────┐
│ Gosha's journey to understand you│
│ Gosha's confidence  ●●●●● 5     │
│ Your belief         ●●●●●●●● 8  │
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

┌─ Sticky CTA bar ─────────────────┐
│ Help Gosha understand you better │
│ Withhold premature judgment.     │
│ [Explain back what I heard]      │
│ [Speak freely]                   │
├──────────────────────────────────┤
│ 🏠  🎙  📅  👤                   │
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
Header

┌─ Journey (sealed-bid) ───────────┐
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
├──────────────────────────────────┤
│ 🏠  🎙  📅  👤                   │
└──────────────────────────────────┘
```

**Phase: explain-back (listener active listening)**
```
┌─ Sticky CTA bar ─────────────────┐
│ 🎤 Explain back what you heard   │
│ or ask a clarifying question     │
│ [I'm done with active listening] │
│ [Speak freely]                   │
├──────────────────────────────────┤
│ 🏠  🎙  📅  👤                   │
└──────────────────────────────────┘
```

**Phase: perfect (celebration) — NO STICKY BAR**
```
Header

        🎉
  Perfectly understood!

┌─ Journey (success variant) ──────┐
│ (green bg, celebration style)    │
└──────────────────────────────────┘

  [Continue]                        ← inline, not sticky (special phase)

┌─ BottomNav ──────────────────────┐
```
The `perfect` phase is a celebration screen — no sticky bar needed. CTA is a single "Continue" button centered on screen.

**Phase: idle (free-form, no story) — UNCHANGED**
```
Header

  [Does Gosha understand you?]
  [Do you understand Gosha?]

┌─ BottomNav ──────────────────────┐
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
- Journey card's existing collapse behavior (from P469) still applies inside the merged Journey+Calibration block. "Show N earlier rounds" button handles 3+ rounds.

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
- Existing issue — note for implementation.

---

### Responsive Design

**Mobile (320px-767px) — Primary target:**
- Sticky CTA bar full-width, above BottomNav
- Journey+Calibration merged block spans full width
- Story card spans full width
- Single column layout throughout

**Tablet (768px-1023px):**
- Same layout as mobile — /live is a focused conversation view, not a dashboard
- Sticky bar may have slightly more horizontal padding

**Desktop (1024px+):**
- BottomNav is hidden (`lg:hidden`). Sticky CTA bar becomes `fixed bottom-0` spanning full width (or centered to max-w-sm for consistency with current ActionArea width)
- Consider: on desktop, the viewport is tall enough that sticky bar may not be necessary. Could render inline on desktop and sticky on mobile only. **Recommendation:** keep sticky on all viewports for consistency — it's simpler and the behavior is correct regardless.

---

### Challenge Notes

**Challenge: Sticky bar height on small phones.**

The sticky CTA bar + BottomNav together consume ~242px on an iPhone SE (667px viewport). That leaves ~425px for content. The merged Journey card (~80px) + story card collapsed (~100px) = ~180px, leaving ~245px breathing room. This is fine.

However, on the **smallest viewport** (320px width, ~480px height — old Android phones): ~238px for content. Journey (~80px) + story (~100px) = ~180px → only ~58px breathing room. Points expansion would require scrolling immediately.

**Recommendation:** Accept this trade-off. The sticky bar's primary job (CTA always reachable) is more important than fitting everything in the initial viewport. Users on very small phones scroll naturally. The alternative (hiding the sticky bar on tiny screens) reintroduces the original bug.

**Challenge: ActionArea icon in sticky bar.**

Some phases render an emoji icon (`🎤`, `👂`) inside ActionArea as a 48px circle. In the sticky bar, this adds ~64px of height (circle + gap). Consider dropping the icon in sticky mode — the title text already conveys the context.

**Recommendation:** Remove the icon from the sticky bar. It saves ~52px of height and the icon was never essential — it was decorative. The text "Explain back what you heard" is sufficient without `🎤`.
