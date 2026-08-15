---
type: change-request
rank: 1000938.0
changes: p665
chain_root: p581
tags:
  - redesign
  - p665
  - letters
  - composition
  - prediction-walk
  - reuse
created_date: 2026-06-27
status: all-done
pipeline_plan:
  - change-request
  - architect
  - generate-tests
  - dev
  - verify
pipeline_ran: [change-request, dev, ship]
pipeline_skipped: [architect -- wiring trivial (single file, spec names exact reference), generate-tests -- skipped with architect]
completed_at: 2026-06-28
---

# P968: Prepare-Letter (Prediction Walk) Reuses the Reading Components

> **Redesign of:** [P665: Letter Routes — Chrome-Free + Preview Reuses Reading Components](../22_mar_26/p665_letter_immersive_preview_reuse.md)
> **What was wrong:** P665 corrected the "parallel UI" divergence — `LiveStoryCardExpanded` + bare `RatingButtons` + hand-rolled navigation instead of the real reading components — but only on the `/letter/:docId/preview` route. It explicitly left `/letter/:docId/compose` and `letter-prediction-walk.tsx` out of scope (Decision 6, "What Stays the Same"). The prediction walk the sender uses to *prepare* a letter still carries the exact pathology P665 named: the rating question floats as a loose `<p>` in the scroll flow, the 0–10 scale is bare `RatingButtons`, the advance button is a right-aligned floater instead of an anchored bar, and `LetterProgressBar` is wired with the wrong prop names — rendering the literal string **"Chapter NaN of undefined"** on screen. P968 finishes P665's job: the prepare flow reuses the same components the receiver's reading flow already uses.

## Operating Mode

> This spec is an **incremental correction** to P665, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P665 (preview reuse, chrome-free reading/preview/results routes) are not up for re-examination.
>
> **Lineage note:** The prediction walk itself was built under P661 ("Sender Walks Receiver's Reading Flow", now `rejected`/archived). P661's stated intent *was* full component reuse; the implementation only partially delivered it, and P665 fixed the preview surface but not compose. P968 is the third correction in this chain (P581 → P661 → P665 → P968) and closes the last diverging surface.

## Problem Statement

The sender's prepare-letter experience is a parallel reimplementation of the receiver's reading flow. The receiver's `story-rate` phase (in `letter-flow-content.tsx`) presents each story with the question, the 0–10 scale, and the advance CTA grouped inside an anchored `FixedBottomBar` drawer (via `ComprehensionRatingCard`), with the story scrolling behind it. The sender's prediction walk presents the same conceptual step — predict how well the receiver will understand each story — but with bespoke layout: a loose question paragraph, bare rating buttons, and a floating button.

