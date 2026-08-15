---
status: all-done
completed_at: 2026-04-17
type: task
rank: 1000696.0
tags: [letters, reading-flow, refactor, polish]
created_date: '2026-04-12'
pipeline_plan: [create-spec, ux, architect, ui, generate-tests, decompose, dev, verify]
pipeline_ran: [create-spec, ux, architect, ui, generate-tests, decompose, dev]
pipeline_skipped: [challenge-prd -- problems confirmed from annotated screenshots not assumptions, spec-review -- fresh spec from current conversation no drift risk]
---

# P696: Letter Reading Flow Polish & Refactor

> **Builds on:** [P673](../../archive/p673_letter_reading_reuses_live_components.md) (reading flow), [P676](../../archive/p676_letter_reading_visual_corrections.md) (visual corrections), [P678](p678_letter_preview_ux_polish.md) (preview polish)

## Problem

**Situation:** The letter reading flow works functionally but has five visual/interaction issues identified during UAT testing of P684. Three duplicated flow components (`LetterPreviewFlow`, `LetterReadingFlow`, `LetterReadingFlowPublic`) make fixes error-prone — each change must be applied in three places.

**Complication:** The duplication isn't just tech debt — it blocks the interaction improvements. Fixing action positioning (Issue D) or button labeling (Issue E) in the current architecture means making the same change three times and keeping them in sync. The flow also lacks content-aware metadata (point counts, accurate reading time) that users need to set expectations before reading.

**Question:** How do we fix the five issues, extract a shared flow component, and establish consistent interaction patterns — all without breaking the reading flow that P673/P676/P678 built?

## Appetite

Medium blast radius (touches letter preview + two reading variants — all letter flows affected). Reversible (branch work, no migrations, no schema changes). Medium decision density — Issues A/B/C are concrete; D/E require design decisions about interaction patterns.

## Solution

Three phases, ordered by dependency:

### Phase 1: Concrete fixes (A+B+C)

**Issue C — Story card centering bug.** `LiveStoryCardExpanded` rendered with `className="w-full max-w-sm"` but no `mx-auto`. Inside the `max-w-md` container (448px), the card caps at 384px and left-aligns, leaving 64px surplus on the right. Fix: add `mx-auto` in 6 locations (2 phases × 3 flows).

**Issue A — Missing point count.** Cover page shows "3 stories · ~8 minutes" but not how many points. Point count is available at reading time via `snapshots[i].point_config.points[]` but not computed or displayed. Drafts list shows only story count — point count requires extending the batch query in `getDocsByUser`.

**Issue B — Reading time formula.** Current formula is `Math.ceil(snapshots.length * 2)` — purely story count × 2 minutes. Ignores point count, text length, interaction time. Proposed: `Math.max(1, Math.ceil(totalPoints + storyCount))` (~1 min per point for reading + position, ~1 min per story for confidence + results). Extract to shared utility — currently duplicated inline in 3 files.

### Phase 2: Extract shared flow component

`LetterPreviewFlow`, `LetterReadingFlow`, and `LetterReadingFlowPublic` are ~200 lines each of near-identical phase-rendering JSX. They share every leaf component but duplicate:
- The `max-w-md mx-auto w-full space-y-6` layout div
- The full 6-phase rendering switch
- `calculateStoryProgress` (verbatim copy in both page files)

Extract a shared `LetterFlow` component parameterized by the 3 differences:
1. `FocusHeader` presence (reading-only, preview has amber banner instead)
2. Auth gate in `story-rate` phase (authenticated reading flow only)
3. Completion view (`LetterRecipientDone` vs `LetterCompletionSummary` vs `LetterResponseSignupForm`)

### Phase 3: Interaction consistency (D+E)

**Issue D — Action position inconsistency.** Primary actions (buttons) sometimes appear mid-content, sometimes in bottom-docked drawers. No consistent spatial contract — user's eyes must hunt each step. Establish a consistent rule across all reading flow steps.

**Issue E — "Continue" button dual-meaning.** The same "Continue" label is used for two semantically different actions: (1) "submit my position" and (2) "advance past the author's position reveal." Creates confusion. Additionally, the author position reveal itself may be too subtle (a small inline text addition easily overlooked).

Resolved approach for D+E:
- **All actions in Drawer** — every phase uses a bottom-docked Drawer for the primary action, creating a fully consistent spatial contract
- Distinct button labels per phase: "Submit Your Position" / "Next" / "Submit My Rating" / "Next Story" / "Complete Letter"
- Reveal visibility: comparison card (You vs Author side-by-side) replaces position selector, with ~400ms delayed button appearance
- Point-level match indicator: neutral (celebration belongs at story-level JourneyToUnderstanding only)

## Risks / Non-Goals

### Risks
- **Refactoring breaks reading flow.** Mitigation: Phase 1 fixes are independent of refactoring; Phase 2 extraction is purely structural (no behavior change); Phase 3 builds on extracted component. Each phase can be verified independently.
- **Preview/reading diverge during refactoring.** Mitigation: extraction preserves all three variant behaviors via props, not by dropping features.
- **D+E design decisions delay the concrete fixes.** Mitigation: phases are ordered so A+B+C ship independently.

### Non-Goals
- Do NOT change the reading flow's phase sequence or add/remove phases
- Do NOT modify database schema (point count on drafts = query-time computation, not a new column)
- Do NOT refactor `useLetterReadingState` hook (separate concern, different scope)
- Do NOT change the compose page flow (only preview + reading)
- Do NOT add new features (bookmarking, sharing, etc.) — this is polish and structural cleanup only

## Alternatives Considered

- **Fix D+E without refactoring first:** Would require applying interaction changes in 3 places, risking inconsistency. Rejected — refactoring is a prerequisite.
- **Full rewrite of reading flow:** Overkill. The leaf components (PointCardWithLinks, LiveStoryCardExpanded, ComprehensionRatingCard) are well-structured. Only the flow orchestration layer needs extraction.
- **Skip point count on drafts list:** Simpler, but drafts list showing "3 stories" while cover shows "3 stories · 9 points" is inconsistent. Include it — the query extension is lightweight.

## Done-When

- [x] Story cards are horizontally centered in the reading flow (preview + both reading variants)
- [x] Cover page displays point count alongside story count and reading time
- [x] Drafts list displays point count alongside story count
- [x] Reading time estimate accounts for point count (not just story count × 2)
- [x] Reading time formula extracted to a shared utility (no inline duplication)
- [x] `LetterPreviewFlow`, `LetterReadingFlow`, `LetterReadingFlowPublic` share a single flow component
- [x] `calculateStoryProgress` exists in one place (shared utility or inside the shared flow component)
- [x] Primary action buttons have consistent vertical positioning across all reading flow steps
- [x] Position submission and post-reveal advancement use distinct button labels
- [x] Author position reveal is visually prominent (not easily overlooked)
- [x] All changes apply to both preview and reading views via the shared component

## Acceptance Criteria

- [x] Centering fix verified at viewport widths: 375px (mobile), 768px (tablet), 1280px (desktop)
- [x] Metadata on cover page reads: "N stories · M points · ~X minutes"
- [x] Metadata on drafts list reads: "N stories · M points"
- [x] Reading time for 3 stories / 9 points = ~12 minutes (not ~6)
- [x] Shared flow component handles all 3 variants: preview, authenticated reading, public reading
- [x] No visual regression in existing reading flow behavior
- [x] Button labels: "Submit Your Position" (engage), "Next" (post-reveal), "Submit My Rating" (rating), "Next Story" / "Complete Letter" (advance)
- [x] Reveal pattern: comparison card (You vs Author side-by-side) with ~400ms delayed button fade-in
- [x] All primary actions rendered inside bottom-docked Drawer (consistent spatial contract)

