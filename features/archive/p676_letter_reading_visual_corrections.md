---
status: rejected
type: change-request
rank: 1000063
changes: p673
superseded_by: p696
tags:
  - redesign
  - p673
  - letters
  - reading-flow
created_date: '2026-04-07'
delivery_stage: generate-tests
pipeline_ran:
  - change-request
  - architect
  - generate-tests
test_files:
  - e2e/p676-visual-corrections.spec.ts
uat_file: features/uat/p676.md
locked_at: '2026-04-07T11:25:36.579Z'
---

# P676: Letter Reading Visual Corrections

> **Redesign of:** [P673: Letter Reading Flow Reuses /live Components](./p673_letter_reading_reuses_live_components.md)
> **What was wrong:** The Drawer component applies a dark backdrop overlay that obscures the story card behind it — in /live the story stays visible during rating. The Drawer styling (height, padding, typography) doesn't match /live's drawer. The "Submit" button on the story card after rating is too prominent and should be "Continue" placed outside/below the card. Position labels (Agrees/Disagrees) on the profile page render above the card boundary instead of inside it. Additionally, the in-card "Submit" label implies finality in a multi-story flow, the action button sits full-width below vote controls instead of inline-right, and there's no tooltip feedback when the button is disabled.

## Operating Mode

> This spec is an **incremental correction** to P673, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P673 are not up for re-examination.

## Problem Statement

P673 correctly replaced custom letter components with /live's production components (LiveStoryCardExpanded, Drawer, JourneyToUnderstanding, PositionButtons). The component reuse strategy is right — but seven visual details diverge from /live's actual behavior or from established UX patterns elsewhere in the app.

## Jobs To Be Done

- **Preserved from P673:** All 5 jobs (recipient reads letter with /live-quality experience, sender preview matches, sequential ritual, sealed-bid reveal, anti-point lead ordering)
- **Corrected:** Visual parity with /live — the drawer must look and behave like /live's drawer (no backdrop dimming, matching styles). Button hierarchy after rating must match /live's "Continue" pattern.
- **New:** None

## Current State

**Issue 1 — Drawer backdrop dims story:**
The `<Drawer>` component wraps the rating question. When open, it applies a dark scrim/overlay that blacks out the story card behind it. In /live, the story remains fully visible while the rating drawer is open at the bottom.

**Issue 2 — Drawer styling mismatch:**
The drawer's height, padding, border radius, and typography don't match /live's drawer pattern. The rating scale (0-10) and Submit button are rendered but the visual treatment is off.

**Issue 3 — Button prominence after rating:**
After the receiver submits a rating or positions on a point, the "Submit" button inside the card is too large and prominent. In /live, the post-action button is "Continue", positioned outside/below the card, and visually smaller (secondary action weight).

**Issue 4 — Position label overflow on profile page:**
On the profile page, the position badge (e.g., "Agrees", "Disagrees") for the other user renders above the story card boundary instead of inside the card. This may be a regression from the `hidePoints` prop addition to `LiveStoryCardExpanded`.

**Issue 5 — "Submit" label in point-engage implies finality:**
In `point-engage` and `remaining-point-engage` phases, the action button reads "Submit". This is a multi-story flow (e.g., "STORY 1 OF 3") — "Submit" implies finality when the user is simply advancing. Should read "Continue" throughout, with "Submit" reserved for the in-Drawer rating action only.

**Issue 6 — Action button full-width below vote controls:**
The "Submit" (soon "Continue") button renders full-width below PositionButtons (Disagree/Unsure/Agree), creating a heavy visual block that breaks left-to-right reading flow. The story-detail-page already has the correct pattern: button sits inline-right of vote controls using `flex flex-wrap items-center gap-2` with `ml-auto`. Letter reading should adopt this pattern.

**Issue 7 — No disabled-state feedback:**
When the action button is disabled (no position selected), there is no hint explaining why. The story-detail-page uses a Tooltip: "Pick your position first". Letter reading should match.

## Root Cause

1. **Drawer backdrop:** The `<Drawer>` shadcn/ui component defaults to `modal={true}` which renders a backdrop overlay. P673's Decision 3 specified `dismissible={false}` but did not set `modal={false}` to prevent the overlay.

2. **Drawer styling:** P673 specified the composition structure (DrawerContent > DrawerHeader > RatingButtons > Submit) but no `## UI Contract` with exact measurements. Implementation used defaults instead of matching /live.

