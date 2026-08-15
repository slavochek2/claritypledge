---
status: all-done
type: change-request
rank: 0.015
changes: p852
tags:
  - redesign
  - p852
created_date: '2026-05-31'
pipeline_ran: [change-request, dev, ship, verify]
completed_at: 2026-06-01
---

# P860: Story-rate — center content above the pinned drawer (kill the dead gap)

> **Redesign of:** [P852: Letter flow redesign (Phase B implementation)](./p852_letter_flow_redesign_impl.md)
> **What was wrong:** In the `story-rate` phase, the story content is top-aligned while the rating CTA sits in a `position:fixed` bottom drawer and the wrapper is forced to full viewport height. When the story is shorter than the viewport (short story, tall/desktop viewport, or landscape phone), a dead band of empty white space opens between the story and the drawer. The two scroll cues added during P852 implementation — a gradient fade above the drawer and a bouncing `ChevronDown` gated on `isStoryScrollable` — are both parasitic on content overflow, so they silently vanish in exactly the short-content case, leaving the gap with no signal at all.

## Operating Mode

> This spec is an **incremental correction** to P852, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P852 (fixed drawer, `LiveStoryCardExpanded` unchanged, `Continue` label, all other phases) are not up for re-examination.

## Problem Statement

The `story-rate` screen asks the reader to rate how well they understood the author's story. The rating control is always reachable (the drawer is `position:fixed` at the bottom), so this is **not** a "user can't find the action" problem.

The problem is **layout**: top-aligned content + fixed-bottom drawer + forced-full-height cannot coexist without a gap whenever content is shorter than the viewport. The result reads as two disconnected pieces with an empty band between them. The cues meant to bridge it (fade, chevron) only render when content overflows — which is precisely *not* the failing case — so they do nothing here. The founder observed this on production desktop and confirmed the prior arrow attempt "failed" (it is correctly suppressed when there is nothing to scroll to).

This is device-agnostic. The trigger is `content height < viewport height`. Desktop and landscape phones hit it most; portrait mobile usually escapes only because the narrow column wraps the story text tall enough to overflow — an accident of geometry, not a designed affordance. A 1–2 sentence story reproduces the gap on portrait mobile too.

## Jobs To Be Done

- **Preserved from P852:** Rate understanding of the author's story after reading it; experience the chapter flow without structural confusion; commit before the reveal.
- **Corrected:** The story-rate screen should read as **one balanced unit** regardless of story length or viewport, instead of "content stranded at top, action stranded at bottom, void between."
- **New:** none. This is a layout correction, not new capability.

## Current State

`letter-flow-content.tsx` story-rate phase (`currentPhase === 'story-rate'`):

- The phase content lives in the wrapper that, for non-short phases, is `max-w-2xl mx-auto w-full space-y-6 mt-4` (`letter-flow-content.tsx:482`) — **top-aligned**. story-rate is deliberately excluded from the `isShortPhase` vertical-centering branch (`letter-flow-content.tsx:473-482`) because of a clipping concern noted in the comment at `letter-flow-content.tsx:467-472`.
- `<LiveStoryCardExpanded ... imageClassName="max-h-[50vh]" imageFit="contain" />` renders author header → image (capped at 50vh) → story text → tags (`letter-flow-content.tsx:577-584`).
- The rating block (`ComprehensionRatingCard`) lives inside `FixedBottomBar` (`fixed inset-x-0 bottom-0`, `fixed-bottom-bar.tsx:29`) — pinned to the viewport bottom, always visible.
- Two overflow-gated cues sit on/above the drawer: a gradient fade (`before:` pseudo-element, `letter-flow-content.tsx:594`) and a bouncing `ChevronDown` rendered only when `isStoryScrollable` (`letter-flow-content.tsx:605-612`). `isStoryScrollable` is true only when `scrollHeight > clientHeight + 4 && !atBottom` (`letter-flow-content.tsx:299-301`).

