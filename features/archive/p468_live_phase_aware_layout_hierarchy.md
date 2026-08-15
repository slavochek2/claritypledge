---
status: rejected
type: change-request
rank: 250000.5
changes: p455
tags:
  - redesign
  - p455
  - live-session
  - mobile
  - layout
created_date: 2026-03-02T00:00:00.000Z
flow: dev
superseded_by: p469
locked_at: '2026-03-02T14:57:28.612Z'
---

# P468: /live Phase-Aware Layout Hierarchy

> **Redesign of:** [P455: Live Mobile Layout — Compact Story + Reorder](../done/5_feb_26/p455_live_mobile_layout_story_compact_reorder.md)
> **What was wrong:** P455 applied a universal "story → CTA → journey" rule across all affected /live phases without per-phase reasoning. This rule is correct for idle/action phases where the CTA is the primary action, but incorrect for result phases (gap-revealed, calibrated) where the gap badge is semantically bonded to the journey card — they form one unit (numbers + interpretation). Placing the story card between journey and badge breaks that bond and makes the result illegible on mobile.

## Problem Statement

P455 successfully solved the original mobile crowding problem: on idle/action phases, moving the story card above the CTA makes the primary action immediately visible. However, P455 explicitly marked gap-revealed, calibrated, and other result phases as "not affected" — and when those phases were later brought into scope (to complete the P455 reorder), the universal rule was applied by analogy without verifying correctness.

In result phases, the primary content is **the result itself** (journey card + gap badge). The gap badge ("3 point gap", "Perfectly calibrated") is an interpretation of the journey card numbers — visually and semantically they must appear adjacent. Inserting a story card between them forces the user to read: "confidence: 7, belief: 4" → [story card] → "3 point gap" — the badge is disconnected from the numbers it explains.

On top of this, both gap-revealed and calibrated were excluded from P455's original AC but were later touched inconsistently: some commits put story first, others put journey first, none documented the correct principle. This led to three separate "fixes" in the same area across multiple sessions.

## Jobs To Be Done

- **Preserved from P455:** User can see primary CTA without scrolling on 375px viewport (idle, waiting, explain-back phases)
- **Preserved from P455:** Story text truncates to 2 lines (compact); expands on "Show more"
- **Corrected:** In result phases (gap-revealed, calibrated), user sees journey + badge as a single unit; CTA appears below; story is scrollable reference context
- **New:** Phase-specific layout rule documented so future changes to live-mode-view.tsx can determine the correct order for any phase without case-by-case guessing

## Current State (after P455 + P400 fixes, before this spec)

**Idle/action phases (correct):**
```
Story card (compact, line-clamp-2)
[Primary CTA]
Speak freely
Journey card
```

**Gap-revealed phase (current on main — WRONG):**
```
Journey card
Story card    ← inserted between journey and badge (breaks semantic unit)
Gap badge
[Primary CTA]
```

**Calibrated phase (current on main — WRONG, same pattern):**
```
Journey card
Story card    ← same problem
Perfectly calibrated badge
[Primary CTA]
```

## Root Cause

P455 designed from the idle screen screenshot. The layout rule "story first → CTA visible" was correct for idle. When gap-revealed and calibrated were later brought into scope (post-P455 auditing), the same rule was applied by analogy: "P455 said story first, so story first."

The analogy failed because the information hierarchy differs by phase:
- **Idle/action:** CTA is primary. Story = context at top, journey = history at bottom.
- **Result phases:** The result is primary. Journey + badge = the result unit at top, CTA = what to do next, story = reference that can scroll out of view.

Code reference: `src/app/components/partners/live-mode-view.tsx`, gap-revealed phase (~line 2545), calibrated phase (~line 2683). The `{/* P400 Bug 3: journey FIRST, story SECOND */}` comment in some phases and `{/* P455: Story card moved above journey card */}` in others reflects the inconsistency — different authors, different phase reasoning, no shared principle documented.

## Redesign

### Governing principle (replace the monolithic rule)

| Phase type | Primary content | Layout order |
|------------|-----------------|--------------|
| Idle (story owner, no history) | CTA | story → CTA → journey |
| Idle (story owner, has history) | CTA | story → CTA → journey |
| Idle (reviewer) | — | story → (no CTA) → journey |
| Waiting (one submitted, waiting) | CTA | story → WaitingIndicator → journey (hidden until both submit) |
| Explain-back checker | CTA (👂) | story → ActionArea(👂) → journey |
| **Gap-revealed** | **Result (journey + badge)** | **journey → gap badge → CTA → story** |
| **Calibrated** | **Result (journey + badge)** | **journey → calibrated badge → CTA → story** |
| Perfect / Results | Result (journey) | journey → story (or no story) |
| RatingScreen | Drawer | story → rating drawer → journey |