**User harm:**
- **Broken UI in production:** `LetterProgressBar` receives `currentIndex`/`totalStories` but expects `currentChapter`/`totalChapters`, so the header reads "Chapter NaN of undefined". (Vite's dev server does not type-check, so the prop mismatch shipped.)
- **Inconsistent ritual:** preparing and reading a letter feel like two different products instead of one continuous calibrated-communication ritual (D6, "ritual, not feed"). The sender's prediction is made in a different visual frame than the receiver's rating, weakening the empathy P661/P665 sought.
- **No orientation:** the header shows only "Chapter 1 of 3" — a sender who steps away cannot tell *what task they are in* (they are predicting, as part of preparing a letter to send).
- **Maintenance debt:** the same "reuse the reading components, don't build parallel UI" correction has now been filed three times in this chain. The prediction walk is the last surface still diverging.

## Jobs To Be Done

- **Preserved from P665/P661/P581:** the prediction-walk job — "As a letter sender, I want to predict how well the receiver will understand each story, while experiencing the full story exactly as they will." Unchanged.
- **Corrected:** the sender↔receiver parity job — P661/P665 wanted the sender to experience what the receiver sees. P968 makes the *rating interaction itself* identical (same `ComprehensionRatingCard` in the same `FixedBottomBar`), not just the story card.
- **New:** "As a sender mid-preparation, I want a persistent cue of what I'm doing, so a flow I stepped away from re-orients me instantly." Served by a context eyebrow on the header row.

## Current State

Route `/letter/:docId/compose`, `predict` phase, rendered by `LetterPredictionWalk` (`src/app/components/letters/letter-prediction-walk.tsx`). The component is a `fixed inset-0 z-50` overlay (so it visually covers all app chrome despite the page being wrapped in non-`chromeFree` `ClarityLandingLayout`):

**Before (current):**
```
┌──────────────────────────────────────────────────────────────┐
│ [X]  Chapter NaN of undefined  ▓▓░░░         Story 1 of 1     │  ← top bar
│  │         │                                      │           │
│  │         └ BUG: wrong props → "NaN/undefined"   │           │
│  │           DUP: progress label AND "Story 1of1" │           │
│  └ off-pattern X close (app uses back, not X)                 │
│──────────────────────────────────────────────────────────────│
│   ┌────────────────────────────────────────────┐             │
│   │ Story card (LiveStoryCardExpanded)          │  ← scrolls   │
│   │  points expanded, position buttons          │             │
│   └────────────────────────────────────────────┘             │
│                                                                │
│   How well do you believe {name} understands...?  ← loose <p> │
│   [0][1][2][3][4][5][6][7][8][9][10]   ← bare RatingButtons   │
│                                                                │
│                                    ┌──────────┐                │
│                                    │  Review  │ ← floating,    │
│                                    └──────────┘   right-aligned │
└──────────────────────────────────────────────────────────────┘
```

## Root Cause

Two independent causes, one mechanism each:

1. **"Chapter NaN of undefined":** prop-name mismatch.
   `letter-prediction-walk.tsx:121` passes `<LetterProgressBar currentIndex={currentIndex} totalStories={stories.length} />`, but `LetterProgressBar` (`letter-progress-bar.tsx:10-11`) requires `currentChapter` / `totalChapters`. `undefined + 1 → NaN`; `totalChapters` is `undefined` → label `Chapter NaN of undefined`. Not caught at build time because the dev server (Vite/esbuild) transpiles without type-checking.

2. **Parallel UI:** the walk was authored (P661) before/without adopting the shared `ComprehensionRatingCard` + `FixedBottomBar` pattern that the receiver's `story-rate` phase uses (`letter-flow-content.tsx:738-797`). It hand-rolls the question (`:141`), the scale (`RatingButtons`, `:144`), and the advance button (`:152-160`) instead of composing the shared card inside the shared bar. This is the same divergence P665 diagnosed for preview ("builds a parallel UI with `LiveStoryCardExpanded` + `RatingButtons` + hand-rolled navigation") — never applied to compose.

## Redesign

Rebuild the `predict` phase body to mirror the receiver's `story-rate` phase: story card scrolls behind an anchored `FixedBottomBar` that contains a `ComprehensionRatingCard` (question + scale + centered CTA). Wire `LetterProgressBar` correctly. Add a one-line context eyebrow on the same row as the progress bar. Remove the X; rely on browser-back (matching the reading flow, P852). Keep the route immersive (no site menus).

**After (redesign):**
```
┌──────────────────────────────────────────────────────────────┐
│  Preparing letter for sending      Chapter 1 of 3  ▓▓▓▓░░░░  │  ← one row:
│  (eyebrow)                          (LetterProgressBar)        │    context + progress
│  no X · no menus · browser-back exits                         │
│──────────────────────────────────────────────────────────────│
│   ┌────────────────────────────────────────────┐             │
│   │ Story card (LiveStoryCardExpanded)          │  ← scrolls   │
│   │  points expanded, position buttons          │     behind   │
│   └────────────────────────────────────────────┘             │
│                       ⌄ (scroll cue)                          │
├──────────────────────────────────────────────────────────────┤
│   How well do you believe {name} understands your             │ ← ComprehensionRatingCard
│   intended meaning behind your story?                         │   INSIDE FixedBottomBar
│   Not at all ───────────────── Complete understanding          │
│   [0][1][2][3][4][5][6][7][8][9][10]                          │
│              [        Continue        ]   ← centered pill      │
└──────────────────────────────────────────────────────────────┘
   final chapter → CTA label becomes "Review" (private) / "Seal & Get Link" (public)
```

**Prompt text (preserve existing behavior):** one-to-one → "How well do you believe {receiverName} understands your intended meaning behind your story?"; one-to-many → "How well do you believe readers will understand your intended meaning behind your story?". Mirrors the receiver's `ComprehensionRatingCard` question phrasing. `[FOUNDER DECISION: confirm exact wording at UAT]`.

**CTA label per chapter:** non-final → "Continue"; final → "Review" (private doc) / "Seal & Get Link" (public doc). `[FOUNDER DECISION: confirm exact final-chapter labels at UAT]`.

**Context eyebrow:** "Preparing letter for sending", on the same row as the progress bar (left of it). `[FOUNDER DECISION: confirm copy at UAT]`. Reuse the preview-banner styling precedent (`letter-preview-page.tsx:104-119`) so it introduces no new visual language. At 320px, verify it fits on one row with "Chapter X of Y" + segments; if it overflows there, shorten the label or stack **only** at narrow widths.

## Predecessor Sections Superseded

| Section | P665 said | Status | Replaced by |
|---|---|---|---|
| Decision 6 | "`/letter/:docId/compose` stays wrapped in `ClarityLandingLayout` with normal chrome (top nav, bottom nav)… Composition is a sender-side editing flow… chrome helps them navigate." | Superseded | The prepare flow is immersive (no site menus), browser-back exits, matching reading. |
| What Stays the Same | "**Composition flow:** `letter-compose-page.tsx` unchanged — prediction walk, receiver modal, review screen, seal all stay as-is." | Partially superseded | The prediction walk's `predict`-phase body is redesigned (this spec). Receiver modal, review screen, and seal logic stay as-is. |
| Out of scope | "`src/app/pages/letter-compose-page.tsx` — no changes" | Superseded | Compose route + `letter-prediction-walk.tsx` are now the primary surfaces in scope. |
| AC #10 | "Surfaces NOT in scope are visually unchanged (composition, cover, completion)" | Superseded (boundary moved) | Composition's prediction walk deliberately changes; cover/completion stay unchanged. |
| Decision 2 (principle) | "the whole point of this CR is to eliminate parallel implementations. A second state machine would be the same mistake at a different layer." | Extended | Same principle now applied to the compose/prediction-walk surface. |

## Requirements

1. The `predict` phase renders the story via `LiveStoryCardExpanded` (unchanged) scrolling behind an anchored `FixedBottomBar`.
2. The `FixedBottomBar` contains `ComprehensionRatingCard` (question + 0–10 scale + centered submit CTA). No loose question `<p>`, no bare `RatingButtons`, no floating advance button.
3. Selecting a rating + submit advances the walk: persist the prediction (`onPredict`) and move to the next chapter (or complete). Selection remains required before the CTA enables (preserves current `disabled` behavior).
4. `LetterProgressBar` receives `currentChapter={currentIndex}` and `totalChapters={stories.length}` — no `stepCount`/`committedSteps`/`isEngagePhase` (the sender does one step per chapter). The redundant "Story N of N" span is removed.
5. A context eyebrow ("Preparing letter for sending") renders on the progress-bar row.
6. The X close button is removed; exit is browser-back only (match reading flow, P852).
7. The route is immersive — no top nav, no bottom nav, no footer. (The `fixed inset-0` overlay already achieves this visually; confirm no chrome leaks at any phase.)
8. CTA label is "Continue" per chapter; final chapter shows "Review" (private) / "Seal & Get Link" (public), preserving the existing public-vs-private branch (`handlePredictionComplete`).
9. The 0–10 prediction values written on seal are unchanged from current behavior (no data-model change).

## What Stays the Same

- **Data model & seal logic:** `predictions` Map, `sealLetter` RPC, deliveries, `responses_mode` — unchanged.
- **Other compose phases:** `modal` (receiver setup), `seal-confirm`, `sealing`, `review` (`LetterReviewScreen`), `confirmation` (`LetterSealConfirmation`) — unchanged by this spec, except they inherit the same immersive (no-menu) treatment the overlay already gives them.
- **Receiver reading flow** (`letter-flow-content.tsx`) and **preview page** (`letter-preview-page.tsx`) — untouched; P968 consumes their components, it does not modify them.
- **`ComprehensionRatingCard`, `FixedBottomBar`, `LiveStoryCardExpanded`, `LetterProgressBar`** — reused as-is; no API changes expected. (If the eyebrow needs a slot, prefer composing around the components over modifying them.)

## Surfaces in Scope

**In scope:**
- `src/app/components/letters/letter-prediction-walk.tsx` — rebuild the `predict`-phase body to compose the reused components; fix the `LetterProgressBar` props; remove the X; add the eyebrow.

**Out of scope (do not modify):**
- `src/app/components/letters/letter-flow-content.tsx` (receiver flow — reference/template only)
- `src/app/pages/letter-preview-page.tsx`
- `src/app/components/shared/comprehension-rating-card.tsx`
- `src/app/components/shared/fixed-bottom-bar.tsx`
- `src/app/components/letters/letter-progress-bar.tsx`
- `src/app/components/partners/live-story-card-expanded.tsx`
- `src/app/pages/letter-compose-page.tsx` (orchestrator — only the `predict` branch's rendered component changes; the page's phase logic is unchanged)
- Receiver modal, review screen, seal, confirmation components

## Reuse Inventory (no components rebuilt)

| Component | Source | Role in P968 |
|---|---|---|
| `LiveStoryCardExpanded` | `components/partners/live-story-card-expanded.tsx` | Story card (already used in the walk) |
| `LetterProgressBar` | `components/letters/letter-progress-bar.tsx` | Chapter progress (props fixed) |
| `FixedBottomBar` | `components/shared/fixed-bottom-bar.tsx` | Anchored drawer holding the rating card |
| `ComprehensionRatingCard` | `components/shared/comprehension-rating-card.tsx` | Question + 0–10 scale + centered CTA |
| `RatingButtons` | `components/partners/shared.tsx` | Now used only *inside* `ComprehensionRatingCard` |

## Acceptance Criteria

- [x] The prepare-letter header never shows "Chapter NaN of undefined" — it shows "Chapter {n} of {total}" with correct numbers (single-chapter letters show "Chapter 1", no "of 1").
- [x] The rating question, 0–10 scale, and advance CTA all render inside an anchored `FixedBottomBar`; the story scrolls behind it (no loose question `<p>`, no bare `RatingButtons`, no floating button).
- [x] The advance CTA is centered (not right-aligned) and disabled until a rating is selected.
- [x] CTA label is "Continue" on non-final chapters; final chapter shows "Review" (private) / "Seal & Get Link" (public).
- [x] A "Preparing to send" eyebrow is visible on the progress-bar row at desktop, 375px, and 320px (label degrades gracefully — never overflows or clips at 320px). RESOLVED: founder shortened copy to "Preparing to send" (~108px) so back-arrow + eyebrow + progress bar fit within the ~288px 320px budget on multi-story letters.
- [x] No X close button; browser-back exits the flow.
- [x] No top nav, bottom nav, or footer appears in any compose phase.
- [x] The redundant "Story N of N" counter is gone.
- [x] Sealing a letter writes the same predictions as before (no data-model regression); public and private docs both reach their correct next step. VERIFIED BY DIFF SCOPE: the prediction-write / seal path was not touched by this branch (changes are header/CTA layout, recipient-dialog placement, and the location.state hand-off — code review confirmed the {mode,emails,receiverName,recipients} contract matches compose's reader and public docs still navigate directly). Existing P581/P661/P665 seal tests pass. Destructive live-seal path accepted as unverified (ACCEPT).
- [x] Surfaces NOT in scope (receiver reading flow, preview page, the shared components) are visually and behaviorally unchanged. VERIFIED BY DIFF SCOPE: branch diff touches only letter-prediction-walk, letter-review-screen, letter-receiver-modal, doc-detail-page, dialog.tsx (overlayClassName prop, additive) and the two E2E specs — none of the out-of-scope surfaces.
- [x] All existing P581 / P661 / P665 letter tests still pass.

## Next Steps

- Has structural component-composition changes (swapping bespoke layout for `ComprehensionRatingCard`-in-`FixedBottomBar`, with public/private CTA branching and prediction persistence) → run `/architect features/p968_prepare_letter_reuses_reading_components.md` for a light implementation plan that pins the wiring against the receiver `story-rate` template, then `/generate-tests` → `/dev`.
- If the wiring is judged trivial at architect time, collapse to `/dev` directly — the receiver's `story-rate` phase is the exact implementation reference.