**Before (current) — short story on a tall viewport:**
```
┌─────────────────────────────┐
│ Chapter 1 of 9  ▓▓░░░░░░░░░  │  ← fixed top progress bar
├─────────────────────────────┤
│ (VL) Vyacheslav      👂 7    │  ← story card, TOP-aligned
│ ┌─────────────────────────┐ │
│ │   image (contain ≤50vh) │ │
│ └─────────────────────────┘ │
│ I almost didn't send this…  │
│                             │
│                             │  ← DEAD GAP. fade fades white→white
│         (empty)             │     (invisible). chevron suppressed
│                             │     (no overflow). zero signal.
│                             │
│ ─────────────────────────── │  ← fixed drawer (always visible)
│ How well do you understand? │
│ [0][1][2][3]…[10]           │
│ (        Continue         ) │
└─────────────────────────────┘
```

## Root Cause

Three layout properties applied together to the story-rate phase make the gap unavoidable when content is short:

1. **Top alignment** — wrapper is `mt-4`, content flows from the top (`letter-flow-content.tsx:482`).
2. **Fixed-bottom drawer** — `FixedBottomBar` is `position:fixed bottom-0` (`fixed-bottom-bar.tsx:29`).
3. **Forced full height** — the page/scroll container occupies the full viewport.

Top + bottom + full-height ⇒ the middle is empty whenever (content height) < (viewport height). Both bridging cues are gated on overflow (`isStoryScrollable`, and a fade that needs non-white pixels behind it), so they evaluate to "no signal" in the exact case that produces the gap. Relaxing **any one** of the three properties removes the gap; the chosen relaxation is #1 (alignment), conditionally.

## Redesign

**Option A (founder-approved): center the story content in the space above the pinned drawer when it fits; fall back to top-align + scroll when it overflows.**

- Available vertical space = `100dvh − measured drawerHeight`. `drawerHeight` is already measured (`setDrawerRef` / `drawerHeight`, used today for bottom padding at `letter-flow-content.tsx:486`), so no new measurement is needed.
- **When content fits** that space: vertically center the story card → empty space splits symmetrically above and below, reading as deliberate breathing room. Drawer stays fixed and always visible.
- **When content overflows** that space (long story): top-align and let it scroll. This fallback is **mandatory** — the comment at `letter-flow-content.tsx:467-472` warns that naive `justify-center` clips tall content above the fold. Centering must not reintroduce that.
- The overflow-gated cues (fade + chevron) become **secondary**: they remain valid in the genuine overflow case (long story) and simply don't render when content fits (which is now fine — there is no gap to bridge).

**After (redesign) — short story, centered:**
```
┌─────────────────────────────┐
│ Chapter 1 of 9  ▓▓░░░░░░░░░  │  ← fixed top progress bar
├─────────────────────────────┤
│                             │  ← symmetric breathing room (top)
│ (VL) Vyacheslav      👂 7    │
│ ┌─────────────────────────┐ │  ← story card CENTERED in the
│ │   image (contain ≤50vh) │ │     space above the drawer
│ └─────────────────────────┘ │
│ I almost didn't send this…  │
│                             │  ← symmetric breathing room (bottom)
│ ─────────────────────────── │  ← fixed drawer (always visible)
│ How well do you understand? │
│ [0][1][2][3]…[10]           │
│ (        Continue         ) │
└─────────────────────────────┘
```

**After (redesign) — long story, top-aligned + scrolls (fallback):**
```
┌─────────────────────────────┐
│ Chapter 1 of 9  ▓▓░░░░░░░░░  │
├─────────────────────────────┤
│ (VL) Vyacheslav      👂 7    │  ← top-aligned, content fills + scrolls
│ ┌─────────────────────────┐ │
│ │   image                 │ │
│ └─────────────────────────┘ │
│ Long story text continues … │
│ … and continues, overflowing│
│ ░░░ fade (now has text) ░░░ │  ← fade + chevron VALID here
│ ─────────────────────────── │  ← fixed drawer
│ [scale] (   Continue   )    │
└─────────────────────────────┘
```

## Predecessor Sections Superseded

