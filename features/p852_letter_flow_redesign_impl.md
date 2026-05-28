---
status: today
type: story
rank: 0.01
workstream: letter
created_date: '2026-05-27'
tags:
  - letter
  - ux
  - redesign
  - phase-b
changes: p842
delivery_stage: ui
pipeline_ran:
  - create-spec
  - ui
locked_at: '2026-05-27T07:12:03.206Z'
---

# P852: Letter full-flow UX redesign — Phase B (implementation)

## Problem

**Situation:** P842 (Phase A) ran a SuperDesign exploration of the letter flow and the founder picked a direction: a light-theme, whole-flow redesign that makes the calibration reveal unmissable, makes the chapter grouping legible, and fixes the inverted hierarchy. The validated mockups live in the SD project + `sd/cp-letter/`.

**Complication:** The current production letter (`/letter/*`, `letter-flow-content.tsx`) still has the three open critiques from P842 — reveal invisibility (#1), inverted reveal/story hierarchy (#2), and grouping ambiguity (#4). P849 reveal-dwell instrumentation is now live in prod collecting the baseline. Nothing has changed in the actual product yet.

**Question:** How do we port the validated Phase A design into the React letter flow, reusing the existing design system and position-selection logic, without touching the data model, scoring, or /live?

## Appetite

**Blast radius:** Medium-high — the primary recipient-facing flow. Contained to the `/letter/*` route family and its components. No data model, scoring, or /live changes.

**Reversibility:** High — revert the merge. Medium in perception once redesigned letters are in the world.

**Decision density:** Low-medium — the big calls were made in P842/Phase A review (see Locked Decisions). The chapter-title founder decision was resolved during `/ui`: no thematic title — numeric "Chapter X of N" only (see Component Strategy). Component reuse-vs-new resolved by `/ui`.

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

## Predecessor

- **P842** — letter full-flow UX redesign (Phase A: SuperDesign exploration + chosen direction). This spec implements P842's Phase A outcome.
- **P849** — reveal-dwell instrumentation (the success metric; gates the ship).
- **P846** — letter chrome cleanup (cleared critiques #3 sticky-progress + #5 footer).
- **P836** — letter overview structural redesign (adjacent; coordinate, don't merge scopes).

## Phase 1 Outcome — Preview harness (APPROVED 2026-05-27)

Founder approved the preview after 5 review rounds (validated in-browser at 320/390/desktop against the P842 SuperDesign references). Critiques #1 (reveal invisibility), #2 (inverted hierarchy), #4 (grouping ambiguity) all resolved.

**Approved components (dev-only preview, committed on this branch):**
- `src/app/components/letters/letter-point-card.tsx` — big-central belief statement + centered position slot
- `src/app/components/letters/letter-reveal-card.tsx` — shared shell: "Listening calibration" header + blue ear marker (lucide `Ear`), avatar pair, no pledge ring in reveal
- `src/app/components/letters/letter-reveal-ordinal.tsx` — side-by-side **full-word** stance badges (points/anti-points); NO scale; no duplicate name headers
- `src/app/components/letters/letter-reveal-numeric.tsx` — **horizontal 0–10 scale** (story): two markers (reader/author) + highlighted gap segment; the min is the lower marker
- `src/app/pages/letter-redesign-preview-page.tsx` + route `/_preview/letter-redesign` — dev-only harness; remove or keep-gated at integration

**Locked design decisions (constraints for `/architect` + `/dev` — do NOT re-litigate):**
1. **Brand tokens kept.** Blue (#0044CC) CTAs + serif titles. NOT dark navy (founder considered, rejected — would split the brand; a system-wide dark-CTA refresh is a separate project).
2. **CTAs are big, full-width blue pills with icons inside** (envelope on cover/open, arrow → on advance). Must read as unmistakably the primary action.
3. **Segmented chapter progress bar** — one segment per chapter (adopted from the production bar the founder liked); teaches "chapter" visually. "Chapter X of N" label kept. No thematic chapter title (earlier decision).
4. **Reveal split by data type:** ordinal points = side-by-side word badges (no scale); story = horizontal 0–10 scale. Both inside the shared `LetterRevealCard` shell.
5. **Pre-commit priming integrity:** community position counts are HIDDEN on engage screens (pre-commit). Integration MUST enforce this against real data — never render the author's position or aggregate counts before the reader commits.
6. **Story-rate is NOT redesigned — reuse the existing production implementation.** Keep the current production story card (`LiveStoryCardExpanded`) + its **fixed, non-scrollable** rating drawer as-is. The preview's story-rate is a scrolling **stand-in** (mock, navigation filler) — do NOT port it; the production story card + fixed drawer is the target (founder: "the story card is special… the drawer should be fixed, current implementation is better").
7. **Completion:** reframed to **"A Moment of Intellectual Integrity"** + subtext "Being clear where you stand, and honest about how much you believe you understand." Trimmed to the moment + single CTA; the full per-chapter recap lives on the results page, not inline.
8. **No "recursive understanding" terminology on-screen** — deferred (founder content decision). The numeric scale shows the min implicitly (lower marker); no jargon label.
9. **Reveal headers by semantics:** points reveal = "Where you each stand" (plain, no ear — it just reveals positions). Story reveal = "Listening calibration" + blue ear marker (this is the actual calibration moment). Positions/values are the hero; avatars are small attribution (on markers for the numeric scale).
10. **Engage:** belief statement in a PointRow-style card (gray-50, blue pin); position buttons use the shared `PositionButtons` `size="lg"` (full-width, centered, larger); "Lock in your position" CTA carries a lock icon.

## Phase 2 Integration Tasks (surfaced during preview, need real components)

- **`PositionButtons` intensity dropdown — mobile UX.** The click-again intensity menu (Somewhat/Strongly/Clear) is the shared `/live` component and reads as not mobile-optimized (cramped dropdown). Improve its mobile treatment (bigger touch targets / bottom-sheet pattern / positioning) **in integration, with two-party `/live` E2E** per `.claude/rules/live.md` — never blind-tuned in the presentational preview.
- **Drawer/story-card seam.** Reusing the existing production story card + sticky drawer (decision 6) next to the new screens may leave a visual seam; reconcile lightly against the real components (don't redesign the drawer).

## Deferred / Out of Scope (track separately)

- **Production avatar bug:** the live letter cover shows author initials instead of the Google photo (`photoUrl` not passed/resolved). Separate `/fix`, not part of P852.
- **"Recursive understanding" principle copy:** founder to provide wording for the numeric reveal in a later content pass.
- **Meta-line copy** ("chapters" vs "stories"): copy decision; the segmented bar reduces the ambiguity.

## Next Steps

1. **Phase 2 — Integration (current).** `/architect → /generate-tests → /dev` to port the *approved components above* into `letter-flow-content.tsx` with real data, the `useLetterReadingState` machine, and RLS. Honor the Locked design decisions. Existing letter tests must pass. Verify both chapter types (anti-point-lead + story-first) and 320/390/desktop.
2. Hold the ship until the P849 baseline window passes (P849 deployed 2026-05-22).

## Component Strategy

> **Design intent source:** P842 Phase A (SuperDesign exploration + founder-chosen direction). No `/ux` run was performed; the authoritative design input is this spec's `## Solution`, `## Locked Decisions`, `## UX Notes`, and `## Visual Reference`. SuperDesign mockups are layout/rhythm inspiration, rendered in the existing design system — not pixel-copied.
>
> **Resolved founder decision:** The thematic chapter title is NOT shipped in Phase B. The flow uses numeric "Chapter X of N" labels only throughout. No title-display element exists anywhere in this component map.

---

### Step 0 — Reality Verification

**`initialPhase` logic** (confirmed from `src/app/hooks/useLetterReadingState.ts`, lines 169–175):

```ts
function initialPhase(snapshot: LetterStorySnapshot): StoryPhase {
  const visibleCount = getVisiblePointCount(snapshot);
  // D36: 0-1 visible points → story first
  if (visibleCount <= 1) return 'story-rate';
  // 2+ visible points → anti-point lead (first point before story)
  return 'point-engage';
}
```

This confirms Risk #1: 0–1 visible points → chapter starts at `story-rate`, bypassing anti-point engage entirely. The redesign must handle both entry points. The state machine is already correct — Phase B adds presentation chrome on top, not logic changes.

**Existing phase sequence** (6 named phases in `letter-flow-content.tsx`):
- `point-engage` / `point-revealed` — anti-point lead chapters
- `story-rate` / `story-revealed` — story rating and its reveal
- `remaining-point-engage` / `remaining-point-revealed` — post-story point(s)

The spec's "anti-point → story → point" maps cleanly onto the existing phase names. No state machine changes needed.

**Existing components used by letter flow:**
- `LetterCover` — cover screen (already matches spec target closely)
- `LetterProgressBar` — segmented bar (needs label upgrade to "Chapter X of N")
- `PointRow` (from `live-story-card-expanded.tsx`) — engage + revealed phases; contains `PositionButtons` for 3→7 selection
- `PositionButtons` (from `shared/PositionButton.tsx`) — the 3-button expandable-to-7-point selector
- `LiveStoryCardExpanded` — story card (story-rate, story-revealed phases)
- `ComprehensionRatingCard` — 0–10 self-calibration rating
- `JourneyToUnderstanding` (from `live-mode-view.tsx`) — numeric gap visualization
- `GapBanner` — story gap banner
- `LetterCompletionSummary` — completion celebration
- `FixedBottomBar` — fixed bottom CTA bar
- `GravatarAvatar` / `PersonAvatar` — avatar rendering with initials fallback and pledge ring
- `FocusHeader` — "Leave letter" back nav

---

### Component Inventory

**Design system primitives** (`src/components/ui/`):
`accordion`, `button`, `checkbox`, `clarity-loader`, `clarity-logo`, `dialog`, `drawer`, `dropdown-menu`, `ear-badge`, `gravatar-avatar`, `input`, `label`, `person-avatar`, `popover`, `scroll-area`, `slider`, `sonner`, `tabs`, `textarea`, `tooltip`, `understood-badge`

**Letter feature components** (`src/app/components/letters/`):
`letter-cover`, `letter-flow-content`, `letter-progress-bar`, `letter-completion-summary`, `letter-participant-row`, `letter-prediction-walk`, `story-walk`, `letter-review-screen`, and others not in scope.

**Shared feature components** (in scope):
`gap-banner`, `comprehension-rating-card`, `fixed-bottom-bar`, `position-selector` (simple 3-button, no expand — used in compose context), `PositionBadge`, `PositionButtons` (3→7 with expand), `ThreadLine`, `PositionButton`

**Partners feature components** (in scope):
`live-story-card-expanded` (exports `LiveStoryCardExpanded` + `PointRow`), `live-mode-view` (exports `JourneyToUnderstanding`), `position-buttons.tsx` (different file — the `/live` session-level agree/disagree, NOT used in letter flow)

---

### Component Map

| Element | Classification | File / Notes | Decision needed? |
|---------|---------------|--------------|-----------------|
| Cover — layout, "For you / From [author]", meta line, "Open the Letter" CTA | **Reuse** | `src/app/components/letters/letter-cover.tsx` — already has `LetterParticipantRow`, Playfair serif title, meta line, button. Update copy strings only. | No |
| Cover — "calm microcopy" below CTA | **Extend** | `letter-cover.tsx`: add optional `microcopy?: string` prop below the consent block. One new prop. | No |
| Progress bar — visual bar | **Extend** | `src/app/components/letters/letter-progress-bar.tsx` — currently tracks stories; needs chapter-aware props: `currentChapter`, `totalChapters`, `withinChapterProgress`. Also update `aria-label`. The chapter = the "story" unit in the spec. Rename displayed label, not internal state. | No |
| Progress bar — "Chapter X of N" label | **Extend** | Same file — add `<p>` label above or inline with the bar. Use `text-[#1A1A1A]/50 text-xs` (matches existing meta-text style). | No |
| Progress container — top-left, fixed, persistent | **Reuse** | `letter-flow-content.tsx` lines 290–298: existing `position:fixed top-16 bg-background` bar. No change needed to the container. | No |
| Anti-point engage — question framing ("To what extent do you agree?") | **New** | New heading element inside `LetterFlowContent`'s `point-engage` phase block. Not a component — inline `<p>` with `text-[#1A1A1A]/60 text-sm text-center mb-4`. | No |
| Anti-point engage — belief statement big/central presentation | **New** | `src/app/components/letters/letter-point-card.tsx` — new component. Renders the point statement prominently (`text-xl font-semibold text-[#1A1A1A] text-center px-6 py-8`). Wraps statement text; does NOT replicate position-selection logic. Slots `PositionButtons` as `children`. | No |
| Anti-point engage — position selection (3→7) | **Reuse** | `PositionButtons` from `src/app/components/shared/PositionButton.tsx` — already the 3-button expandable-to-7-point selector used inside `PointRow`. The new `LetterPointCard` receives `onPositionClick` and passes it through. No logic change. | No |
| Anti-point engage — "Lock in your position" CTA | **Extend** | `FixedBottomBar` + `Button` — change button label from "Submit" to "Lock in your position". One string change in `letter-flow-content.tsx`. | No |
| Reveal shell — shared "Calibration" framing, avatar pair, advance CTA | **New** | `src/app/components/letters/letter-reveal-card.tsx` — the central new component. Shared shell: "Calibration" heading, two avatar columns (YOU / author), value renderer slot, advance CTA. Props: `revealMode: 'ordinal' \| 'numeric'`, `readerName`, `readerAvatarUrl`, `readerAvatarColor`, `readerHasPledged`, `authorName`, `authorAvatarUrl`, `authorAvatarColor`, `authorHasPledged`, `advanceCta: string`, `onAdvance: () => void`, `children` (for value renderer). | No |
| Reveal value — ordinal side-by-side stances (points/anti-points) | **New** | `src/app/components/letters/letter-reveal-ordinal.tsx` — renderer for `revealMode='ordinal'`. Shows `PositionBadge` for reader and author side by side. No scale. No numeric gap. Pure display. | No |
| Reveal value — 0–10 numeric gap (story) | **New** | `src/app/components/letters/letter-reveal-numeric.tsx` — renderer for `revealMode='numeric'`. Shows the 0–10 difference with `JourneyToUnderstanding` + `GapBanner` (both already exist). A thin wrapper that passes props through — not logic, just composition slot. | No |
| Reveal — bigger avatars | **Extend** | `GravatarAvatar` supports `size="lg"` (w-16 h-16) and `size="xl"` (w-24 h-24). Pass `size="lg"` in `LetterRevealCard`. No new code — existing prop. | No |
| Story read + rate — story card | **Reuse** | `LiveStoryCardExpanded` with `hidePoints readOnly defaultStoryExpanded` — already used in `story-rate` phase. No change. | No |
| Story read + rate — question prominence | **Extend** | `ComprehensionRatingCard` — add `questionSize?: 'default' \| 'lg'` prop (or pass `className` which is already supported to override `text-lg` with `text-xl font-semibold`). Use existing `className` prop: `className="text-xl"` on the `question` heading inside the card. Actually `question` renders as `<h2 className="text-lg font-semibold text-center">` — use className to override at call site or accept `questionClassName` prop. Minimal extend. | No |
| Story read + rate — CTA "Continue" | **Reuse** | `FixedBottomBar` + `Button`. Change label at call site. | No |
| Completion — "Moment of Shared Clarity" retrospective recap | **Extend** | `src/app/components/letters/letter-completion-summary.tsx` — currently shows confetti + "See Your Letter Summary" nav. Extend to add per-chapter gap recap inline before the nav button. New `chapterGaps?: Array<{chapter: number; gap: number \| null}>` prop for optional inline recap. Results-page deep-dive stays on `letter-results-page.tsx`. | No |
| `RemovePositionDialog` | **Reuse** | `src/app/components/shared/remove-position-dialog.tsx` — already wired in `letter-flow-content.tsx`. No change. | No |
| `FocusHeader` | **Reuse** | `src/app/components/layout/focus-header.tsx` — no change. | No |

**Extraction plan note:** No extraction needed beyond the two new letter-scoped components (`LetterPointCard`, `LetterRevealCard`) and two renderers (`LetterRevealOrdinal`, `LetterRevealNumeric`). All are new — no duplication exists yet to extract.

---

### Composition Tree

State lives in `useLetterReadingState` (unchanged hook). `LetterFlowContent` owns the phase switch.

```
<LetterReadingPage>
  └── <LetterCover />                          {/* screen 1: cover */}

  └── <LetterFlowContent readingState={...}>   {/* screens 2–5, per chapter */}
        ├── <FocusHeader />                    {/* "Leave letter" */}
        │
        ├── /* progress — fixed, persistent */
        │   <div fixed top-16>
        │     <LetterProgressBar
        │       currentChapter={storyIndex}   {/* chapter = story unit */}
        │       totalChapters={snapshots.length}
        │       withinChapterProgress={storyProgress}
        │     />
        │     <p>"Chapter {N} of {M}"</p>
        │   </div>
        │
        │
        │   /* ── ANTI-POINT-LEAD CHAPTER (initialPhase = 'point-engage') ── */
        │
        ├── {currentPhase === 'point-engage'} →
        │   <LetterPointCard statement={point.statement}>
        │     <p framing>"To what extent do you agree?"</p>
        │     <PositionButtons                 {/* REUSED — 3→7 logic unchanged */}
        │       userPosition={selectedPosition}
        │       counts={toSevenPointCounts(point.positionCounts)}
        │       onPositionClick={setSelectedPosition}
        │     />
        │   </LetterPointCard>
        │   <FixedBottomBar>
        │     <Button disabled={!selectedPosition} onClick={handleSubmit}>
        │       Lock in your position
        │     </Button>
        │   </FixedBottomBar>
        │
        ├── {currentPhase === 'point-revealed'} →   /* anti-point reveal */
        │   <LetterRevealCard
        │     revealMode="ordinal"
        │     readerName={receiverName} readerAvatarUrl={...}
        │     authorName={senderName}   authorAvatarUrl={...}
        │     advanceCta="Read [author]'s story"
        │     onAdvance={advanceFromPointReveal}
        │   >
        │     <LetterRevealOrdinal
        │       readerPosition={resolveRevealedUserPosition(point.id)}
        │       authorPosition={point.profileSubjectPosition}
        │     />
        │   </LetterRevealCard>
        │   {showAdvanceButton && <FixedBottomBar><Button>Read {senderName}'s story</Button></FixedBottomBar>}
        │
        │
        │   /* ── STORY PHASE (both chapter types meet here) ── */
        │
        ├── {currentPhase === 'story-rate'} →
        │   <LiveStoryCardExpanded story={storyWithPoints} hidePoints readOnly />
        │   <FixedBottomBar>
        │     <ComprehensionRatingCard
        │       question="How well do you believe you understand [author]'s intention?"
        │       questionClassName="text-xl font-semibold"   {/* prominence fix */}
        │       onSelect={handleSubmitRating}
        │       submitLabel="Continue"
        │     />
        │   </FixedBottomBar>
        │
        ├── {currentPhase === 'story-revealed'} →   /* story reveal */
        │   <LetterRevealCard
        │     revealMode="numeric"
        │     readerName={receiverName} ...
        │     authorName={senderName}   ...
        │     advanceCta={hasRemainingPoints ? "Next point" : isFinalStory ? "Complete Letter" : "Next chapter"}
        │     onAdvance={advanceFromStoryReveal}
        │   >
        │     <LetterRevealNumeric
        │       checkerRating={prediction} responderRating={rating}
        │       gap={gap} senderName={senderName} isOverconfident={isOverconfident}
        │     />
        │   </LetterRevealCard>
        │
        │
        │   /* ── STORY-FIRST CHAPTER VARIANT ── */
        │   /* initialPhase='story-rate' → starts directly at story-rate above.
        │      After story-revealed, if visiblePoints.length === 1, goes to
        │      remaining-point-engage. Same component tree, different entry. */
        │
        │
        │   /* ── POST-STORY POINT(S) ── */
        │
        ├── {currentPhase === 'remaining-point-engage'} →   /* identical to point-engage */
        │   <LetterPointCard ...>
        │     <PositionButtons ... />
        │   </LetterPointCard>
        │   <FixedBottomBar><Button>Lock in your position</Button></FixedBottomBar>
        │
        ├── {currentPhase === 'remaining-point-revealed'} →
        │   <LetterRevealCard revealMode="ordinal" advanceCta="Next chapter"|"Complete Letter">
        │     <LetterRevealOrdinal ... />
        │   </LetterRevealCard>
        │
        └── <RemovePositionDialog />             {/* guard dialog — unchanged */}

  └── {state.isComplete} →
      <LetterCompletionSummary
        chapterGaps={perChapterGaps}             {/* new prop — inline recap */}
      />
```

**Story-first chapter verification:** When `initialPhase = 'story-rate'` (0–1 visible points), the flow jumps directly to `story-rate`. After `story-revealed`, if `visiblePoints.length === 1`, the existing state machine transitions to `remaining-point-engage`. The composition tree handles this correctly — no separate code path needed. The single visible point in a story-first chapter gets `remaining-point-engage` / `remaining-point-revealed`, which both use `LetterRevealCard revealMode="ordinal"`.

---

### Visual Specification

> Design intent sourced from P842 Phase A (Solution + Visual Reference + Locked Decisions) — no `/ux` run.

**Token set** (confirmed from `src/index.css` + `tailwind.config.js`):
- Brand blue: `#0044CC` (hardcoded in existing components) / `bg-blue-600` (Tailwind scale)
- Foreground: `text-[#1A1A1A]` / `text-foreground`
- Muted: `text-[#1A1A1A]/50`, `text-muted-foreground`
- Serif font: `font-serif` (Playfair Display, already self-hosted)
- Background: `bg-background` / `bg-white`
- Border: `border` / `border-border` / `border-gray-200`
- Animation: `animate-fade-in` (keyframe defined in config), `transition-[width] duration-300`
- Radius: `rounded-lg` (default `var(--radius)` = 0.5rem), `rounded-xl`

**No token changes proposed. All classes below exist in the project.**

#### Visual Hierarchy (per screen)

**Cover** (unchanged from current — already correct):
- Primary: `text-2xl md:text-3xl font-serif text-[#1A1A1A]` — "For {receiver}"
- Secondary: `LetterParticipantRow` — "From [author]" with avatar
- Tertiary: meta line `text-sm text-[#1A1A1A]/50` — chapters/points/minutes
- CTA: `bg-[#0044CC] text-white text-base px-8 py-6`

**Anti-point engage** (new `LetterPointCard`):
- Framing question: `text-sm text-[#1A1A1A]/50 text-center uppercase tracking-wide` — tertiary
- Belief statement: `text-xl font-semibold text-[#1A1A1A] text-center leading-snug px-4 py-8` — primary (critique #1 encode: this is the focal element)
- Position buttons: secondary — `PositionButtons` at natural size below statement
- CTA: tertiary — `FixedBottomBar` + `bg-[#0044CC] text-white`

**Reveal** (new `LetterRevealCard`) — critiques #1 and #2 encoded here:
- "Calibration" label: `text-xs uppercase tracking-widest text-[#1A1A1A]/40 text-center` — orientation, not primary
- Avatar pair (YOU / author): `size="lg"` (w-16 h-16) — visually prominent, secondary
- Value display (ordinal badges or numeric gap): **primary** — largest type weight, center stage. For ordinal: `text-lg font-semibold`; for numeric: JourneyToUnderstanding + GapBanner (existing hierarchy kept, centered). Critique #1 (reveal unmissable): the reveal card fills the full content column with no competing sidebar. Critique #2 (reveal outweighs story card): the story card (`LiveStoryCardExpanded`) renders BELOW the reveal card and at reduced visual weight — the reveal card has no border-left accent and uses the full width.
- Advance CTA: `FixedBottomBar` bottom — delayed 400ms (existing `showAdvanceButton` behavior, unchanged)

**Story rate**:
- Story card: secondary (existing `LiveStoryCardExpanded` style — border-l-4 border-l-blue-500, compact)
- Rating question: primary — upgrade to `text-xl font-semibold text-center` (currently `text-lg`)
- Rating buttons: primary — `RatingButtons` component (unchanged)

**Completion**:
- "A Moment of Shared Clarity": `text-3xl font-serif text-[#1A1A1A] text-center` — primary (matches existing `LetterCompletionSummary` style)
- Per-chapter gap recap: secondary — `gap-banner` style inline, compact

#### Emotional Register

**Calm / ceremonial.** Expressed via: generous vertical padding (`py-8` on point statement, `py-6` on reveal shell), Playfair serif on titles, reduced border decoration (no border-left accents on new cards), `bg-white` / `bg-background` surfaces (no colored backgrounds on engage cards — point statement floats on white), lowercase tracking labels for framing. Must NOT feel: dense, gamified, rushed, clinical.

**Negative constraints** (ruled out):
- No `border-l-4 border-l-blue-500` accent on the new `LetterPointCard` or `LetterRevealCard` (that pattern belongs to `LiveStoryCardExpanded` in /live context; avoid cross-context visual noise)
- No `shadow-md` / `shadow-lg` on point or reveal cards (shadow adds elevation signal, implies a modal overlay; the redesign is full-page, not overlay)
- No color fills on the point statement background (avoid green/amber/red which signal correctness before commit — priming risk)
- No animation on the point statement itself (animating before commit creates performance pressure)
- No modal / drawer chrome for position selection (spec explicitly replaces the old Drawer pattern with inline full-page layout)

#### Spacing per Zone

| Zone | Classes |
|------|---------|
| Page top (below fixed progress bar) | `mt-6` — matches current `mt-4` + extra for breathing room |
| Framing question above statement | `mb-3` |
| Point statement block | `px-6 py-8 text-center` |
| Between statement and position buttons | `mt-6` |
| Between position buttons and FixedBottomBar | handled by `FixedBottomBar` position:fixed clearance — add `pb-24` to page scroll area |
| Reveal card outer | `px-4 py-8` |
| Avatar pair row | `gap-8 justify-center py-4` |
| Between avatar pair and value display | `mt-6` |
| Between sections in scroll area | `space-y-6` (existing `letter-flow-content.tsx` outer div) |
| Completion inner | `space-y-6 px-4` (existing) |

#### Animation / Transition

- **Reveal card entrance:** `animate-fade-in` (0.5s ease-out — defined in `tailwind.config.js`). Fires when `LetterRevealCard` mounts, which happens on phase transition. Rationale: the reveal is the emotional peak — a brief fade-in signals "something important appeared" without performance pressure. The 400ms advance-button delay (existing) remains unchanged.
- **Ordinal stance labels:** no animation — position labels are static display after reveal.
- **Progress bar sub-fill:** `transition-[width] duration-300` (existing `LetterProgressBar` — unchanged).
- **Story card on story-rate:** no animation — it was visible on the prior screen conceptually; no need to re-enter.

#### Implementation Refinements

- **Shadow:** `shadow-sm` on `LetterRevealCard` outer container (matches `LiveStoryCardExpanded` subtlety without elevation). No shadow on `LetterPointCard`.
- **Radius:** `rounded-xl` on `LetterRevealCard` and `LetterPointCard` (one step above `rounded-lg` — warmer, more inviting than sharp corners or default radius).
- **Avatar hover/focus in reveal:** avatars are display-only in reveal — no interactive state needed. `pointer-events-none` on avatar containers inside `LetterRevealCard`.
- **Focus ring on position buttons:** existing `PositionButtons` focus handling unchanged — `ring` on keyboard focus via Tailwind default.
- **Ordinal badge contrast:** `PositionBadge` already uses `bg-blue-100 text-blue-700` — sufficient contrast. Render at `text-base` (not `text-xs`) in `LetterRevealOrdinal` by wrapping in a sized container rather than modifying `PositionBadge` itself.

---

### Extraction Plan

This feature introduces 4 new components and modifies 3 existing ones. No extraction of duplicated patterns is needed as a prerequisite — the new components are additive.

**However:** `PointRow` in `live-story-card-expanded.tsx` is the current presentation for engage phases. The new `LetterPointCard` replaces the presentation wrapper around `PositionButtons` in `letter-flow-content.tsx` — `PointRow` continues to be used in `/live`. There is no code to extract. The key architectural discipline is: `LetterPointCard` accepts `statement` + `children` (position buttons slot), and does NOT re-implement `PositionButtons` logic. The existing `PositionButtons` is passed in as a child — this is the boundary that prevents logic duplication.

**One pattern to watch:** `JourneyToUnderstanding` is imported from `live-mode-view.tsx` (a large file). `LetterRevealNumeric` will wrap it. If `live-mode-view.tsx` ever becomes a tree-shaking problem, extract `JourneyToUnderstanding` to its own file. Not a blocker for Phase B — mark as future cleanup.

---

### Challenge Notes

#### Challenge Note 1 — Story-first chapter: design works, but advance CTA naming needs care

**Evidence:** The SD mockups showed anti-point-lead chapters only (Risk #1, confirmed). In a story-first chapter (`initialPhase = 'story-rate'`), the flow is: `story-rate` → `story-revealed` → `remaining-point-engage` → `remaining-point-revealed`. The `LetterRevealCard` for `story-revealed` uses `advanceCta`. The spec says CTA should be "Next point" when points follow. But in a story-first chapter, after `story-revealed`, the next thing is a point — not a chapter boundary. The CTA "Next point" is correct. After `remaining-point-revealed`, the CTA is "Next chapter" or "Complete Letter". This naming works — no design breakage.

**Minor risk:** On `story-revealed` in a story-first chapter with 1 point, `hasRemainingPoints` is true, so the CTA reads "Next point" — correct. On `remaining-point-revealed`, `isFinalStory` and point index determine "Next chapter" vs "Complete Letter" — also correct. The existing logic in `letter-flow-content.tsx` (lines 422–435) handles this already.

**Verdict: Non-blocking.** The advance CTA logic in the existing code is compatible. No design change needed. Note for `/architect`: verify the CTA string derivation for all story-first chapter states in the implementation task.

#### Challenge Note 2 — 320px overflow risk: LetterRevealCard avatar pair + position badges

**Evidence:** `GravatarAvatar size="lg"` renders at `w-16 h-16` (64px each). Two avatars with `gap-8` (32px) = 160px total. On 320px viewport, available content width after `px-4` (32px total) = 288px. Two avatars + gap = 160px — fits. But if ordinal `PositionBadge` labels are rendered inline below each avatar column, long labels like "Disagrees+" at `text-base` may overflow at 320px.

**Options:**
- A: Wrap each column in `min-w-0` + `text-center overflow-hidden` and use `text-sm` for ordinal labels at 320px via responsive class (`text-sm md:text-base`).
- B: Reduce avatar size to `size="md"` (w-14 h-14 = 56px) on mobile, `size="lg"` on sm+, using `GravatarAvatar size` driven by a responsive wrapper.
- C: Stack avatars vertically below 375px via `flex-col sm:flex-row`.

**Recommendation: Option A.** Use `text-sm` unconditionally for ordinal stance labels in `LetterRevealOrdinal` (still readable, less overflow risk than `text-base`). Keep `size="lg"` avatars on all viewports — 160px fits 320px comfortably. Add `min-w-0 overflow-hidden` to each column div. No responsive branching needed.

**Blocking: No.** `/architect` should add a 320px screenshot check to the Done-When for `LetterRevealCard`.