## UX Design

### Design Principles

1. **Consistent action zone** — every primary action lives in a bottom-docked Drawer. The reader always knows where to look.
2. **Semantic button labels** — each label communicates what happens when pressed. No generic "Continue."
3. **Reveal as event** — the author's position reveal is a deliberate moment (comparison card), not a subtle text change.
4. **Pacing through delay** — ~400ms delay before advance button appears forces one visual fixation on the reveal.

### Action Positioning Rule

**Rule: All primary actions appear in a bottom-docked Drawer across all phases.**

| Phase | Drawer content | Button label |
|-------|---------------|-------------|
| point-engage | Position selector (Disagree/Unsure/Agree) + submit button | "Submit Your Position" |
| point-revealed | Advance button only (after ~400ms delay) | "Next" |
| story-rate | ComprehensionRatingCard (0-10 scale) + submit button | "Submit My Rating" |
| story-revealed | Advance button only (after ~400ms delay) | "Next Story" / "Complete Letter" (final) |

The Drawer is the universal action zone. Content (cards, comparison, calibration results) stays in the main content area. Actions stay in the Drawer.

### User Flows

#### Flow A: Point engagement (point-engage → point-revealed)

1. Screen shows: Point card with statement text in content area. Drawer is open at bottom with position selector (Disagree / Unsure / Agree) and "Submit Your Position" button (disabled until selection).
2. Reader selects a position. "Submit Your Position" enables.
3. Reader taps "Submit Your Position."
4. Drawer briefly shows loading state ("Saving..."). On success:
5. Content area: point card transitions to **comparison state** — position selector is gone, replaced by side-by-side layout: "You: [position]" on left, "[Author name]: [position]" on right. Card background shifts subtly to indicate result state. Match and mismatch are both presented neutrally.
6. Drawer: empties, then after ~400ms "Next" button fades in.
7. Reader taps "Next" to advance to next point (or story-rate if last point).

#### Flow B: Story rating (story-rate → story-revealed)

1. Screen shows: Story card (LiveStoryCardExpanded) in content area. Drawer slides up with ComprehensionRatingCard (0-10 scale) and "Submit My Rating" button (disabled until selection).
2. Reader selects rating. "Submit My Rating" enables.
3. Reader taps "Submit My Rating."
4. Drawer dismisses. Content area transitions to story-revealed:
   - JourneyToUnderstanding dots (reader's rating vs author's prediction)
   - GapBanner with calibration message ("Perfectly calibrated" etc.)
   - Story card visible below
5. Drawer: after ~400ms, "Next Story" button fades in. (Or "Complete Letter" on the final story.)
6. Reader taps "Next Story" to advance.

#### Flow C: Completion

After final story-revealed, reader taps "Complete Letter." Advances to completion view (varies by flow variant). No changes to completion views.

### Reveal Visibility (point-revealed)

The comparison state replaces the position selector within the same card boundary:
- **Layout:** Two columns. Left: "You" label + position badge. Right: "[Author name]" label + position badge.
- **Match/mismatch:** Both presented neutrally — no connector, no celebration. Story-level calibration (JourneyToUnderstanding) is where celebration lives.
- **Transition:** Card reorganizes from "question mode" to "result mode." Not an overlay, not a notification — the card itself transforms.
- **Delayed advance:** "Next" button appears in Drawer after ~400ms. During the delay, no tappable advance element exists — prevents click-through.

### Edge Cases

- **Fast tapping:** 400ms delay + no advance button during delay = primary defense. Button disables immediately on tap (before async completes).
- **Network error on position submit:** Card stays in question mode. Error toast: "Could not save your position. Please try again." Selection preserved, button re-enables.
- **Network error on rating submit:** Drawer stays open with rating preserved. Error toast shown. Button re-enables.
- **Slow network (>1s):** Button shows loading state ("Saving...") rather than appearing frozen. Comparison card appears only after successful submission, never optimistically.
- **Resume after navigation away:** Reader resumes at correct phase via localStorage persistence. If in point-revealed, comparison renders immediately (no delay on re-render — delay is for initial transition only).
- **Story with 0 points:** Goes straight to story-rate → story-revealed. No point engagement phases.

### Accessibility

- All Drawer buttons maintain min-h 44px (exceeds 40px touch target minimum)
- Comparison state announces via `aria-live="polite"`: "Your position: [X]. [Author name]'s position: [Y]."
- Delayed button: `aria-hidden="true"` during delay, then enters tab order normally. No auto-focus (prevents accidental Enter-to-advance before reading reveal).
- Drawer has `sr-only` header per phase: "Choose your position" / "Rate this story" / etc.
- Position selector radio buttons: existing accessible labels, no change needed.

### Responsive Design

- **Mobile (<768px):** Drawer slides up from bottom. Full-width buttons. Comparison card stacks vertically if needed below ~320px.
- **Tablet/Desktop (768px+):** Same layout — `max-w-md` container keeps content narrow. Drawer adapts via existing `useIsMobile` hook.

### Visual Context

- **Density intent:** Spacious. This is a reflection exercise. Breathing room between card content and Drawer. Maintain existing `space-y-4` (16px) rhythm in content area.
- **Visual reference:** The existing /live session Drawer pattern for comprehension rating is the anchor. Extend the same Drawer treatment to all phases. The comparison card should carry similar visual weight to the JourneyToUnderstanding result — a contained card with clear structure.

## Technical Architecture

### Technical Analysis

**Reuse inventory — existing components, hooks, and utilities in the letter reading area:**

| Asset | File path (relative to `src/`) | Role |
|-------|-------------------------------|------|
| `LetterReadingPage` (page + 2 inner flows) | `app/pages/letter-reading-page.tsx` (~1150 lines) | Auth gating, data loading, `LetterReadingFlow` (authed) + `LetterReadingFlowPublic` (local mode) |
| `LetterPreviewPage` (page + 1 inner flow) | `app/pages/letter-preview-page.tsx` (~490 lines) | Preview route, `LetterPreviewFlow` |
| `useLetterReadingState` hook | `app/hooks/useLetterReadingState.ts` (~605 lines) | Phase state machine, remote/local/preview modes, localStorage/sessionStorage persistence |
| `LetterCover` | `app/components/letters/letter-cover.tsx` | Cover page with sender/receiver, metadata, TOS consent |
| `LetterProgressBar` | `app/components/letters/letter-progress-bar.tsx` | Segmented progress bar |
| `LetterCompletionSummary` | `app/components/letters/letter-completion-summary.tsx` | Completion view (non-1-to-1 authed) |
| `LetterRecipientDone` | `app/components/letters/letter-recipient-done.tsx` | Completion view (1-to-1) |
| `LetterResponseSignupForm` | `app/components/letters/letter-response-signup-form.tsx` | Completion view (public/anon) |
| `LiveStoryCardExpanded` | `app/components/partners/live-story-card-expanded.tsx` | Story card (shared with /live) |
| `PointCardWithLinks` | `app/components/social/point-card-with-links.tsx` | Point card with position selector (shared) |
| `ComprehensionRatingCard` | `app/components/shared/comprehension-rating-card.tsx` | 0-10 rating slider |
| `JourneyToUnderstanding` | `app/components/partners/live-mode-view.tsx` | Calibration dots (checker vs responder) |
| `GapBanner` | `app/components/shared/gap-banner.tsx` | Gap message ("Perfectly calibrated" etc.) |
| `FocusHeader` | `app/components/layout/focus-header.tsx` | Back button header for focus pages |
| `CertificatePageShell` | `app/components/layout/certificate-page-shell.tsx` | `max-w-3xl mx-auto px-4` wrapper |
| `Drawer` (+ DrawerContent, DrawerHeader, DrawerTitle) | `components/ui/drawer.tsx` | Bottom-docked drawer, dual-mode: Vaul (desktop) / portal (mobile via `useIsMobile`) |
| `snapshotToStoryWithPoints`, `pointSummaryToProtoPoint` | `app/utils/letter-snapshot-mapper.ts` | Data shape converters |
| `docsService.getDocsByUser` | `app/data/docs-service.ts` | Drafts list query (has `story_count`, no point count) |
| `letters-service` functions | `app/data/letters-service.ts` | RPCs: submitRating, revealPrediction, submitPointResponse, etc. |