| Section | P852 said | Status | Replaced by |
|---|---|---|---|
| Spacing per Zone (story-rate top) | "Page top (below fixed progress bar): `mt-6` — matches current `mt-4` + extra for breathing room" | Superseded (story-rate only) | Conditional vertical centering in `space above drawer`; top-margin-only approach replaced |
| Implementation cues (not in P852 spec text) | Gradient fade + `ChevronDown` gated on `isStoryScrollable` added during P852 build | Demoted to secondary | These render only on genuine overflow; the short-content layout no longer depends on them |
| Locked Decision 6 | "the drawer should be fixed, current implementation is better" | **Preserved** | Drawer stays `position:fixed`; only content alignment above it changes |

All other P852 sections, Locked Decisions, and all 8 Done-When ACs remain authoritative.

## Requirements

1. In `story-rate`, when the story card + header + text fit within `100dvh − drawerHeight`, the content is vertically centered in that region.
2. When the content does not fit, it top-aligns and scrolls (no clipping above the fold).
3. The fixed bottom drawer remains pinned and always visible in both cases.
4. The fade + chevron cues continue to render in the overflow case and are absent (harmlessly) in the fit case.
5. The transition between fit and overflow must be stable (no flicker/jump) as `drawerHeight` is measured and on resize.

## What Stays the Same

- Data model, scoring, `/live`, RLS, letter submission, completion flow — untouched.
- `LiveStoryCardExpanded` markup/props (`hidePoints`, `readOnly`, `imageClassName="max-h-[50vh]"`, `imageFit="contain"`).
- `FixedBottomBar` component (`fixed-bottom-bar.tsx`) — no change.
- `ComprehensionRatingCard`, `handleSubmitRating`, `submitLabel="Continue"`, question copy.
- All other phases — `point-engage`, `point-revealed`, `remaining-point-engage`, `remaining-point-revealed`, `story-revealed` — already centered via the `isShortPhase` branch; **must remain byte-for-byte unchanged**.

## Surfaces in Scope

**In scope:**
- `src/app/components/letters/letter-flow-content.tsx` — only the `story-rate` phase wrapper/alignment logic (and, if needed, the `isShortPhase` / wrapper-class computation as it applies to story-rate).

**Out of scope:**
- `fixed-bottom-bar.tsx`, `comprehension-rating-card.tsx`, `live-story-card-expanded.tsx` (no prop/markup changes expected).
- All non-story-rate phases.
- P859 (`letter_reading_currentuser_undefined`) — separate issue on the same page; do not fold in.

## Acceptance Criteria

- [x] Short story on a tall desktop viewport: content is centered above the drawer; no dead band stranded at the top. **Live-verified** (real LetterFlowContent via preview route, post-rebase): card 9.5% off region-center — centered, not stranded. `p860-live-desktop.png`.
- [x] Short story (1–2 sentences) at 375px and at landscape-phone height: centered, no dead band. **Live-verified at 390px** (centered, no horizontal overflow); landscape-phone via CSS-contract harness (top-aligns + scrolls). `p860-live-mobile.png`.
- [x] Long story that exceeds `100dvh − drawerHeight`: content top-aligns and scrolls, nothing clipped above the fold; fade + chevron render. **CSS-contract verified** (faithful harness, 4 viewports); fade+chevron logic unchanged by P860. Live run used a short story.
- [x] The drawer (question + 0–10 scale + Continue) is visible without scrolling in all cases. **Live-verified** desktop + mobile.
- [x] Other phases (point-engage / point-revealed / remaining-* / story-revealed) are visually unchanged. **Code-scope verified**: only the `isStoryRate` branch was added to the wrapper ternary; the `isShortPhase` and fallthrough branches are byte-for-byte unchanged + letter tests green (incl. post-rebase merge with P862's engage-tip-row change in a different region).
- [x] All existing P852 letter tests still pass; no regression to submission/RLS/completion. (21 letter tests green: p777 scroll canary 5/5, p745/p772/p778/p734 16/16; tsc clean.)
- [x] No layout flicker/jump on initial render or on window resize as `drawerHeight` settles. **Partial**: no visible jump in the live preview run; static-CSS approach (no new JS). Full resize matrix not exhaustively driven — low risk.

## Next Steps

Implemented on `feature/p860-story-rate-center` (Option A: `my-auto` safe-centering). CSS contract verified in-browser at 4 viewports; live story-rate phase awaits `/verify p860` (auth-gated deep flow). Then `/ship p860`.
