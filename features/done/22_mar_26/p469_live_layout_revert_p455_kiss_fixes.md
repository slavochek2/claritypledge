---
status: all-done
completed_at: "2026-03-02"
type: change-request
rank: 1000007.0
changes: p468
tags:
  - redesign
  - p468
  - p455
  - live-session
  - mobile
  - layout
created_date: 2026-03-02
superseded_by: p588
test_files:
  - e2e/p469-live-layout-kiss.spec.ts
---

# P469: /live Layout — Revert P455 Reorder, KISS Space Savings

> **Redesign of:** [P468: /live Phase-Aware Layout Hierarchy](../../archive/p468_live_phase_aware_layout_hierarchy.md) (which redesigned [P455: Live Mobile Layout — Compact Story + Reorder](../5_feb_26/p455_live_mobile_layout_story_compact_reorder.md))
> **What was wrong:** P455 made two changes — a component reorder and a line-clamp-2 — neither of which worked as intended. The line-clamp-2 was a no-op because character-slice truncation already capped story text before any clamping could occur. The reorder inconsistently moved story/journey positions between phases, disorienting users who couldn't find stable UI landmarks. P468 responded by adding per-phase ordering rules on top of a broken foundation rather than addressing the root cause. The correct fix is simpler: revert both P455 changes and recover the lost screen space through targeted KISS improvements that don't touch component order.

## Problem Statement

P455 set out to solve a real problem — on 375px mobile, story card + journey card together push the primary CTA below the fold. It chose two mechanisms: reorder components (story above CTA, journey below) and compact the story card (line-clamp-2). Neither mechanism worked correctly:

**Line-clamp-2 was a no-op.** `LiveStoryCardExpanded` already had a character-slice truncation at `STORY_THRESHOLD=180`. 180 chars renders as approximately 2 lines — the same height line-clamp-2 would produce. The CSS clamp had nothing to clamp, so the "compact card" was visually identical to what existed before.

**The reorder created inconsistency.** P455 moved story above CTA for idle/action phases. But the IdleScreen already conditionally rendered the journey card at the top only when `hasRatingData === true`. After the first round, `hasRatingData` becomes true and journey reappears at top — so the actual rendered order after round 1 was still journey → story → CTA, the same as before P455. The reorder only helped in the narrow window before any rating exists. Meanwhile, for other phases it caused story/journey to swap positions between screens, creating unstable UI landmarks.

**P468 compounded the complexity.** By responding to the reorder's phase inconsistency with a per-phase ordering table, P468 added rules on top of a broken foundation. The root cause — that neither P455 mechanism worked — went unaddressed.

## Jobs To Be Done

- **Preserved from P455/P468:** User can see primary CTA without scrolling on 375px viewport
- **Preserved from P455/P468:** Story text truncates to short preview; expands on "Show more"
- **Corrected:** Component positions are stable across all /live phases — journey and story do not swap locations as the session progresses
- **New:** Journey card history is collapsed by default when multiple rounds exist — only the latest round + "Show N earlier rounds" is visible, preventing unbounded vertical growth

## Current State (after P455 + P468, before this spec)

```
IDLE — story selected, first round (no history):
Story card
[Check understanding CTA]    ← visible ✓
Speak freely

IDLE — after first round (hasRatingData = true):
Journey card                 ← appears at top
Story card
[Check understanding CTA]    ← pushed down, may be below fold
Speak freely

EXPLAIN-BACK — multiple rounds (4 rounds):
Journey card (7 rows unbounded)   ← round 0 (2 rows) + 4 explain-back rows
Story card
👂 ActionArea (icon: 80px circle)
[Rate explanation CTA]
```

Root issues visible here:
- CTA pushed off screen when journey appears
- ActionArea icon (w-20 h-20) takes 80px of vertical space
- Story threshold 180 chars shows ~2 lines but could show ~1 line
- Journey card grows unboundedly with rounds

## Root Cause

**Line-clamp-2 never fired.** `story.content.slice(0, STORY_THRESHOLD)` at `STORY_THRESHOLD=180` produces approximately 2 lines of text. Applying `line-clamp-2` to already-2-line text does nothing. The intent was to create a visible compact effect; the mechanism was redundant with the existing character slice.