3. **Button hierarchy:** P673 UX Notes specified "Submit" for rating action and "Continue" after reveal — but on the story card the post-action button should follow the "Continue" pattern (secondary, outside card). The spec conflated the Drawer's internal Submit with the card-level progression button.

4. **Position label overflow:** The `hidePoints` prop addition or the `StoryWithPoints` adapter may produce a layout state where the position badge container is outside the card's content boundary. Needs investigation during `/architect`.

5. **"Submit" label:** P673 used "Submit" for the in-card position action without distinguishing it from the in-Drawer rating Submit. In a multi-story sequential flow, "Submit" implies completion; "Continue" matches the progressive pattern.

6. **Button placement:** The letter pages pass the action button as `children` to `PointRow`, which renders it as a vertical sibling below `PositionButtons` (line 325 of `live-story-card-expanded.tsx`). The story-detail-page uses a `flex flex-wrap` horizontal layout with `ml-auto` for the same interaction pattern.

7. **No disabled tooltip:** The letter pages set `disabled={!selectedPosition}` on the button but provide no visual hint. The story-detail-page wraps the same pattern in shadcn `Tooltip` with contextual text.

Code references: `src/app/pages/letter-reading-page.tsx`, `src/app/pages/letter-preview-page.tsx`, `src/app/components/partners/live-story-card-expanded.tsx`, `src/app/pages/story-detail-page.tsx` (reference pattern)

## Predecessor Sections Superseded

| Section | P673 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| Decision 3 (Drawer composition) | "`<Drawer open={phase === 'story-rate'} dismissible={false}>`" | Superseded | Must also set `modal={false}` or equivalent to prevent backdrop overlay |
| UX Notes (Button labels) | "Submit" for position/rating action | Partially superseded | "Submit" stays inside Drawer; card-level progression button becomes "Continue", placed outside/below card |
| UX Notes (story + Drawer) | "drawer slides up with rating question" | Extended | Drawer must slide up WITHOUT dimming the story behind it |
| Decision 6 (LetterPointCard styling) | "same card styling (border-l-4 blue, rounded-lg) with shared PositionButtons" | Extended | Must also constrain position badge to render inside card boundary |

## Requirements

1. **Drawer backdrop transparent/removed:** When the rating Drawer is open over a story card, the story card remains fully visible — no dark overlay, no dimming. Match /live behavior exactly.
2. **Drawer styling matches /live:** Height, padding, border radius, typography, and background color of the Drawer match /live's rating drawer.
3. **"Continue" button after reveal:** After submitting a rating or point position and seeing the reveal, the progression button reads "Continue" (not "Submit"), is positioned below/outside the card, and uses secondary visual weight (smaller, less prominent than the in-Drawer Submit).
4. **Position labels inside card boundary:** On story cards with position badges (Agrees/Disagrees), the badge renders inside the card's visual boundary — no overflow above the card.
5. **"Continue" label on in-card action button:** During `point-engage` and `remaining-point-engage` phases, the action button reads "Continue" (not "Submit"). "Submit" is reserved for the in-Drawer rating action only.
6. **Action button inline-right of vote controls:** The "Continue" button sits on the same row as PositionButtons (Disagree/Unsure/Agree), aligned right via `ml-auto` in a `flex flex-wrap` container. On narrow viewports, the button wraps to its own line gracefully.
7. **Disabled-state tooltip:** When the "Continue" button is disabled (no position selected), hovering shows a tooltip: "Pick your position first".

## What Stays the Same

- Component reuse strategy (LiveStoryCardExpanded, JourneyToUnderstanding, PositionButtons, GapBanner) — unchanged
- Phase machine (useLetterReadingState) — unchanged
- Snapshot mapper (snapshotToStoryWithPoints) — unchanged
- Anti-point lead / D36 ordering — unchanged
- Preview = reading principle — unchanged
- Chrome-free letter routes — unchanged
- DB schema, RLS, auth — unchanged
- Sequential ritual (forward-only, submit-then-reveal) — unchanged
- hidePoints prop on LiveStoryCardExpanded — unchanged (but check for regression)

## Surfaces in Scope

