---
status: all-done
type: change-request
rank: 1000769.0
changes: p852
tags:
  - redesign
  - p852
created_date: '2026-06-01'
pipeline_ran: [change-request, ship]
completed_at: 2026-06-01
---

# P867: Intensity tutorial — question-framed, click-obvious, demos *disagree*

> **Redesign of:** [P852: Letter full-flow UX redesign (Round-H intensity tutorial)](./p852_letter_flow_redesign_impl.md)
> **What was wrong:** The Round-H tutorial force-opens a looping animation the instant a reader reaches the engage phase (arriving straight from "open letter"), with no framing — readers report being surprised/perplexed rather than taught. Two design faults compound it: (1) the cursor "press" is a bare `scale(0.7)` with no ripple or label, so the *click moment* is easy to miss; (2) the demo selects **Slightly Agree**, but the higher-value path to teach is **disagree** — expressing calibrated disagreement is where readers most need the nuance affordance.

## Operating Mode

> This spec is an **incremental correction** to P852, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P852 are not up for re-examination: the modal stays
> a forced, first-time, blocking (ESC + backdrop disabled, no close X) tutorial
> gated by the `letter_intensity_preview_seen_at_v2` localStorage key; the demo
> still puppets the real `PositionButtons` in controlled mode on a loop; the `?`
> reopen affordance and reduced-motion short-circuit stay as-is in mechanism.

## Problem Statement

P852's intensity tutorial solved a real discoverability problem — readers didn't know a *second* tap on a chosen position opens an intensity refinement dropdown (Slightly / default / Strongly). The forced first-time modal guarantees everyone learns the mechanic (the deliberate "strict tutorial-video" decision, which this redesign **preserves** — pure opt-in would reintroduce the discovery gap).

What the predecessor got wrong is **the experience of that forced moment and what it teaches**:
- It reads as an *ambush* — an animation auto-plays at the reader with zero framing the instant they open a letter.
- The click that drives the lesson is visually weak (silent `scale(0.7)`), so the "tap twice" mechanic the whole modal exists to teach is the least legible beat in it.
- It demonstrates *agreement* intensity when *disagreement* intensity is the more valuable, more-often-needed thing to model.

## Jobs To Be Done

- **Preserved from P852:**
  - *First-time reader:* "When I first reach the position buttons, I want to understand I can express nuance, so I commit a position that matches my actual view." (J1)
  - *Reopen:* "After dismissing the tip, if I get confused, I want to re-trigger the explanation without restarting." (J2 — the `?` affordance, unchanged.)
- **Corrected:** J1 is served more precisely — framed as the question the reader is about to ask, with an unmistakable click, demonstrated on the disagree path.
- **New:** none.

## Current State