Code reference: `src/app/components/partners/live-story-card-expanded.tsx`, `STORY_THRESHOLD` constant and the `displayText` slice.

**Reorder only helped before hasRatingData.** The IdleScreen renders `JourneyToUnderstanding` conditionally: `{(hasRatingData || showRatingDrawer) && <JourneyToUnderstanding ... />}`. When no rating data exists, journey is absent and CTA is naturally visible. P455's reorder only mattered after `hasRatingData` became true — but at that point, journey was re-inserted at the top of the JSX regardless of the reorder. The reorder of story/CTA below it was irrelevant to visibility.

Code reference: `src/app/components/partners/live-mode-view.tsx`, IdleScreen ~line 980: `{(hasRatingData || showRatingDrawer) && <JourneyToUnderstanding ... />}`

## Redesign

Revert P455's two changes (reorder + line-clamp-2). Recover screen space through three targeted KISS fixes that require no component repositioning:

### Fix 1 — Story threshold 180 → 100 chars

Cuts story preview from ~2 lines to ~1 line. The "Show more" toggle already exists; lowering the threshold just makes it trigger sooner.

```
Before: "She's someone I've known for years. We were on a call trying to work it out and..."  (2 lines)
After:  "She's someone I've known for years. We were on a call…"  (1 line)
                                                              Show more
```

Savings: ~1 line height (~20px).

### Fix 2 — ActionArea icon 80px → 48px

The 👂 icon circle was `w-20 h-20` (80px) with `text-3xl`. Reduced to `w-12 h-12` (48px) with `text-xl`. Padding `pt-8` → `pt-4`.

```
Before:  ┌──────────────────────┐   After:  ┌──────────┐
         │                      │           │   👂    │  48px
         │          👂          │  80px     └──────────┘
         │                      │           Rate Gosha's explanation
         └──────────────────────┘
         Rate Gosha's explanation
```

Savings: ~48px (icon) + ~16px (padding) = ~64px.

### Fix 3 — Journey card history collapse

When `explainBackRatings.length > 1`, show only:
- Round 0 (initial ratings — baseline context, always visible)
- "Show N earlier rounds" button (collapsed by default)
- Latest round (always visible)

Expanding the button reveals older rounds above the latest round (older rounds render above newer in the list — expanding goes upward, history is before the present).

```
COLLAPSED (4 rounds):                  EXPANDED:
┌────────────────────────────────┐     ┌────────────────────────────────┐
│ Gosha's journey to understand  │     │ Gosha's journey to understand  │
│ ─────────────────────────────  │     │ ─────────────────────────────  │
│ 0  Gosha's confidence  ●●●●  8 │     │ 0  Gosha's confidence  ●●●●  8 │
│    Your belief         ●●●●  6 │     │    Your belief         ●●●●  6 │
│    Show 3 earlier rounds       │     │ 1  Your belief         ●●●●  7 │
│ 4  Your belief         ●●●●  9 │     │ 2  Your belief         ●●●●  8 │
└────────────────────────────────┘     │ 3  Your belief         ●●●●  9 │
                                       │ 4  Your belief         ●●●●  9 │
                                       └────────────────────────────────┘
```

Savings: 1 round = 0 rows saved; 2 rounds = 0; 3 rounds = 1 row; 4 rounds = 2 rows. Prevents unbounded growth.

### Final layout with all fixes applied

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDLE — story selected, first round (no history)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────────────────────────────────────┐
│ 👤 Slava · 1d                           │  story card — ~1 line
│ She's someone I've known for years…     │  Show more
└─────────────────────────────────────────┘

  [Does Gosha understand you?]             ←  CTA visible ✓
  Speak freely

                                           ←  journey absent (no rating data yet)


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPLAIN-BACK — 4 rounds (collapsed history)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────────────────────────────────────┐
│ Gosha's journey to understand you       │  journey card — 3 rows (collapsed)
│ ─────────────────────────────────────── │
│ 0  Gosha's confidence  ●●●●●●●●●○  8   │
│    Your belief         ●●●●●●●○○○  6   │
│    Show 3 earlier rounds                │  ← collapsed
│ 4  Your belief         ●●●●●●●●●○  9   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ She's someone I've known for years…     │  story card — 1 line
└─────────────────────────────────────────┘

        👂  (48px)                         ←  icon reduced
  Rate Gosha's explanation

  [Rate the explanation]                   ←  CTA — visible ✓
  Speak freely