**In scope:**
- `src/app/pages/letter-reading-page.tsx` — Drawer props, button placement
- `src/app/pages/letter-preview-page.tsx` — same changes as reading page
- `src/app/components/partners/live-story-card-expanded.tsx` — position badge overflow fix
- Drawer-related styling (may be in page files or a shared sheet component)

**Out of scope:**
- `src/app/hooks/useLetterReadingState.ts` — phase machine untouched
- `src/app/utils/letter-snapshot-mapper.ts` — mapper untouched
- `src/app/components/shared/gap-banner.tsx` — gap banner untouched
- `src/app/components/letters/letter-point-card.tsx` — unless position badge overflow traces here
- `src/app/components/partners/live-mode-view.tsx` — /live untouched
- All non-letter routes

## Acceptance Criteria

- [ ] Story card is fully visible (not dimmed) when rating Drawer is open
- [ ] Drawer styling (height, padding, corners, typography) matches /live's rating drawer
- [ ] After submitting rating/position, progression button reads "Continue" and is outside/below the card with secondary visual weight
- [ ] Position badges (Agrees/Disagrees) render inside the story card boundary on all pages
- [ ] Surfaces NOT in scope are visually unchanged
- [ ] All existing P673 tests still pass
- [ ] /live rating drawer behavior unchanged (regression check)
- [ ] In-card action button during point-engage reads "Continue" (not "Submit")
- [ ] "Continue" button sits inline-right of PositionButtons (same row, `ml-auto`)
- [ ] Disabled "Continue" shows tooltip "Pick your position first" on hover

## Technical Architecture

### Technical Analysis

**Current state on w2 branch (P673 implementation):**

**Issue 1 — Drawer backdrop:** Both `letter-reading-page.tsx` (line 536) and `letter-preview-page.tsx` (line 241) render:
```tsx
<Drawer open dismissible={false}>
  <DrawerContent>
```
The `Drawer` component (`src/components/ui/drawer.tsx`) defaults `modal` to undefined, which Vaul treats as `true`. On mobile (lines 108-115), the `DrawerContent` renders an overlay div with class `"fixed inset-0 z-50 bg-black/80"`. On desktop (line 139), it renders `DrawerOverlay` with the same `bg-black/80`. The `DrawerContent` component already accepts an `overlayClassName` prop (line 101) — /live uses `overlayClassName="bg-transparent"` (e.g., `live-mode-view.tsx` line 1599). The letter pages do NOT pass this prop.