**Duplication analysis — the three flow components share:**

1. **`calculateStoryProgress`** — verbatim copy in `letter-reading-page.tsx` (lines 689-729) and `letter-preview-page.tsx` (lines 172-212). Identical logic, ~40 lines each.
2. **Phase-rendering JSX** — 6 phase blocks (point-engage, point-revealed, story-rate, story-revealed, remaining-point-engage, remaining-point-revealed) are nearly identical across all 3 flows. Each is ~160 lines of JSX.
3. **Per-story setup** — `senderProfileOwner`, `storyWithPoints`, `visiblePoints`, `currentPoint`, `gap`, `isOverconfident`, `storyProgress` — computed identically in all 3 flows (~15 lines each).
4. **Common effects** — auto-advance on `transition` phase, `selectedPosition` state management.

**Differences between flows (3 total):**

| Concern | Preview | Authed Reading | Public Reading |
|---------|---------|----------------|----------------|
| Header | Amber preview banner (in parent page) | `FocusHeader` (in flow) | `FocusHeader` (in flow) |
| Auth gate at story-rate | None | Yes — "Sign in to continue" fallback if `!isAuthenticated` | None |
| Completion | `state.isComplete` → "End of preview" text | `onComplete()` callback → parent shows `LetterRecipientDone` or `LetterCompletionSummary` | `isLocalCompleted` → derives draft, calls `onComplete(draft)` |
| Hook invocation | `useLetterReadingState(deliveryId, '', snapshots, undefined, true, previewPredictions)` | `useLetterReadingState(delivery.id, letter.sender_id, snapshots, token)` | `useLetterReadingState({ mode: 'local', letterId, senderId, snapshots })` |
| Analytics | None | `analytics.track('letter_story_rated', ...)` in story-rate | None |

**Drawer component capabilities:**

The existing `Drawer` (`components/ui/drawer.tsx`) already supports everything needed:
- `open` prop (controlled mode) — already used in story-rate phase
- `dismissible={false}` — already used, prevents swipe-dismiss
- `modal={false}` — used in preview to allow interaction with content behind
- `overlayClassName="bg-transparent"` — already used to hide overlay
- Mobile: portal-based fixed-bottom div. Desktop: Vaul.
- `DrawerFooter` component exists but is unused — available for button-only Drawer content.

The Drawer can hold lightweight content (just a button) with no issues — it's a simple flex column container.

**`useLetterReadingState` phase machine observations:**

The hook manages phase transitions via `updateCurrentStory`. Phase transitions are triggered by:
- `submitPointPosition` → changes phase to `point-revealed` or `remaining-point-revealed`
- `submitStoryRating` → changes phase to `story-revealed`
- `advanceFromPointReveal`, `advanceFromStoryReveal`, `advanceFromRemainingPointReveal` → advance to next phase
- `nextStory` → increments `currentStoryIndex`

The Drawer-everywhere approach works because Drawer rendering is determined by `currentPhase` in the JSX — the hook doesn't need to know about Drawer at all. The Drawer is purely a presentation concern.

### Architecture Decisions

**AD1: Shared flow component extraction strategy — render-prop for completion, boolean props for variants.**

Extract a `LetterFlowContent` component that receives:
```typescript
interface LetterFlowContentProps {
  // Data
  snapshots: LetterStorySnapshot[];
  senderName: string;
  senderProfileOwner: PointProfileOwner;
  // State machine (from useLetterReadingState)
  readingState: UseLetterReadingStateReturn;
  // Variant configuration
  showFocusHeader: boolean;          // false for preview (parent has amber banner)
  authGateAtStoryRate?: ReactNode;   // sign-in prompt for authed reading; undefined for others
  // Completion
  renderCompletion: () => ReactNode; // each variant provides its own completion JSX
  // Optional
  onStoryRated?: (index: number, rating: number) => void;  // analytics hook
}
```

**Why not a single component that handles hook invocation too?** The hook has 3 different invocation signatures across the flows. Lifting hook invocation into the shared component would require a complex union-type config prop. Instead, each page file calls `useLetterReadingState` with its specific params and passes the return value to `LetterFlowContent`. This keeps the shared component pure-presentational.

**AD2: Comparison card — new component, not extension of PointCardWithLinks.**

Create `PositionComparisonCard` as a standalone component. Rationale:
- `PointCardWithLinks` is a complex component (~300 lines) shared with /live, profile, and feed. Adding comparison layout would increase its API surface for a letter-only use case.
- The comparison card has fundamentally different layout: two-column (You vs Author) instead of single card with position buttons.
- Clean separation: `PointCardWithLinks` handles the question state (select a position), `PositionComparisonCard` handles the result state (positions revealed).

The comparison card replaces the current point-revealed rendering (which today reuses `PointCardWithLinks` in read-only mode with `disablePositionButtons`).

**AD3: Delayed button appearance — CSS animation with `useEffect` timer, not Drawer animation.**

Implementation:
1. When entering `point-revealed` or `story-revealed`, set a `showAdvanceButton` state to `false`.
2. `useEffect` on phase change starts a 400ms timer, then sets `showAdvanceButton = true`.
3. The button renders with `opacity-0 → opacity-100` transition and `aria-hidden="true"` during delay.
4. On resume (re-render after nav away), skip the delay — check a `isInitialTransition` ref.

This lives in `LetterFlowContent` since it's purely presentational. The hook doesn't change.

**AD4: Drawer in all 4 action phases — controlled open state tied to phase.**

Currently the Drawer is only used in `story-rate`. Extend to all 4 action phases:

| Phase | Drawer open? | Drawer content |
|-------|-------------|----------------|
| `point-engage` | Yes | Position selector (Disagree/Unsure/Agree radio group) + "Submit Your Position" button |
| `point-revealed` | Yes (after 400ms) | "Next" button only |
| `story-rate` | Yes | ComprehensionRatingCard + "Submit My Rating" button |
| `story-revealed` | Yes (after 400ms) | "Next Story" / "Complete Letter" button only |
| `remaining-point-engage` | Yes | Same as point-engage |
| `remaining-point-revealed` | Yes (after 400ms) | Same as point-revealed (but advances to next remaining point) |

All Drawers use `dismissible={false}` and `overlayClassName="bg-transparent"` (content stays visible behind). The `modal={false}` prop keeps scrollable content interactive.

**Important:** Moving the position selector into the Drawer means `PointCardWithLinks` in `point-engage` phase will no longer include the position buttons inline. The card shows the statement only; the action lives below in the Drawer. This requires passing `disablePositionButtons` to `PointCardWithLinks` in engage phases too, and rendering a separate position selector component inside the Drawer.

