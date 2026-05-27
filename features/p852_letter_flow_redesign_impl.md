---
status: week
type: story
rank: 1000765.0
workstream: letter
created_date: '2026-05-27'
tags:
  - letter
  - ux
  - redesign
  - phase-b
changes: p842
delivery_stage: create-spec
pipeline_ran: [create-spec]
---

# P852: Letter full-flow UX redesign — Phase B (implementation)

## Problem

**Situation:** P842 (Phase A) ran a SuperDesign exploration of the letter flow and the founder picked a direction: a light-theme, whole-flow redesign that makes the calibration reveal unmissable, makes the chapter grouping legible, and fixes the inverted hierarchy. The validated mockups live in the SD project + `sd/cp-letter/`.

**Complication:** The current production letter (`/letter/*`, `letter-flow-content.tsx`) still has the three open critiques from P842 — reveal invisibility (#1), inverted reveal/story hierarchy (#2), and grouping ambiguity (#4). P849 reveal-dwell instrumentation is now live in prod collecting the baseline. Nothing has changed in the actual product yet.

**Question:** How do we port the validated Phase A design into the React letter flow, reusing the existing design system and position-selection logic, without touching the data model, scoring, or /live?

## Appetite

**Blast radius:** Medium-high — the primary recipient-facing flow. Contained to the `/letter/*` route family and its components. No data model, scoring, or /live changes.

**Reversibility:** High — revert the merge. Medium in perception once redesigned letters are in the world.

**Decision density:** Low-medium — the big calls were made in P842/Phase A review (see Locked Decisions). One open `[FOUNDER DECISION]` remains (chapter title source). Component reuse-vs-new is a `/ui` decision, not resolved here.

## Solution

Port the validated whole-flow design into cp, screen by screen, reusing existing components/logic where possible and introducing new presentation chrome where the design requires it. `/ui` produces the Component Map (Reuse / Extend / Extract / New) before `/architect`.

**Screen-by-screen build target** (see Visual Reference for mockups):

- **Cover** — editorial title "For you / From [author]", meta line (N chapters · M points · ~time), "Open the Letter", calm microcopy. Composition adopted; existing brand tokens kept.
- **Progress** — top-left bar. A letter = N **Chapters** (each chapter = one unit: anti-point → story → point(s)). Label **"Chapter 1 of N"** (count chapters, not stories); bar shows within-chapter position. Persists across all screens. This is the grouping-legibility fix (critique #4).
- **Anti-point engage** — question framing above ("To what extent do you agree?"), belief statement big and central, big position buttons. Big/central presentation **reusing the existing position-selection logic** (3-button expandable to 7-point adjustable scale). CTA "Lock in your position".
- **Reveal (one parameterized component, reused for anti-point / point / story)** — "Calibration" framing, bigger avatars (show photos). **Points/anti-points:** side-by-side ordinal stances (YOU vs author, word labels) — NO continuous scale, NO numeric gap (ordinal Likert). **Stories:** 0–10 numeric understanding gap. Fixes critiques #1 (invisibility) + #2 (hierarchy). Advance CTAs: "Read [author]'s story" (post anti-point) / "Next point" / "Next chapter".
- **Story read + rate** — keep 0–10 self-calibration rating, but make the **question more prominent**. Replace the old "drawer" with the new presentation. CTA "Continue".
- **Completion** — "A Moment of Shared Clarity" retrospective recap: per-chapter gaps + journey viz. Safe to reveal shape/insight here (post-flow).

## Locked Decisions (from Phase A founder review)

1. **Composition only, keep brand tokens** — adopt layout / hierarchy / big-central / divergence-reveal / top-left-progress / whitespace; keep existing color + font tokens. No rebrand; stay consistent with the rest of ClarityPledge.
2. **Chapter labels numeric pre-commit** — "Chapter 1 of N" before the reader commits to the anti-point; thematic chapter title appears only from the reveal onward (protects the unprimed measurement).
3. **Whole flow at once** — not piecemeal.
4. **One reveal component, two value-display modes** — ordinal side-by-side (points), numeric 0–10 (stories), shared shell.

## Risks / Non-Goals

### Risks
- **Story-first path missed.** NOT every chapter opens with an anti-point. Per `useLetterReadingState.initialPhase`: 2+ visible points → anti-point leads; 0–1 → story comes first. The SD mockups only showed the anti-point-lead path. **Mitigation:** Phase B MUST handle both; verify against the state machine before building, and test a story-first chapter.
- **Priming leak via titles/labels.** A content title or the author's point-position shown before the reader commits to the anti-point contaminates the genuine "before" position (the measurement backbone for proving a later /live flip). **Mitigation:** numeric chapter labels pre-commit; thematic titles only post-reveal; never render author point-positions before commit.
- **Brand drift.** Adopting composition can creep into token changes. **Mitigation:** `/ui` Component Map must mark token changes explicitly; default is reuse existing tokens.
- **Reveal-component over-abstraction.** Two modes in one component can bloat. **Mitigation:** shared shell + two value renderers; don't add a third mode speculatively.

### Non-Goals
- Do NOT change the letter data model or the anti-point → story → point structure.
- Do NOT redesign /live or any author-side flow.
- Do NOT change scoring logic or the calibration computation.
- Do NOT add new database tables or migrations.
- Do NOT redesign the letter overview screen — that's P836's territory.
- Do NOT wholesale-revise the color palette or font family (Locked Decision 1).
- Do NOT ship before the P849 baseline window (see Done-When).

## Done-When

- [ ] Cover, engage, reveal, story-rate, story-reveal, point-reveal, completion screens match the Phase A direction, rendered in existing brand tokens.
- [ ] Top-left chapter progress bar persists across all screens; labels "Chapter X of N".
- [ ] Reveal is unmissable (critique #1) and outweighs the story card (critique #2) — verified in browser at 375/390/desktop.
- [ ] Both chapter structures work: anti-point-lead AND story-first (critique re: state machine).
- [ ] Position-selection logic reused (not reimplemented); only presentation is new.
- [ ] Points reveal as side-by-side ordinal stances (no scale/number); stories reveal as 0–10 gap.
- [ ] No regressions to letter submission, RLS, or completion flow (existing letter tests pass).
- [ ] Ships only after ≥3 days of P849 prod baseline data exists (P849 deployed 2026-05-22).

## UX Notes

- States to cover end-to-end: cover → (per chapter: anti-point engage → reveal → story rate → reveal → point engage → reveal → …) → next chapter → completion. Plus the story-first chapter variant.
- Reveal is automatic on submit; advance is a separate explicit action (engage = commit CTA, reveal = advance CTA).
- Advance CTA names what's next ("Next point" / "Next chapter"); never editorializes the prior screen.
- Empty/edge: chapter with only 1 visible point (story-first), letter with 1 chapter, very long anti-point text, missing author avatar (initials fallback).

## Visual Reference

- **SD project:** https://app.superdesign.dev/teams/a525892e-24b8-4db0-bffa-390290aab6b9/projects/ea8736d4-4845-469b-8efa-726dbac174b2
- **Mockups + brief:** `~/Projects/public/superdesign-playground/cp-letter/` (`brief.md`, `variants.md`, `screenshots/`)
- **Key validated screens:** cover, anti-point engage (`2c8aced5`), anti-point reveal side-by-side (`a92de73e`), unit-2 engage / grouping (`48b36960`), completion (`055b3c58`).
- These are **inspiration for layout/hierarchy/rhythm** — render in the existing design system, not pixel-copied. `/ui` does the translation.

## Founder Decisions (open)

- [FOUNDER DECISION] Thematic chapter title (shown post-reveal): auto-summarized from story content, or author-provided? Auto-summary risks drift; author-provided adds composer burden. Resolve before `/ui`.

## Predecessor

- **P842** — letter full-flow UX redesign (Phase A: SuperDesign exploration + chosen direction). This spec implements P842's Phase A outcome.
- **P849** — reveal-dwell instrumentation (the success metric; gates the ship).
- **P846** — letter chrome cleanup (cleared critiques #3 sticky-progress + #5 footer).
- **P836** — letter overview structural redesign (adjacent; coordinate, don't merge scopes).

## Next Steps

1. `/challenge-prd p852` — stress-test before design work (optional; Phase A already de-risked the direction).
2. `/ui p852` — Component Map: reuse-vs-new per element, flag any token evolution, design the big-central point card + the parameterized reveal component.
3. `/architect → /generate-tests → /dev`.
4. Hold the ship until the P849 baseline window passes.