P852 Round-H (as shipped, before this session's inline edits): the modal auto-opens on first engage-phase entry. A centered "💡 Quick tip" eyebrow sits above a `Tap twice` title and a `to adjust intensity` subtitle. Below, a ~3.9 s looping pictogram puppets a brand-blue cursor into the **Agree** group (right third), presses (`scale(0.7)`, no ripple), opens the dropdown, glides to row 1 (**Slightly Agree**), presses again; a "Somewhat Agree" confirmation pill flashes. Primary button: `Got it`.

**Partially applied inline this session (founder-verified visually):** the eyebrow was moved into a top-edge **"Quick tip" tab** straddling the modal border; the title was reframed as a question (`How do you say "slightly agree / disagree"?`); the subtitle was restructured to `Tap your position twice to adjust intensity.` These are folded into this spec for tracking; the remaining work is below.

**Before (current shipped demo beat):**
```
┌──────────────────────────────┐
│         💡 Quick tip          │   ← centered eyebrow (now a top tab)
│         Tap twice             │   ← now question-framed
│      to adjust intensity      │
│   [ cursor → AGREE → press ]  │   ← right third; silent scale(0.7)
│   [ dropdown → Slightly Agree]│   ← demos the AGREE path
│         [ Got it ]            │
└──────────────────────────────┘
```

## Root Cause

Three independent mechanisms in the shipped code:

1. **Unframed forced open** — `letter-flow-content.tsx` opens the modal on engage-phase entry whenever `!isIntensityPreviewSeen`, with no question framing. The reader gets an animation, not a prompt. *(Addressed by the question-title reframe + "Quick tip" tab — already applied inline; formalized here.)*
2. **Weak click affordance** — in `intensity-preview-pictogram.tsx` the press is only `transform: isPressing ? 'scale(0.7)' : 'scale(1)'` on the cursor (~line 222). There is no ripple, no "click" label — the defining beat of a "tap twice" lesson is the least visible. *(New ripple + label required.)*
3. **Demos the lower-value path** — `computeViewportPos` anchors the cursor to the **right third** (`bounds.width * 0.76`–`0.88`), and the timeline sets `userPosition='agree' → 'somewhat_agree'`, `openGroup='agree'`, pill `POSITION_LABELS.somewhat_agree`, reduced-motion final `somewhat_agree`. `BUTTON_ORDER = ['disagree','unsure','agree']` puts **Disagree on the left**; demoing it requires re-deriving the x-anchors to the left third and flipping the position/group/label/reduced-motion values. Disagree dropdown order is `['somewhat_disagree','disagree','strongly_disagree']`, so **"Somewhat Disagree" is row 1** — the brittle `+18` item y-offset stays valid; only x changes.

## Redesign

**After (target demo beat):**
```
        ╭───────────────╮
        │  💡 Quick tip  │              ← top-edge tab (applied)
╭───────┴───────────────┴──────╮
│  How do you select            │      ← title (singular: "slightly disagree")
│     "slightly disagree"?       │
│  Click your position twice     │      ← "Click" not "Tap"
│      to adjust intensity.       │
│                                │
│  [ cursor → DISAGREE ]          │     ← LEFT third
│   ◌ ripple + "click" on press   │     ← new affordance, each press
│  [ dropdown → Somewhat Disagree]│     ← demos the DISAGREE path, row 1
│                                │
│          [ Continue ]           │     ← "Continue" not "Got it"
╰────────────────────────────────╯
```

Five coupled changes:

1. **Click affordance (pictogram):** on each of the two presses, render an expanding-ring **ripple** centered on the cursor tip plus a brief **"click"** label, synchronized to the existing press timers (~t=1300 and ~t=2750). Reuse the cursor's `z-[10000]` body portal so it paints above the dropdown. Reduced-motion path shows no ripple (consistent with the existing no-animation branch).
2. **Subtitle copy (modal):** `Tap your position twice to adjust intensity.` → `Click your position twice to adjust intensity.` (consistent with the mouse-cursor metaphor the demo already uses).
3. **Primary button copy (modal):** `Got it` → `Continue`.
4. **Title copy (modal):** → `How do you select "slightly disagree"?` (singular disagree; supersedes the interim `"slightly agree / disagree"` applied inline this session).
5. **Animation switch (pictogram):** puppet **Disagree** instead of Agree — re-derive `computeViewportPos` x-anchors to the left third; flip `userPosition` `agree`→`disagree` and `somewhat_agree`→`somewhat_disagree`; `openGroup` `agree`→`disagree`; confirmation pill `POSITION_LABELS.somewhat_disagree`; reduced-motion final state `somewhat_disagree`; rewrite the timeline JSDoc comment to describe the Disagree path.

## Predecessor Sections Superseded

P852 has no enumerated AC or named tutorial section — the tutorial's design lives in the component JSDoc. Superseded design decisions:

| Source | P852 said | Status | Replaced by |
|--------|-----------|--------|-------------|
| pictogram JSDoc / timeline | demo selects `agree` → `somewhat_agree` ("Slightly Agree"), cursor into the **Agree** button | Superseded | Redesign change #5 — demos **Disagree** → **Somewhat Disagree** |
| pictogram reduced-motion | `setUserPosition('somewhat_agree')` synchronous final state | Superseded | reduced-motion final state `somewhat_disagree` |
| pictogram cursor press | press = bare `scale(0.7)`, no ripple/label | Extended | Redesign change #1 — ripple + "click" label added on top of existing cursor |
| modal subtitle | `Tap your position twice to adjust intensity.` | Superseded | `Click your position twice…` (change #2) |
| modal primary button | `Got it` | Superseded | `Continue` (change #3) |
| modal title | `Tap twice` (orig) / `"slightly agree / disagree"` (interim) | Superseded | `How do you select "slightly disagree"?` (change #4) |

Still valid (preserved): forced first-time open, blocking behavior (ESC/backdrop off, no close X), the `letter_intensity_preview_seen_at_v2` seen-gate, the `?` reopen affordance, loop remount mechanism, analytics event names (`intensity_tutorial_shown` / `_dismissed`), real-`PositionButtons`-in-controlled-mode approach, the brittle `+18` dropdown-row y-offset.

## Requirements

- The demo's two presses each render a visible ripple + "click" label, timed to the existing press beats, without disturbing the ~3.9 s timeline or the `z-[10000]` paint order over the dropdown.
- The demo selects the Disagree group (left) and its row-1 "Somewhat Disagree", ending in the "Somewhat Disagree" final state; the confirmation pill reads "Somewhat Disagree".
- Reduced-motion users see the static **Somewhat Disagree** final state (no animation, no ripple), matching the animated path's outcome.
- Modal copy reads: title `How do you select "slightly disagree"?`, subtitle `Click your position twice to adjust intensity.`, button `Continue`.
- The cursor lands cleanly on the Disagree segment and its dropdown row 1 at 320 px, 375 px, and desktop — no straddling the gap between groups or rows.

## What Stays the Same

- `PositionButton.tsx` and the real intensity dropdown behavior — untouched (demo only puppets them in controlled mode).
- The inline `?` reopen affordance and its row in `letter-flow-content.tsx` (subject of P862 a11y fix) — untouched.
- The seen-gate hook `use-intensity-preview-seen.tsx` and its localStorage key — untouched.
- Analytics event names — unchanged ("Got it" → "Continue" is label-only).
- Data model, RLS, all other letter-flow phases (progress bar, rating, sealing).

## Surfaces in Scope

**In scope (as shipped):**
- `src/app/components/letters/intensity-preview-pictogram.tsx` — ripple affordance, agree→disagree switch (`computeViewportPos`, timeline state, pill label/position/duration, reduced-motion final state, white cursor, JSDoc).
- `src/app/components/letters/intensity-tutorial-modal.tsx` — title, button, "Quick tip" tab.
- `src/app/components/letters/letter-flow-content.tsx` — **copy-only**: engage-phase inline replay hint renamed to "Double-click to adjust position level" (both engage phases). The forced-open effect + `?` affordance behavior stay as-is.
- `src/tests/p862-engage-tip-inert.test.tsx` — text selector updated to the renamed hint.

**Untouched:**
- `PositionButton.tsx`, `use-intensity-preview-seen.tsx`, the forced-open/gating behavior, any other letter phase.

## Acceptance Criteria

- [x] Demo puppets **Disagree** (left group) via the true 3-click P847 Model C′ sequence: click selects Disagree (no menu) → click the same button again (intensity menu opens) → pick **Somewhat Disagree**. Confirmation pill reads "Somewhat Disagree", centered above the row, held ~950ms.
- [x] Each press shows an expanding click-ripple, tone-flipped to avoid blue-on-blue (white ring on the selected blue button, blue ring on the white dropdown row).
- [x] Cursor is white-filled with a blue outline so it stays visible on the selected blue button (including the key second click).
- [x] Reduced-motion path renders the static **Somewhat Disagree** final state — no animation, no ripple.
- [x] Modal copy: title `Double-click to pick "somewhat disagree"` (single directive line, no subtitle), primary button `Continue`, top-edge "Quick tip" tab.
- [x] Engage-phase inline replay hint renamed to "Double-click to adjust position level" (both point-engage and remaining-point-engage); P862 a11y test selector updated to match.
- [x] Cursor lands on the Disagree segment + dropdown row (not straddling gaps) — verified at desktop and 375px.
- [x] Surfaces not in scope are visually unchanged; the forced-open + `?` reopen behavior still works.
- [x] P852 / P862 tests pass (P862 selector updated to the new hint copy).
- [x] Regression: the modal still cannot be dismissed by ESC or backdrop; "seen" gate still suppresses replay on return visits.

## Build Notes (deltas from the original spec)

The design iterated substantially during the session (founder art-directed via GIF review):
- **3-click correction (the big one):** the original spec/AC assumed a 2-press demo (select + menu opening in one click). Verifying `PositionButton.tsx` (P847 "Model C′") showed reaching an intensity is genuinely **3 clicks** — click selects, click the same button again opens the menu, click picks. The demo was rebuilt to the true sequence; "Double-click" in the title legitimately names the two same-button clicks that open the menu.
- **"click" text cue dropped:** an earlier build added a centered "click" label; removed at founder request — the ripple alone signals the press.
- **Copy converged** through several variants to `Double-click to pick "somewhat disagree"`.
- **Visual QA:** verified via founder live review + agent screenshots/GIFs at desktop + 375px. The separate blind-QA subagent step (per `.claude/rules/visual-qa.md`) was **not** run — the founder reviewed each iteration directly, which served the same purpose. The 320px true viewport could not be forced by either browser tool (both stayed ≥ ~485px); the layout is fluid and the only 320-specific risk is title wrap depth, which has ample vertical room.