Position selector in Drawer: reuse the existing position button group from `PointCardWithLinks` by extracting it, OR use a simpler radio-button group. Decision: extract the 3-button position selector from `PointCardWithLinks` into a standalone `PositionSelector` component. This avoids reimplementing the same buttons and keeps the existing accessible labels.

**AD5: `estimateReadingMinutes` utility — shared, co-located with `calculateStoryProgress`.**

Create `src/app/utils/letter-reading-utils.ts` containing:
- `calculateStoryProgress(phase, currentPointIndex, visiblePointCount): number`
- `estimateReadingMinutes(storyCount: number, totalPointCount: number): number`
- `countTotalPoints(snapshots: LetterStorySnapshot[]): number`

Formula: `Math.max(1, Math.ceil(totalPoints + storyCount))` — ~1 min per point (read + position) + ~1 min per story (confidence + results).

**AD6: Drafts query point count — extend `getDocsByUser` batch query.**

Current `getDocsByUser` does:
1. Fetch `clarity_docs` rows
2. Batch count `doc_stories` per doc → `story_count`
3. Batch check `clarity_letters` per doc → `has_sent_letters`

Add step 2.5: batch fetch `doc_stories → story_points` (joined) per doc to count total points. This is a single additional query, not N+1.

The query: `supabase.from('doc_stories').select('doc_id, story:stories!inner(story_points(point_id))').in('doc_id', docIds)`. Then flatten and count unique point IDs per doc.

Add `point_count: number` to the `ClarityDoc` type. Display in drafts list as `"N stories · M points"`.

**AD7: PositionSelector extraction — lightweight component for Drawer.**

Extract from `PointCardWithLinks` the 3-button position group (Disagree / Unsure / Agree) into `src/app/components/shared/position-selector.tsx`. Props:
```typescript
interface PositionSelectorProps {
  selectedPosition: PositionType | null;
  onSelect: (position: PositionType) => void;
  disabled?: boolean;
}
```

This is simpler than passing the full `PointCardWithLinks` into the Drawer — it avoids the card chrome and keeps the Drawer content minimal.

### Security Review

**RLS Policies:**
- ✅ All letter reading queries (`getLetterForReading`, `getLetterForPublicReading`, `getDoc`) go through RLS. No changes to these queries in P696.
- ✅ The drafts point count query extension joins `doc_stories` → `story_points` — both tables chain RLS through `clarity_docs` ownership. No new exposure.

**Authentication:**
- ✅ Preview flow: relies on RLS (owner-only read for private docs). No auth guard change.
- ✅ Authenticated reading flow: `delivery.receiver_profile_id` check against `currentUser.id` preserved.
- ✅ Public reading flow: `mode: 'local'` in `useLetterReadingState` — skips all RPC calls. Data submitted only after completion via server-validated endpoints.
- ✅ Shared `LetterFlowContent` component is pure-presentational — auth boundaries stay in page files.

**Authorization:**
- ✅ Position writes gated by `mode !== 'local' && !previewMode`. Server-side RPCs validate caller access.
- ✅ Rating writes: same gating pattern. Each mode path uses correct write method.
- ✅ `catch(() => {})` on delivery status updates — acceptable since status is non-critical metadata.

**Input Validation:**
- ✅ Position constrained to Agree/Disagree/Unsure by UI + parameterized server RPCs.
- ✅ Rating constrained to 0-10 by UI controls. Server-side validation via RPC layer.
- ✅ Token from URL params used only in parameterized Supabase calls. No injection risk.
- ✅ localStorage parsed with try/catch guards — malformed data falls through to fresh state.

**Data Protection:**
- ✅ Author position reveal preserves sealed-bid pattern — shown only after reader submits own position. No change in P696.
- ✅ Sender predictions fetched only after rating submission. No premature exposure.
- ✅ No new PII exposure. Comparison card shows same data already visible in current flow.

**Summary:** No security concerns. Frontend-only refactoring preserves all auth boundaries, RLS enforcement, and data protection patterns.

### Implementation Approach

#### Build Sequence

**Phase 1: Utilities + metadata (no behavior change)**
1. Create `letter-reading-utils.ts` — extract `calculateStoryProgress`, add `estimateReadingMinutes` + `countTotalPoints`
2. Update `letter-preview-page.tsx` and `letter-reading-page.tsx` to import `calculateStoryProgress` from shared utility (delete inline copies)
3. Update `LetterCover` props to accept `pointCount`, update display to "N stories · M points · ~X minutes"
4. Update all 3 cover page call sites to pass `pointCount` and use `estimateReadingMinutes`
5. Extend `getDocsByUser` to compute `point_count`, add to `ClarityDoc` type
6. Update `drafts-tab.tsx` to display `"N stories · M points"`

**Phase 2: Centering fix (trivial, do alongside Phase 1)**
7. Add `mx-auto` to all `LiveStoryCardExpanded` and `JourneyToUnderstanding` instances with `className="w-full max-w-sm"` (6 locations across 2 page files — will reduce to 2 after extraction)

**Phase 3: Extract shared flow component**
8. Create `PositionSelector` component (extracted from `PointCardWithLinks` button group)
9. Create `PositionComparisonCard` component (new — You vs Author side-by-side)
10. Create `LetterFlowContent` shared component with phase-rendering JSX
11. Refactor `LetterPreviewFlow` to use `LetterFlowContent`
12. Refactor `LetterReadingFlow` to use `LetterFlowContent`
13. Refactor `LetterReadingFlowPublic` to use `LetterFlowContent`