### Corrected layout for result phases

**Gap-revealed (proposed):**
```
┌─ Journey card ─────────────────────────────┐
│ Gosha's confidence: ●●●●●○○○○○  5         │
│ Your belief:        ●●●●●●●●○○  8         │
└────────────────────────────────────────────┘
  [3 point gap]  ← badge adjacent to journey (they form one unit)
  You think Gosha understands less than they think

  [Explain back what I heard]       ← CTA
  Speak freely

  ┌─ Story card (compact) ─────────────────┐  ← reference, scroll to reach
  │ "First two lines of story text..."     │
  └────────────────────────────────────────┘
```

**Calibrated (proposed):**
```
┌─ Journey card ─────────────────────────────┐
│ Gosha's confidence: ●●●●●●●○○○  7         │
│ Your belief:        ●●●●●●●○○○  7         │
└────────────────────────────────────────────┘
  [Perfectly calibrated]  ← badge adjacent to journey

  [Explain back what I heard]
  Speak freely

  ┌─ Story card (compact) ─────────────────┐
  │ "First two lines..."                   │
  └────────────────────────────────────────┘
```

## Predecessor Sections Superseded

| Section | P455 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AC #3 | "Journey card appears below CTAs in all affected screens" | **Superseded** for result phases | Journey appears ABOVE CTA in gap-revealed + calibrated (this spec) |
| AC #7 | "UnderstandingScreen non-affected phases (gap-revealed, perfect, results) unchanged" | **Superseded** | Gap-revealed and calibrated are now in scope with phase-specific order |
| Technical Notes "Screens affected" | Lists 6 screens, explicitly excludes gap-revealed + calibrated | **Extended** | Phase table above covers all 11 /live states |
| UX Design section | Single ASCII mockup showing universal "Story card → CTA → Journey card" order | **Partially superseded** | Layout differs by phase type (see Redesign section above) |

## What Stays the Same

- **line-clamp-2 on story text** — story card remains compact (2 lines) in all phases where it appears. This spec does not change story card behavior, only its position.
- **Speak freely placement** — stays immediately below primary CTA in all phases
- **Journey card min-h-[180px]** — layout constraint preserved
- **Idle free-form layout** — no story card, no change
- **All non-result UnderstandingScreen phases** — perfect, results, explain-back phases unchanged
- **RatingScreen** — story above rating drawer, journey below (P455 order preserved)
- **Free-form idle screen** — no change

## Surfaces in Scope

**In scope:**
- `src/app/components/partners/live-mode-view.tsx` — gap-revealed phase (~line 2545) and calibrated phase (~line 2683) order correction

**Out of scope:**
- `src/app/components/partners/live-story-card-expanded.tsx` — no changes to story card component itself
- All idle/action phases — already correct (P455 order preserved)
- RatingScreen — already correct (P455 order preserved)
- UnderstandingScreen explain-back/waiting — already correct
- Database, API, auth logic — no changes

## Acceptance Criteria

- [ ] In gap-revealed: journey card appears above gap badge; gap badge appears directly below journey card (no other element between them)
- [ ] In gap-revealed: story card appears BELOW the primary CTA button ("Explain back what I heard")
- [ ] In calibrated: journey card appears above "Perfectly calibrated" badge; badge appears directly below journey card
- [ ] In calibrated: story card appears BELOW the primary CTA button
- [ ] All idle phase layouts unchanged (story above CTA, journey below — P455 order preserved)
- [ ] RatingScreen layout unchanged (P455 order preserved)
- [ ] UnderstandingScreen explain-back checker unchanged (story above ActionArea)
- [ ] "Speak freely" remains immediately below primary CTA in all affected phases
- [ ] Free-form idle (no story selected) unchanged
- [ ] All existing P455 e2e tests pass

## Pre-implementation Note

The quick fix (commit `4b520023`) already applied the correct ordering to gap-revealed and calibrated on `main`. This spec documents the design principle and acceptance criteria so that:
1. The fix has traceable intent
2. Future changes to live-mode-view.tsx have a reference for the phase-specific ordering rule
3. `/dev` can generate tests against the acceptance criteria above

## Next Steps

Run `/ux features/p468_live_phase_aware_layout_hierarchy.md` to produce phase-by-phase wireframes for all 11 /live states — this will become the definitive reference that prevents future "applied by analogy" mistakes.