**Issue 2 — Drawer styling mismatch:** The letter pages compose the drawer manually: `DrawerHeader` > `DrawerTitle` (visible, `text-lg font-semibold`) > `div.px-4.pb-4.space-y-4` > `RatingButtons` + full-width `Button`. In contrast, /live's drawer uses `RatingCard` (defined in `live-mode-view.tsx` line 1787) which renders: question text as `h2.text-lg.font-semibold.text-center`, then `RatingButtons` + a smaller centered `Button` (`size="sm"`, `max-w-[200px]`). /live's `DrawerHeader` is `sr-only` (screen-reader-only, line 1600), and the drawer body uses `px-4 pb-8 pt-4 space-y-4` (extra bottom padding `pb-8` vs letter's `pb-4`).

**Issue 3 — Button prominence:** After `story-revealed` phase (line 596-603 in `letter-reading-page.tsx`), the "Continue" button is already correctly labeled "Continue" and placed outside the card. After `point-revealed` phase (line 504-509), same. The problem is specifically in the `story-rate` phase: the "Submit" button inside the drawer (line 549-558) is `w-full` with primary CTA styling — this is correct for the drawer's internal action. However, the spec says the post-reveal progression button should be "Continue" outside/below the card. Examining the `story-revealed` phase: lines 596-603 already have `<Button>Continue</Button>` outside the card. The actual issue is that the `LetterPointCard` component (line 69-75 in `letter-point-card.tsx`) has a `w-full` "Submit" button that is too prominent — this is the in-card submission for positions, not the progression button. The spec calls for the card-level progression action to use secondary weight.

**Issue 4 — Position badge overflow:** The `PointRow` function inside `LiveStoryCardExpanded` (line 228-313) renders the position badge (lines 229-247) as a sibling to the point's `div.p-3.rounded-lg.border.border-gray-200.bg-gray-50` container (line 250). The badge is inside the `ThreadLineItem` but outside the visually bordered point box. The `ThreadLineGroup` + `ThreadLineItem` structure (lines 155-176) places all point rows inside `div.px-3.pb-3`. The position badge (avatar + name + ear count + PositionBadge) renders with `mb-1.5`, which is correctly contained inside the card's `div.px-3.pb-3` container. The issue is NOT overflow from `LiveStoryCardExpanded` on the profile page — the profile page (`profile-page-v2.tsx`) does NOT use `LiveStoryCardExpanded` at all. It has its own `PointRow` component (line ~1580) with position badge rendering. The `hidePoints` prop simply hides the points section. The spec's hypothesis about `hidePoints` regression is incorrect. The actual overflow is in the **letter pages** when `LiveStoryCardExpanded` renders with `hidePoints={true}` but the `storyWithPoints` data still contains `profileSubjectPosition` on points — the `hidePoints` prop hides the points section (lines 131, 153), so no badge overflow can occur from hidden points. **Root cause clarification:** The position badge overflow must be occurring on a different surface — likely when `LetterPointCard` is displayed with revealed positions, or when `LiveStoryCardExpanded` is used WITHOUT `hidePoints` in a context where `profileSubjectPosition` is populated. Given the spec says "on profile page" — this is the profile page's own `PointRow` (not `LiveStoryCardExpanded`). The profile page's `PointRow` (line 1583-1604) renders the badge in a `div` with `mb-2` but no `overflow-hidden` on the parent card. The card container is `div.rounded-xl.border.bg-card.shadow-sm` (around line 1707). The badge sits inside `.p-4` inside the card — it should be contained. A visual overflow could occur if negative margin or absolute positioning pushes it above the card boundary, but no such styles exist in the code. **Conclusion:** The position badge "overflow" described in the spec needs visual verification during implementation. The code structure on both `LiveStoryCardExpanded` and profile page `PointRow` places badges inside padded containers that should clip within the card. The fix will add `overflow-hidden` to the card container as a defensive measure.

**Issue 5 — "Submit" label:** Both letter pages pass `<Button>Submit</Button>` as children to `<PointRow>` during `point-engage` (letter-reading-page.tsx line 494, letter-preview-page.tsx line 216) and `remaining-point-engage` phases (line 614, line 314). Four locations total.

**Issue 6 — Button placement:** The `PointRow` component's `children` slot (line 325 of `live-story-card-expanded.tsx`) renders inside the bordered card `div.p-3.rounded-lg.border` as a vertical sibling below `PositionButtons`. The story-detail-page (lines 287-343) uses a different pattern: `<div className="flex flex-wrap items-center gap-2">` wrapping `<PositionButtons compact .../>` and `<div className="flex items-center gap-2 ml-auto"><Button>...</Button></div>`. To adopt this in letter reading without modifying the shared `PositionButtons` component, PointRow needs an `actionButton` prop that renders inline-right of PositionButtons when provided.

**Issue 7 — Disabled tooltip:** The story-detail-page (lines 300-344) wraps the disabled button in `TooltipProvider > Tooltip > TooltipTrigger(asChild) > span > Button` with conditional `TooltipContent`. The `<span>` wrapper is necessary because disabled buttons don't fire hover events. Letter pages currently have no tooltip imports.

### Architecture Decisions

**AD1: Drawer backdrop — use `overlayClassName="bg-transparent"` (same as /live)**

The `DrawerContent` component already supports `overlayClassName` prop (line 101 of `drawer.tsx`). Both mobile (line 112) and desktop (line 138) code paths use it. /live passes `overlayClassName="bg-transparent"` in every Drawer usage (lines 1381, 1599, 1745, 2609). The letter pages simply omit this prop, getting the default `bg-black/80`.

Fix: Add `overlayClassName="bg-transparent"` to both `<DrawerContent>` usages in `letter-reading-page.tsx` and `letter-preview-page.tsx`.

Alternative rejected: Setting `modal={false}` on `<Drawer>` — this would change Vaul's focus-trapping behavior and could allow interaction with elements behind the drawer. /live uses `modal` default (true) with transparent overlay, which is the correct pattern.

**AD2: Drawer styling — match /live's `RatingCard` pattern**

Two options:
- **(A) Import and use `RatingCard` from `live-mode-view.tsx`** — this is the component /live uses inside its drawer. It bundles question text, `RatingButtons`, and a centered `size="sm"` Submit button. However, `RatingCard` is not exported from `live-mode-view.tsx` (it's a local function). Exporting it would create a dependency on a 2500+ line file.
- **(B) Replicate /live's drawer internals in letter pages** — match the exact `px-4 pb-8 pt-4 space-y-4` padding, `sr-only` on `DrawerHeader`, and use `RatingButtons` + centered smaller Submit.

Decision: **(B) Replicate the pattern.** The styling is 5 lines of JSX — extracting `RatingCard` into a shared file is a separate refactor. Match /live exactly:
- `DrawerHeader className="sr-only"` (hide visual header, keep accessible)
- Inner div: `className="px-4 pb-8 pt-4 space-y-4"`
- Question as `h2.text-lg.font-semibold.text-center`
- Scale labels: `div.flex.justify-between.text-xs.text-muted-foreground` with "Not at all" / "Complete cognitive understanding"
- `RatingButtons` (already imported)
- Submit button: `size="sm"` `className="bg-blue-500 hover:bg-blue-600 w-full max-w-[200px] mt-2"` (centered, smaller than current `w-full`)

**AD3: Button label + weight — "Submit" becomes "Continue", post-reveal gets outline**

The in-card action button during `point-engage` and `remaining-point-engage` reads "Continue" (not "Submit"). "Submit" is reserved for the in-Drawer rating action only. This reverses the original "LetterPointCard Submit stays" conclusion — founder feedback confirms "Submit" implies finality in a multi-story flow.

Post-reveal "Continue" buttons use `variant="outline"` with `text-[#0044CC] border-[#0044CC]` styling for secondary visual weight. Affected locations:
- `letter-reading-page.tsx`: lines 494 (point-engage → "Continue"), 614 (remaining-point-engage → "Continue"), 505-509 (point-revealed → outline), 596-603 (story-revealed → outline), 627-633 (remaining-point-revealed → outline)
- `letter-preview-page.tsx`: lines 216 (point-engage → "Continue"), 314 (remaining-point-engage → "Continue"), 223-229 (point-revealed → outline), 293-299 (story-revealed → outline), 327-333 (remaining-point-revealed → outline)

**AD4: Position badge overflow — defensive `overflow-hidden` on card containers**

Code analysis shows badges render inside padded containers that should be visually contained. No negative margins or absolute positioning push badges outside card boundaries. The overflow may be a rendering artifact at certain viewport sizes or a z-index layering issue.

Decision: Add `overflow-hidden` to the card wrapper in `LiveStoryCardExpanded` (line 73-75) — the outermost `div` with `rounded-lg border-l-4`. This is a zero-risk defensive fix that ensures any future content stays within the card boundary. The `overflow-hidden` is consistent with standard card component patterns.

**AD5: Inline-right placement via `actionButton` prop on PointRow**

Add `actionButton?: React.ReactNode` to PointRow's props. When provided, PointRow wraps `PositionButtons` and `actionButton` in a `flex flex-wrap items-center gap-2` container with `actionButton` in an `ml-auto` wrapper. When absent, PointRow renders `PositionButtons` alone (current behavior). The existing `children` slot is unchanged — it continues to serve non-button content (reveal badges, guest hints).

Why not other approaches:
- Modifying `PositionButtons` — shared across /live, story pages; too much blast radius for a letter-only change
- Restyling `children` slot — used for non-button content; making it flex-row breaks other uses
- The `actionButton` prop is the same pattern as story-detail-page but localized to PointRow

In `live-story-card-expanded.tsx` lines 272-281, change from bare `<PositionButtons>` to:
```tsx
{!readOnly && (
  actionButton ? (
    <div className="flex flex-wrap items-center gap-2">
      <PositionButtons ... />
      <div className="flex items-center gap-2 ml-auto">
        {actionButton}
      </div>
    </div>
  ) : (
    <PositionButtons ... />
  )
)}
```

Letter pages switch from passing `<Button>` as `children` to passing it as `actionButton` prop.

**AD6: Disabled-state tooltip using shadcn Tooltip pattern**

Wrap the `actionButton` in letter pages with `TooltipProvider > Tooltip > TooltipTrigger(asChild) > span > Button` (the `<span>` is needed because disabled buttons don't fire hover events). Conditional `TooltipContent` shows "Pick your position first" when `!selectedPosition`. Same pattern as story-detail-page lines 300-344.

The tooltip wrapping happens at the call site (letter pages), not inside PointRow. The `actionButton` prop receives the already-wrapped button JSX.

### Security Review

**RLS Policies:**
- ✅ No changes to RLS policies. No Supabase queries added, removed, or modified. All data fetching goes through existing service functions (`getLetterForReading`, `getLetterForReadingByToken`, `docsService.getDoc`) which are unchanged.

**Authentication:**
- ✅ No changes to authentication flows. Token-based access for 1-to-1 letters, session-based auth for direct access, and unauthenticated/wrong_user guards all untouched.
- ✅ The `isAuthenticated` check gating the rating Drawer vs. "Sign in to continue" prompt remains as-is.
- ✅ Preview page has no auth checks by design (`previewMode: true`) — existing P673 behavior, not a P676 change.

**Authorization:**
- ✅ No changes to authorization logic. Wrong-user check, `claimLetterDelivery`, and `updateDeliveryStatus` calls untouched.
- ✅ P676 only modifies: Drawer props (`overlayClassName`), CSS classes, button variant/label text, and card overflow styling.

**Input Validation:**
- ✅ No new user inputs introduced. Existing inputs (rating via `RatingButtons`, position via `PositionButtons`) unchanged. Null-check guard on `pendingRating` before submission remains intact.

**Data Protection:**
- ✅ No changes to what data is displayed or to whom. `hidePoints` prop unchanged. `senderName` display logic unchanged. No PII exposure changes.

**Summary:** P676 is a pure visual correction (CSS props, component props, button variants). Zero changes to database access, RLS, authentication, authorization, input handling, or data exposure. No security concerns identified.

### Implementation Approach

#### Build Sequence

1. **Drawer overlay fix** (Issue 1) — add `overlayClassName="bg-transparent"` to both letter pages.
2. **Drawer styling match** (Issue 2) — rework drawer internals to match /live's `RatingCard` pattern.
3. **Continue button secondary weight** (Issue 3) — post-reveal Continue buttons to `variant="outline"`.
4. **Card overflow-hidden** (Issue 4) — add `overflow-hidden` to `LiveStoryCardExpanded` card container.
5. **Rename Submit→Continue + add `actionButton` prop + tooltip** (Issues 5-7) — in PointRow, add `actionButton` prop with flex-wrap layout. In both letter pages: switch from children to `actionButton`, rename to "Continue", wrap with Tooltip. These three changes touch the same JSX locations and should be done in a single pass per file.
6. **Regression check** — verify /live drawer unchanged, run existing P673 tests.

#### Files to Create

None.

#### Files to Modify

| File | Changes |
|------|---------|
| `src/app/pages/letter-reading-page.tsx` | (1) `overlayClassName="bg-transparent"` on `<DrawerContent>`. (2) Rework drawer internals to match /live. (3) Post-reveal Continue → `variant="outline"`. (4) Point-engage: rename "Submit"→"Continue", switch from `children` to `actionButton` prop, wrap with Tooltip. (5) Add Tooltip imports. |
| `src/app/pages/letter-preview-page.tsx` | Same 5 changes as reading page. |
| `src/app/components/partners/live-story-card-expanded.tsx` | (1) Add `overflow-hidden` to outermost card div. (2) Add `actionButton?: React.ReactNode` to PointRow props. (3) Conditional flex-wrap layout: when `actionButton` provided, wrap PositionButtons + actionButton in `flex flex-wrap items-center gap-2` with `ml-auto`. |

### Reuse Inventory

| Component / Utility | File Path (on w2) | Role in P676 |
|---------------------|-------------------|-------------|
| `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription` | `src/components/ui/drawer.tsx` | Already used; `overlayClassName` prop already exists — no changes needed to this file |
| `RatingButtons` | `src/app/components/partners/shared.tsx` (line 29) | Already imported in letter pages; reused as-is |
| `RatingCard` (local to live-mode-view) | `src/app/components/partners/live-mode-view.tsx` (line 1787) | Reference implementation for drawer styling; NOT imported (pattern replicated instead) |
| `LiveStoryCardExpanded` | `src/app/components/partners/live-story-card-expanded.tsx` | Receives `overflow-hidden` fix |
| `LetterPointCard` | `src/app/components/letters/letter-point-card.tsx` | No changes |
| `Tooltip`, `TooltipProvider`, `TooltipTrigger`, `TooltipContent` | `src/components/ui/tooltip.tsx` | Wrap disabled "Continue" button in letter pages — same pattern as story-detail-page |
| `Button` | `src/components/ui/button.tsx` | Already used; `variant="outline"` already supported |
| `JourneyToUnderstanding` | `src/app/components/partners/live-mode-view.tsx` | No changes |
| `GapBanner` | `src/app/components/shared/gap-banner.tsx` | No changes |
| `useLetterReadingState` | `src/app/hooks/useLetterReadingState.ts` | No changes — phase machine untouched |
| `snapshotToStoryWithPoints` | `src/app/utils/letter-snapshot-mapper.ts` | No changes |

## Test Coverage Strategy

### Scope Assessment

P676 is a pure visual/CSS correction — 3 files modified, 0 created, no DB/auth/data changes. No unit tests needed (no logic changes). All tests are E2E visual verification via Playwright.

### Existing P673 Test Coverage (Unchanged)

The following P673 test files remain unmodified — P676 must not break them:
- `src/tests/letter-snapshot-mapper.test.ts` — unit tests for mapper (no P676 impact)
- `e2e/p673-letter-reading-flow.spec.ts` — functional flow tests (P676 is visual-only, flow unchanged)
- `e2e/p673-smoke.spec.ts` — route health (unchanged)
- `e2e/a11y/p673-accessibility.spec.ts` — keyboard/focus tests (unchanged)

**Decision: Do NOT modify P673 tests.** P676 changes are purely visual (CSS classes, component props). The existing P673 tests verify functional flow behavior which is not affected. Adding visual assertions to existing tests would conflate functional and visual concerns.

### New Test File

**`e2e/p676-visual-corrections.spec.ts`** — 26 test stubs across 8 describe blocks:

| Block | Tests | Covers |
|-------|-------|--------|
| Drawer backdrop transparency | 3 | Issue 1: `overlayClassName="bg-transparent"` on reading + preview pages |
| Drawer styling matches /live | 5 | Issue 2: sr-only header, centered h2, sm Submit, pb-8 padding, scale labels |
| Continue button secondary weight | 5 | Issue 3: outline variant on all 3 post-reveal Continue buttons + preview parity + Submit regression guard |
| Position badge overflow-hidden | 2 | Issue 4: overflow-hidden class on card + badge bounding box containment |
| Submit renamed to Continue | 3 | Issue 5: point-engage + remaining-point-engage read "Continue" on both pages; in-drawer Submit still reads "Submit" |
| Button inline-right placement | 2 | Issue 6: flex-wrap + ml-auto layout on point-engage; graceful wrap on narrow viewport |
| Disabled tooltip | 2 | Issue 7: tooltip visible on hover when disabled; disappears after position selected |
| Regression: /live drawer unchanged | 2 | /live transparent overlay + Submit sizing still intact |

### Coverage Matrix

| Acceptance Criteria | Test Coverage |
|---|---|
| Story card not dimmed when drawer open | `p676-visual-corrections.spec.ts` — backdrop transparency block (3 tests) |
| Drawer styling matches /live | `p676-visual-corrections.spec.ts` — drawer styling block (5 tests) |
| Continue button outline after reveal | `p676-visual-corrections.spec.ts` — button weight block (5 tests) |
| Position badge inside card boundary | `p676-visual-corrections.spec.ts` — overflow block (2 tests) |
| Surfaces NOT in scope unchanged | `p676-visual-corrections.spec.ts` — /live regression block (2 tests) + all P673 tests pass |
| All P673 tests still pass | Run `npm run test:e2e -- --grep "P673"` as regression gate |
| /live drawer unchanged | `p676-visual-corrections.spec.ts` — regression block (2 tests) |
| In-card action button reads "Continue" | `p676-visual-corrections.spec.ts` — rename block (3 tests) |
| Continue button inline-right of PositionButtons | `p676-visual-corrections.spec.ts` — inline-right block (2 tests) |
| Disabled Continue shows tooltip | `p676-visual-corrections.spec.ts` — tooltip block (2 tests) |

### UAT Scenarios

UAT file: `features/uat/p676.md` — 10 scenarios across 5 groups matching the 4 issues + regression checks. Each scenario includes specific verify instructions (screenshot comparison, visual inspection, side-by-side with /live).