**Phase 4: Interaction consistency (D+E)**
14. Wire Drawer into all phases in `LetterFlowContent` (currently only story-rate)
15. Move position selector into Drawer for point-engage phases
16. Implement 400ms delayed button for reveal phases
17. Update button labels: "Submit Your Position" / "Next" / "Submit My Rating" / "Next Story" / "Complete Letter"
18. Replace point-revealed rendering with `PositionComparisonCard`

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/utils/letter-reading-utils.ts` | Shared utilities: `calculateStoryProgress`, `estimateReadingMinutes`, `countTotalPoints` |
| `src/app/components/letters/letter-flow-content.tsx` | Shared phase-rendering component for all 3 letter flow variants |
| `src/app/components/shared/position-selector.tsx` | 3-button position selector (Disagree/Unsure/Agree) — extracted for Drawer use |
| `src/app/components/letters/position-comparison-card.tsx` | You vs Author side-by-side comparison card for point-revealed phase |

#### Files to Modify

| File | Changes |
|------|---------|
| `src/app/pages/letter-preview-page.tsx` | Remove `calculateStoryProgress` copy, replace `LetterPreviewFlow` internals with `LetterFlowContent`, import shared utility, pass `pointCount` to cover |
| `src/app/pages/letter-reading-page.tsx` | Remove `calculateStoryProgress` copy, replace `LetterReadingFlow` + `LetterReadingFlowPublic` internals with `LetterFlowContent`, import shared utility, pass `pointCount` to cover |
| `src/app/components/letters/letter-cover.tsx` | Add `pointCount` prop, display "N stories · M points · ~X minutes" |
| `src/app/components/letters/drafts-tab.tsx` | Display `point_count` alongside `story_count` |
| `src/app/data/docs-service.ts` | Extend `getDocsByUser` to batch-query point counts per doc |
| `src/app/types/index.ts` | Add `point_count: number` to `ClarityDoc` interface |

## Component Strategy

### Component Inventory

**Design system primitives (reuse as-is):**

| Component | File | Role in P696 |
|-----------|------|--------------|
| `Drawer` | `src/components/ui/drawer.tsx` | Universal action zone — bottom-docked, dual-mode (Vaul desktop / portal mobile). Supports controlled `open`, `dismissible={false}`, `modal={false}`, `overlayClassName="bg-transparent"`. `DrawerFooter` available (unused today). |
| `Button` | `src/components/ui/button.tsx` | CVA variants: `default`, `outline`, `ghost`, `link`. Sizes: `default` (h-9), `sm` (h-8), `lg` (h-10). Used for all action buttons in Drawer. |
| `GravatarAvatar` | `src/components/ui/gravatar-avatar.tsx` | Author avatars in comparison card. |
| `EarBadge` | `src/components/ui/ear-badge.tsx` | Ear count display in comparison card author labels. |

**Feature components (reuse as-is):**

| Component | File | Role in P696 |
|-----------|------|--------------|
| `PointCardWithLinks` | `src/app/components/social/point-card-with-links.tsx` | Point statement display in `point-engage` phase. Used with `hideActions`, `disablePositionButtons=true` (position selector moves to Drawer). ~785 lines, 92 props — too heavy to extend with comparison layout. |
| `LiveStoryCardExpanded` | `src/app/components/partners/live-story-card-expanded.tsx` | Story card in story phases. Already has `hidePoints`, `readOnly`, `letterMode` props. Needs only `mx-auto` centering fix on className at call sites. |
| `ComprehensionRatingCard` | `src/app/components/shared/comprehension-rating-card.tsx` | Rating slider in `story-rate` Drawer. Already self-contained with `onSelect`, `disabled` props. |
| `JourneyToUnderstanding` | `src/app/components/partners/live-mode-view.tsx` (export) | Calibration dots in `story-revealed` content area. Reuse as-is. |
| `GapBanner` | `src/app/components/shared/gap-banner.tsx` | Gap message in `story-revealed`. Reuse as-is. |
| `LetterCover` | `src/app/components/letters/letter-cover.tsx` | Cover page. Extend props: add `pointCount`. |
| `LetterProgressBar` | `src/app/components/letters/letter-progress-bar.tsx` | Segmented progress. Reuse as-is. |
| `LetterRecipientDone` | `src/app/components/letters/letter-recipient-done.tsx` | Completion (1-to-1). Reuse as-is. |
| `LetterCompletionSummary` | `src/app/components/letters/letter-completion-summary.tsx` | Completion (non-1-to-1). Reuse as-is. |
| `LetterResponseSignupForm` | `src/app/components/letters/letter-response-signup-form.tsx` | Completion (public). Reuse as-is. |
| `FocusHeader` | `src/app/components/layout/focus-header.tsx` | Back button header. Reuse as-is. |
| `PositionBadge` | `src/app/components/shared/PositionBadge.tsx` | Position label badge (Agree/Disagree/Unsure). Reuse in comparison card. |

**Shared utilities (reuse as-is):**

| Utility | File | Role in P696 |
|---------|------|--------------|
| `PositionButtons` | `src/app/components/shared/PositionButton.tsx` | 3-group segmented control (Disagree/Unsure/Agree) with intensity dropdown. Currently rendered inline in `PointCardWithLinks` and `PointRow`. The position selector extraction for Drawer uses a simpler subset — see PositionSelector below. |
| `PositionBadge`, `getPositionVerb` | `src/app/components/shared/PositionBadge.tsx` | Position label rendering for comparison card. |
| `snapshotToStoryWithPoints`, `pointSummaryToProtoPoint` | `src/app/utils/letter-snapshot-mapper.ts` | Data shape converters. Reuse as-is. |

### Component Map

| UI Element | Classification | Notes |
|------------|---------------|-------|
| `LetterFlowContent` | **New** | Shared phase-rendering component replacing 3 near-identical flow components. Location: `src/app/components/letters/letter-flow-content.tsx` |
| `PositionComparisonCard` | **New** | You vs Author side-by-side reveal card. Location: `src/app/components/letters/position-comparison-card.tsx` |
| `PositionSelector` | **Extract** | Simplified 3-button position group (Disagree/Unsure/Agree) extracted from `PositionButtons` pattern. No intensity dropdown, no counts — just selection. Location: `src/app/components/shared/position-selector.tsx` |
| `estimateReadingMinutes`, `countTotalPoints`, `calculateStoryProgress` | **New + Extract** | Shared utility. `calculateStoryProgress` extracted from duplicated inline copies. Location: `src/app/utils/letter-reading-utils.ts` |
| `Drawer` | **Reuse** | Extended to all 6 action phases (was only `story-rate`). No component changes — usage change only. |
| `LetterCover` | **Extend** | Add `pointCount` prop for metadata display. |
| `PointCardWithLinks` | **Reuse** | Used with `disablePositionButtons=true` + `hideActions` in `point-engage`. Position selector moves to Drawer. |
| `LiveStoryCardExpanded` | **Reuse** | Add `mx-auto` at call sites for centering fix. |
| `ComprehensionRatingCard` | **Reuse** | Moves inside Drawer content for `story-rate`. |
| All other leaf components | **Reuse** | No changes needed. |

### Composition Tree

```
LetterFlowContent
├── {showFocusHeader && <FocusHeader />}
├── <LetterProgressBar />
├── <div className="max-w-md mx-auto w-full space-y-6">
│   │
│   ├── [phase: point-engage]
│   │   ├── <PointCardWithLinks disablePositionButtons hideActions />
│   │   └── <Drawer open dismissible={false} modal={false}>
│   │       └── <DrawerContent overlayClassName="bg-transparent">
│   │           ├── <DrawerHeader><DrawerTitle className="sr-only">Choose your position</DrawerTitle></DrawerHeader>
│   │           ├── <PositionSelector onSelect={...} selectedPosition={...} />
│   │           └── <DrawerFooter>
│   │               └── <Button disabled={!selected}>Submit Your Position</Button>
│   │           </DrawerFooter>
│   │       </DrawerContent>
│   │   </Drawer>
│   │
│   ├── [phase: point-revealed]
│   │   ├── <PositionComparisonCard
│   │   │     readerPosition={...}
│   │   │     authorPosition={...}
│   │   │     authorName={...}
│   │   │     pointStatement={...}
│   │   │   />
│   │   └── <Drawer open={showAdvanceButton} dismissible={false}>
│   │       └── <DrawerContent>
│   │           └── <DrawerFooter>
│   │               └── <Button className="animate-fade-in">Next</Button>
│   │           </DrawerFooter>
│   │       </DrawerContent>
│   │   </Drawer>
│   │
│   ├── [phase: story-rate]
│   │   ├── <LiveStoryCardExpanded className="w-full max-w-sm mx-auto" hidePoints />
│   │   └── <Drawer open dismissible={false} modal={false}>
│   │       └── <DrawerContent overlayClassName="bg-transparent">
│   │           ├── <DrawerHeader><DrawerTitle className="sr-only">Rate this story</DrawerTitle></DrawerHeader>
│   │           ├── <ComprehensionRatingCard onSelect={...} />
│   │           └── <DrawerFooter>
│   │               └── <Button disabled={!rated}>Submit My Rating</Button>
│   │           </DrawerFooter>
│   │       </DrawerContent>
│   │   </Drawer>
│   │
│   ├── [phase: story-revealed]
│   │   ├── <JourneyToUnderstanding className="w-full max-w-sm mx-auto" />
│   │   ├── <GapBanner />
│   │   ├── <LiveStoryCardExpanded className="w-full max-w-sm mx-auto" hidePoints />
│   │   └── <Drawer open={showAdvanceButton} dismissible={false}>
│   │       └── <DrawerContent>
│   │           └── <DrawerFooter>
│   │               └── <Button className="animate-fade-in">
│   │                   {isFinalStory ? "Complete Letter" : "Next Story"}
│   │               </Button>
│   │           </DrawerFooter>
│   │       </DrawerContent>
│   │   </Drawer>
│   │
│   ├── [phase: remaining-point-engage] → same as point-engage
│   ├── [phase: remaining-point-revealed] → same as point-revealed
│   │
│   └── [completion]
│       └── {renderCompletion()}  // variant-specific via render prop
│
└── {authGateAtStoryRate}  // ReactNode, only for authed reading flow
```

### Visual Specification

**1. Visual Hierarchy (primary → secondary → tertiary)**

| Level | Element | Tailwind Classes |
|-------|---------|-----------------|
| **Primary** | Drawer action buttons ("Submit Your Position", "Submit My Rating", etc.) | `bg-[#0044CC] hover:bg-[#0033AA] text-white text-base px-8 py-3 min-h-[48px] w-full rounded-md font-medium` — matches LetterCover "Open the Letter" button weight |
| **Secondary** | Content cards (PointCardWithLinks, LiveStoryCardExpanded, PositionComparisonCard) | Existing card styles: `rounded-lg border border-gray-200 bg-white shadow-sm`. Comparison card: `border-l-4 border-l-blue-500` (matching story card left accent). |
| **Tertiary** | Metadata text, sr-only Drawer headers, progress bar | `text-sm text-[#1A1A1A]/50` for metadata. `sr-only` for Drawer titles. Progress bar uses existing LetterProgressBar styles. |

**2. Emotional Register: Calm Reflection**

| Quality | Implementation |
|---------|---------------|
| Calm background | `bg-background` (white, `hsl(0 0% 100%)`) — no dark overlays. Drawer uses `overlayClassName="bg-transparent"` so content stays visible. |
| Unhurried pacing | 400ms delay before advance buttons. `animate-fade-in` (0.5s ease-out, from `tailwind.config.js` keyframes). No abrupt transitions. |
| Muted chrome | Drawer border: `border bg-background rounded-t-[10px]`. No drag handle (`dismissible={false}`). Minimal visual noise around the action zone. |
| Neutral result framing | Comparison card shows both positions without celebration/disappointment. No green/red color coding on match/mismatch — both use `bg-gray-50 border border-gray-200`. |

**3. Negative Constraints (what this must NOT feel like)**

- NOT a quiz or test — no scoring colors (green/red) on individual point comparisons. Story-level JourneyToUnderstanding is where calibration results show color.
- NOT a chat interface — no message bubbles, no typing indicators. Cards are static containers.
- NOT rushed — no auto-advance timers, no "hurry" language. The 400ms delay is a minimum pause, not a countdown.
- NOT modal — Drawer never blocks scrolling (`modal={false}`). Content behind Drawer stays interactive (scrollable).
- NOT heavy — Drawer content is minimal (selector + button, or just button). Never put long text or multiple cards inside the Drawer.

**4. Spacing Per Zone**

| Zone | Tailwind Classes | Reasoning |
|------|-----------------|-----------|
| Content area (between cards) | `space-y-6` (24px) on parent `max-w-md` div | Spacious — reflection exercise needs breathing room. Matches existing letter flow rhythm. |
| Within cards (internal padding) | `p-4` (16px) — existing card pattern | Consistent with PointCardWithLinks and LiveStoryCardExpanded internal padding. |
| Drawer internal | `p-4` (16px) via DrawerFooter default. PositionSelector inside Drawer: `px-4 pb-2`. | Matches DrawerFooter's `mt-auto flex flex-col gap-2 p-4`. |
| Drawer to content gap | Natural gap from fixed-bottom positioning. Content area has `pb-[200px]` (or calculated) to prevent Drawer overlap with last content card. | Ensures last card is scrollable above Drawer. |
| Comparison card columns | `grid grid-cols-2 gap-4` (16px between columns) | Equal weight to both positions. Generous gap prevents cramping. |
| Between comparison card label and badge | `space-y-2` (8px) | Label ("You" / author name) above position badge. Tight but readable. |

**5. Animation / Transition**

| Trigger | Animation | Tailwind / CSS |
|---------|-----------|---------------|
| Advance button appears (400ms delay) | Fade in from opacity 0 to 1 | `opacity-0 transition-opacity duration-500 ease-out` → class toggle to `opacity-100`. Uses existing `fade-in` keyframe: `animate-fade-in` (0.5s ease-out). Button starts with `aria-hidden="true"`, removed after fade completes. |
| Drawer opens (phase change) | Slide up from bottom (mobile) / Vaul default (desktop) | Existing Drawer animation: `animate-in slide-in-from-bottom duration-300` (mobile portal). Desktop: Vaul's built-in spring animation. |
| Card transition (question → comparison) | Content swap within card boundary | No animation — immediate swap. The 400ms button delay provides the "pause" moment. Adding card animation would compound delays. |
| Position selector → disabled after submit | Immediate disable + loading text | `opacity-50 pointer-events-none` on selector. "Saving..." text in button. Instant — no fade on disable. |
| Resume after nav-away | No delay on advance button | `isInitialTransition` ref check. If `false` (re-render, not first transition), button appears immediately with full opacity. |

### Extraction Plan

**Extraction 1: PositionSelector from PositionButtons pattern**

Source: `src/app/components/shared/PositionButton.tsx` — `PositionButtons` component (lines 196-400+).

The existing `PositionButtons` is a complex segmented control with: 3 button groups, intensity dropdowns, portal-based dropdown positioning, ResizeObserver for icon-only mode, tooltip integration, and 7-point count display. This is too heavy for the Drawer.

`PositionSelector` is a simplified extraction — same 3-group visual pattern (Disagree/Unsure/Agree) but:
- No intensity dropdown (letter reading uses 3-position model: agree/unsure/disagree)
- No count badges (positions are 1:1 reader-vs-author, not crowd-sourced)
- No tooltips (Drawer context is self-explanatory)
- No ResizeObserver (Drawer is full-width)

Shared constants reused from `PositionButton.tsx`: `BUTTON_GROUPS` config (icon, label, activeClass, inactiveClass), `BUTTON_ORDER` array. Import these or duplicate the minimal subset (3 config objects).

Props:
```typescript
interface PositionSelectorProps {
  selectedPosition: PositionType | null;
  onSelect: (position: PositionType) => void;
  disabled?: boolean;
}
```

Implementation: 3 buttons in a row, matching the visual weight of `PositionButtons` (same border radius, same blue active state `bg-blue-600 text-white`), but simpler — each button is a direct click handler, no dropdown.

**Extraction 2: calculateStoryProgress to shared utility**

Source: `src/app/pages/letter-reading-page.tsx` (lines ~689-729) and `src/app/pages/letter-preview-page.tsx` (lines ~172-212). Verbatim identical, ~40 lines.

Target: `src/app/utils/letter-reading-utils.ts`

The function takes `(phase, currentPointIndex, visiblePointCount)` and returns a progress number. Pure function, no dependencies on React or component state. Straightforward extract-and-import.

**Extraction 3: Three flow components into LetterFlowContent**

Source: `LetterPreviewFlow` (in `letter-preview-page.tsx`), `LetterReadingFlow` and `LetterReadingFlowPublic` (both in `letter-reading-page.tsx`).

Target: `src/app/components/letters/letter-flow-content.tsx`

Strategy:
1. Create `LetterFlowContent` with the shared phase-rendering JSX (6 phase blocks + per-story setup + common effects).
2. Parameterize the 3 differences via props: `showFocusHeader`, `authGateAtStoryRate`, `renderCompletion`.
3. Each page file keeps its own `useLetterReadingState` invocation (3 different signatures) and passes the return value as `readingState` prop.
4. Each page file provides its own `renderCompletion` callback.
5. Replace the internals of all 3 flow components with `<LetterFlowContent ... />`.

This is a pure structural extraction — no behavior change. Each phase block is copy-pasted once into `LetterFlowContent`, then the 3 source locations become single-line `<LetterFlowContent>` renders.

### Challenge Notes

No upstream concerns identified. The architecture decisions (AD1-AD7) fully address all component needs. Key observations:

1. **Drawer `DrawerFooter` is unused today** but exists and matches the needed pattern (`mt-auto flex flex-col gap-2 p-4`). No Drawer component changes needed.
2. **`PositionButtons` has a `disabled` prop** already used in letter reveal steps — confirms the pattern of disabling inline buttons when the selector moves to Drawer.
3. **`animate-fade-in` keyframe already exists** in `tailwind.config.js` (`fade-in: 0.5s ease-out`). The 400ms delay is handled by `useEffect` timer, not CSS animation delay — this allows the `aria-hidden` toggle to be timer-driven rather than animation-event-driven.
4. **`LiveStoryCardExpanded` accepts `className` prop** — the centering fix (`mx-auto`) is applied at call sites, not inside the component. This avoids changing a shared component's default behavior.

## Test Coverage Strategy

### Unit Tests (Vitest)

**`src/tests/p696-letter-reading-utils.test.ts`** — 22 tests for the 3 extracted pure functions:
- `estimateReadingMinutes`: 8 tests — floor behavior, spec examples, old-vs-new formula regression, large letters
- `countTotalPoints`: 6 tests — empty arrays, null configs, mixed snapshots, multi-snapshot accumulation
- `calculateStoryProgress`: 8 tests — phase progression ordering, 0-point stories, boundary values 0-100

### E2E Tests (Playwright)

**`e2e/p696-letter-reading-polish.spec.ts`** — 14 tests covering P696 delta:
- Smoke (page load, no console errors)
- Metadata: cover shows "N stories · M points · ~X minutes", reading time uses new formula, drafts list shows point count
- Drawer actions: position selector in Drawer (not inline), button labels ("Submit Your Position", "Submit My Rating"), disabled-until-selected
- Comparison card: shows You vs Author after submit, two-column (not dropdown)
- 400ms delay: "Next" not immediately visible, appears after delay
- Button labels: "Next Story" vs "Complete Letter" on final story
- Public reading: unauthenticated flow reaches point-engage

**`e2e/a11y/p696-accessibility.spec.ts`** — 8 tests:
- sr-only Drawer titles per phase (point-engage, story-rate)
- aria-live="polite" on comparison card
- aria-hidden during 400ms delay, removed after
- No auto-focus on delayed button
- 44px touch targets on Drawer buttons
- Keyboard navigation to position selector

### UAT Checklist

**`features/uat/p696.md`** — manual verification for visual/layout items not reliably testable in Playwright:
- Centering at 375px/768px/1280px
- Preview vs reading parity
- Drawer-everywhere consistency across all 6 phases
- Comparison card visual design
- 400ms delay feel
- P673 regression checks

### NOT Tested (with reasoning)

- CSS centering (`mx-auto`) — layout correctness not reliably testable without pixel comparison
- Exact 400ms timing — CI timer variance; tested behaviorally (not visible at 100ms, visible at 2000ms)
- `getDocsByUser` SQL internals — tested indirectly via drafts list E2E
- `LetterFlowContent` unit tests — no pure-logic surface; E2E covers behavioral contract
- Comparison card column layout — visual; covered in UAT

## Implementation Tasks

### Consistency Check Results

**AC Coverage:** PASS — All 9 ACs traceable to build steps and tests.
**UX-Arch Drift:** PASS — No contradictions between UX Design and Architecture Decisions.
**Security Blockers:** PASS — No blockers; no pre-deploy checklist required.

---

### Task Manifest

#### T1 — Create letter-reading-utils.ts with shared utilities

- **Concern:** Utility extraction + new functions
- **Files:** `src/app/utils/letter-reading-utils.ts` (create)
- **Spec refs:** Architecture Decisions AD5; Build Sequence step 1; Extraction Plan "Extraction 2"
- **Tests:** `src/tests/p696-letter-reading-utils.test.ts` — 22 unit tests (all 3 functions). Run: `npx vitest run src/tests/p696-letter-reading-utils.test.ts`
- **Verify:** All 22 unit tests pass; `estimateReadingMinutes(3, 9)` returns 12
- **Depends on:** nothing

#### T2 — Remove calculateStoryProgress inline copies; import from shared utility

- **Concern:** Deduplication (remove two ~40-line verbatim copies)
- **Files:** `src/app/pages/letter-reading-page.tsx` (modify), `src/app/pages/letter-preview-page.tsx` (modify)
- **Spec refs:** Technical Analysis "Duplication analysis" item 1; Build Sequence step 2; Extraction Plan "Extraction 2"
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` smoke tests catch regressions
- **Verify:** `grep -n "calculateStoryProgress" src/app/pages/letter-reading-page.tsx` returns only import line (no inline definition); same for preview page
- **Depends on:** T1

#### T3 — Extend LetterCover with pointCount prop and updated metadata display

- **Concern:** Metadata display on cover page
- **Files:** `src/app/components/letters/letter-cover.tsx` (modify)
- **Spec refs:** Build Sequence step 3; Component Strategy (LetterCover: **Extend**); AC "Metadata on cover page reads: N stories · M points · ~X minutes"
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — metadata tests (cover shows "N stories · M points · ~X minutes")
- **Verify:** Component renders `"3 stories · 9 points · ~12 minutes"` given `storyCount=3`, `pointCount=9`, `estimateReadingMinutes(3,9)=12`
- **Depends on:** T1

#### T4 — Update cover call sites to pass pointCount and use estimateReadingMinutes

- **Concern:** Wire new LetterCover props at all 3 call sites (preview + 2 reading flows)
- **Files:** `src/app/pages/letter-preview-page.tsx` (modify), `src/app/pages/letter-reading-page.tsx` (modify)
- **Spec refs:** Build Sequence step 4; AD5 formula; AC "Metadata on cover page"
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — cover metadata E2E test (reading time uses new formula)
- **Verify:** E2E test "cover metadata" passes; reading time in cover for 3-story/9-point letter shows ~12 min (not ~6)
- **Depends on:** T1, T3

#### T5 — Extend getDocsByUser to batch-compute point_count; add to ClarityDoc type

- **Concern:** Data layer extension for drafts list point count
- **Files:** `src/app/data/docs-service.ts` (modify), `src/app/types/index.ts` (modify)
- **Spec refs:** Architecture Decisions AD6; Build Sequence step 5; Technical Analysis "getDocsByUser" description
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — drafts list shows point count (tested indirectly)
- **Verify:** `getDocsByUser` returns `point_count` field on each doc; no N+1 queries (single batch join)
- **Depends on:** nothing

#### T6 — Update drafts-tab.tsx to display "N stories · M points"

- **Concern:** Metadata display on drafts list
- **Files:** `src/app/components/letters/drafts-tab.tsx` (modify)
- **Spec refs:** Build Sequence step 6; AC "Metadata on drafts list reads: N stories · M points"
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — "drafts list shows point count" test
- **Verify:** Drafts list entry shows `"3 stories · 9 points"` for a letter with 3 stories and 9 points
- **Depends on:** T5

#### T7 — Add mx-auto centering to LiveStoryCardExpanded and JourneyToUnderstanding call sites

- **Concern:** Centering fix (6 locations across 2 page files)
- **Files:** `src/app/pages/letter-reading-page.tsx` (modify), `src/app/pages/letter-preview-page.tsx` (modify)
- **Spec refs:** Solution "Phase 2: Centering fix"; Build Sequence step 7; AC "Centering fix verified at viewport widths"
- **Tests:** UAT checklist `features/uat/p696.md` (centering at 375px/768px/1280px — visual, not Playwright)
- **Verify:** All `className="w-full max-w-sm"` usages on `LiveStoryCardExpanded` and `JourneyToUnderstanding` in both page files also contain `mx-auto`
- **Depends on:** nothing (independent of T1-T6)

#### T8 — Create PositionSelector component (extracted from PositionButtons pattern)

- **Concern:** Simplified 3-button position group for Drawer use
- **Files:** `src/app/components/shared/position-selector.tsx` (create)
- **Spec refs:** Architecture Decisions AD7; Component Strategy (PositionSelector: **Extract**); Extraction Plan "Extraction 1"; Component Map; Build Sequence step 8
- **Tests:** `e2e/a11y/p696-accessibility.spec.ts` — keyboard navigation to position selector; `e2e/p696-letter-reading-polish.spec.ts` — position selector in Drawer (not inline)
- **Verify:** Component renders 3 buttons (Disagree/Unsure/Agree) without intensity dropdown, count badges, or tooltip; `disabled` prop disables all 3 buttons
- **Depends on:** nothing

#### T9 — Create PositionComparisonCard component (You vs Author side-by-side)

- **Concern:** New comparison card for point-revealed phase
- **Files:** `src/app/components/letters/position-comparison-card.tsx` (create)
- **Spec refs:** Architecture Decisions AD2; Component Strategy (PositionComparisonCard: **New**); Visual Specification "4. Spacing Per Zone" comparison card columns; UX Design "Reveal Visibility"; Build Sequence step 9
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — "comparison card shows You vs Author after submit"; `e2e/a11y/p696-accessibility.spec.ts` — aria-live="polite" on comparison card
- **Verify:** Card renders two-column grid with "You" label + position badge on left, author name + position badge on right; both columns use neutral styling (`bg-gray-50 border border-gray-200`)
- **Depends on:** nothing

#### T10 — Create LetterFlowContent shared component (phase-rendering JSX)

- **Concern:** Shared flow component extraction (pure structural — no behavior change)
- **Files:** `src/app/components/letters/letter-flow-content.tsx` (create)
- **Spec refs:** Architecture Decisions AD1, AD3, AD4; Extraction Plan "Extraction 3"; Composition Tree; Build Sequence steps 10; Component Map (LetterFlowContent: **New**)
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` smoke tests; `e2e/a11y/p696-accessibility.spec.ts` sr-only Drawer titles per phase
- **Verify:** Component compiles; renders all 6 phases correctly; accepts `showFocusHeader`, `authGateAtStoryRate`, `renderCompletion` props per AD1 interface
- **Depends on:** T8, T9

#### T11 — Refactor LetterPreviewFlow to use LetterFlowContent

- **Concern:** Replace preview flow internals with shared component
- **Files:** `src/app/pages/letter-preview-page.tsx` (modify)
- **Spec refs:** Extraction Plan "Extraction 3" step 3-5; Build Sequence step 11; Technical Analysis "Differences between flows" (Preview column)
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` smoke + public reading flow tests; UAT "Preview vs reading parity"
- **Verify:** Preview route loads and completes all phases; `letter-preview-page.tsx` no longer contains phase-rendering switch JSX (delegated to LetterFlowContent); `showFocusHeader={false}` passed
- **Depends on:** T10, T7 (centering already fixed in T7 so no duplicate mx-auto needed here)

#### T12 — Refactor LetterReadingFlow and LetterReadingFlowPublic to use LetterFlowContent

- **Concern:** Replace both authed and public reading flow internals with shared component
- **Files:** `src/app/pages/letter-reading-page.tsx` (modify)
- **Spec refs:** Extraction Plan "Extraction 3" step 3-5; Build Sequence steps 12-13; Technical Analysis "Differences between flows" (Authed Reading + Public Reading columns)
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — all authenticated flow tests; public reading test; UAT P673 regression checks
- **Verify:** Authenticated reading and public reading routes complete all phases; `letter-reading-page.tsx` no longer contains phase-rendering switch JSX; authed flow passes `authGateAtStoryRate` node for sign-in prompt; analytics hook `onStoryRated` wired correctly for authed flow
- **Depends on:** T10, T2

#### T13 — Wire Drawer into all 6 action phases in LetterFlowContent

- **Concern:** Interaction consistency — Drawer as universal action zone
- **Files:** `src/app/components/letters/letter-flow-content.tsx` (modify)
- **Spec refs:** Architecture Decisions AD4; UX Design "Action Positioning Rule"; Build Sequence step 14; Composition Tree (Drawer blocks per phase)
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — "position selector in Drawer (not inline)"; "button labels"; `e2e/a11y/p696-accessibility.spec.ts` — sr-only Drawer headers; 44px touch targets
- **Verify:** All 6 phases (`point-engage`, `point-revealed`, `story-rate`, `story-revealed`, `remaining-point-engage`, `remaining-point-revealed`) render primary action inside `<Drawer dismissible={false} modal={false} overlayClassName="bg-transparent">`
- **Depends on:** T10

#### T14 — Move position selector into Drawer for point-engage phases; wire 400ms delayed button for reveal phases

- **Concern:** Two interaction changes: selector in Drawer + delayed advance button
- **Files:** `src/app/components/letters/letter-flow-content.tsx` (modify)
- **Spec refs:** Architecture Decisions AD3, AD4; Build Sequence steps 15-16; UX Design "Flow A" steps 1-7; Visual Specification "5. Animation / Transition"; Edge Cases "Fast tapping", "Resume after navigation away"
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — "position selector in Drawer (not inline)"; "400ms delay: Next not immediately visible, appears after delay"; `e2e/a11y/p696-accessibility.spec.ts` — aria-hidden during delay, removed after
- **Verify:** `PointCardWithLinks` in point-engage passes `disablePositionButtons=true`; `PositionSelector` renders inside Drawer; `showAdvanceButton` state starts `false` on phase entry; `useEffect` timer flips to `true` after 400ms; `isInitialTransition` ref skips delay on resume
- **Depends on:** T13, T8

#### T15 — Update all button labels and replace point-revealed with PositionComparisonCard

- **Concern:** Button labels (semantic) + comparison card wired into point-revealed phase
- **Files:** `src/app/components/letters/letter-flow-content.tsx` (modify)
- **Spec refs:** Build Sequence steps 17-18; UX Design "Action Positioning Rule" button label table; AC "Button labels"; AC "Reveal pattern: comparison card"
- **Tests:** `e2e/p696-letter-reading-polish.spec.ts` — "button labels: Submit Your Position, Submit My Rating"; "Next Story vs Complete Letter on final story"; "comparison card shows You vs Author after submit, two-column (not dropdown)"
- **Verify:** Grep for "Continue" in letter-flow-content.tsx returns no results; point-revealed phase renders `<PositionComparisonCard>` instead of `<PointCardWithLinks disablePositionButtons>`; all 5 button labels match spec exactly
- **Depends on:** T13, T9