```

### Component order decision

Journey stays at top when `hasRatingData` — this is the correct semantic order. Once ratings exist, the journey card shows the result (the current numbers). Reading order: result → story context → action. This is defensible and stable — no component swapping between phases.

The CTA visibility problem is solved by the space savings (Fixes 1–3), not by repositioning.

## Predecessor Sections Superseded

| Section | P455/P468 said | Status | Replaced by |
|---------|----------------|--------|-------------|
| P455 Solution: Reorder | "Story card first (context), then CTAs/ActionArea, then Journey card (history)" | **Superseded** | Reverted — original order kept |
| P455 Technical Notes: line-clamp-2 | "`className={storyExpanded ? '' : 'line-clamp-2'}`" | **Superseded** | Reverted — character-slice only |
| P455 AC #1 | "Story card appears above CTAs in all 6 affected screens" | **Superseded** | Story card rendered below journey (original order) |
| P455 AC #2 | "Story text truncated to 2 lines when collapsed" | **Superseded** | Truncated to ~1 line via STORY_THRESHOLD=100 |
| P455 AC #3 | "Journey card appears below CTAs in all affected screens" | **Superseded** | Journey card at top when hasRatingData (semantic order) |
| P468 Governing principle table | All per-phase layout ordering rules (story→CTA→journey for idle/action, journey→badge→CTA→story for result) | **Superseded** | Single stable order: journey (when present) → story → CTA across all phases |
| P468 "What Stays the Same": line-clamp-2 | "story card remains compact (2 lines) in all phases" | **Superseded** | Compact via character-slice at 100 chars, not CSS clamp |

## What Stays the Same

- Journey card `min-h-[180px]` constraint
- "Speak freely" placement immediately below primary CTA
- Free-form idle screen (no story selected) — no change
- RatingScreen layout
- Database, API, auth logic — no changes
- P455 e2e tests that don't assert component ordering (smoke, accessibility)

## Surfaces in Scope

**In scope:**
- `src/app/components/partners/live-mode-view.tsx` — ActionArea component icon/padding, JourneyToUnderstanding history collapse
- `src/app/components/partners/live-story-card-expanded.tsx` — STORY_THRESHOLD constant

**Out of scope:**
- Component ordering in IdleScreen, RatingScreen, UnderstandingScreen — reverted to pre-P455 state, no further changes
- gap-revealed and calibrated phase layouts — these return to pre-P455 state automatically with the reorder revert
- All P455 e2e test files — ordering assertions may need review but no new test infrastructure

## Acceptance Criteria

- [ ] Story text in /live truncates at ~100 chars (roughly 1 line); "Show more" expands to full text
- [ ] ActionArea icon is 48px (w-12 h-12); was 80px (w-20 h-20)
- [ ] Journey card with 1 explain-back round: all rows visible (no collapse trigger)
- [ ] Journey card with 2+ explain-back rounds: shows round 0 + "Show N earlier rounds" button + latest round only
- [ ] Tapping "Show N earlier rounds" reveals all intermediate rounds above the latest round
- [ ] Component order is stable: journey (when present) at top, story below journey, CTA below story — same in idle, explain-back, and result phases
- [ ] On 375px viewport with 2+ explain-back rounds, primary CTA is visible without scrolling
- [ ] Free-form idle (no story selected) unchanged
- [ ] No reorder of story/journey between any two phases (no swapping)
- [ ] All existing P455 e2e tests pass

## Next Steps

Run `/dev` directly — scope is targeted (3 files touched, 3 independent KISS changes), no architectural decisions needed.

> Note: P455's e2e tests assert specific ordering (story above CTA, journey below). Those assertions now describe the wrong target state. Review `e2e/p455-live-mobile-layout.spec.ts` when running `/dev` — update ordering assertions to match the reverted + collapsed state, not the P455 layout.
