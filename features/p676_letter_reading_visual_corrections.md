---
status: today
type: change-request
rank: 1000063
changes: p673
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

> **Redesign of:** [P673: Letter Reading Flow Reuses /live Components](../features/p673_letter_reading_reuses_live_components.md)
> **What was wrong:** The Drawer component applies a dark backdrop overlay that obscures the story card behind it — in /live the story stays visible during rating. The Drawer styling (height, padding, typography) doesn't match /live's drawer. The "Submit" button on the story card after rating is too prominent and should be "Continue" placed outside/below the card. Position labels (Agrees/Disagrees) on the profile page render above the card boundary instead of inside it — possible regression from `hidePoints` prop addition to `LiveStoryCardExpanded`.

## Operating Mode

> This spec is an **incremental correction** to P673, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P673 are not up for re-examination.

## Problem Statement

P673 correctly replaced custom letter components with /live's production components (LiveStoryCardExpanded, Drawer, JourneyToUnderstanding, PositionButtons). The component reuse strategy is right — but four visual details diverge from /live's actual behavior, breaking the "identical to /live" promise.

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

## Root Cause

1. **Drawer backdrop:** The `<Drawer>` shadcn/ui component defaults to `modal={true}` which renders a backdrop overlay. P673's Decision 3 specified `dismissible={false}` but did not set `modal={false}` to prevent the overlay.

2. **Drawer styling:** P673 specified the composition structure (DrawerContent > DrawerHeader > RatingButtons > Submit) but no `## UI Contract` with exact measurements. Implementation used defaults instead of matching /live.

3. **Button hierarchy:** P673 UX Notes specified "Submit" for rating action and "Continue" after reveal — but on the story card the post-action button should follow the "Continue" pattern (secondary, outside card). The spec conflated the Drawer's internal Submit with the card-level progression button.

4. **Position label overflow:** The `hidePoints` prop addition or the `StoryWithPoints` adapter may produce a layout state where the position badge container is outside the card's content boundary. Needs investigation during `/architect`.

Code references: `src/app/pages/letter-reading-page.tsx`, `src/app/pages/letter-preview-page.tsx`, `src/app/components/partners/live-story-card-expanded.tsx`

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

**AD3: Button prominence — LetterPointCard "Submit" stays, it's correct**

Re-analysis shows the spec's concern is about post-action button prominence. The "Submit" button inside `LetterPointCard` is the action trigger (before submission), not a post-action progression button. The "Continue" buttons in `point-revealed` and `story-revealed` phases are already correctly placed outside/below the card with full-width primary styling.

However, the spec explicitly requires: "After submitting rating/position, progression button reads 'Continue' and is outside/below the card with secondary visual weight." The `point-revealed` and `story-revealed` phases already use "Continue" text and placement outside the card. The only change needed: reduce visual weight from primary (`bg-[#0044CC]`) to secondary — use `variant="outline"` or a lighter style to make the progression button less prominent than the in-drawer Submit.

Decision: Change all post-reveal "Continue" buttons to `variant="outline"` with `text-[#0044CC] border-[#0044CC]` styling. This matches "secondary visual weight" while keeping the blue-on-white design system. Affected locations:
- `letter-reading-page.tsx`: lines 505-509 (point-revealed), 596-603 (story-revealed), 627-633 (remaining-point-revealed)
- `letter-preview-page.tsx`: lines 223-229 (point-revealed), 293-299 (story-revealed), 327-333 (remaining-point-revealed)

**AD4: Position badge overflow — defensive `overflow-hidden` on card containers**

Code analysis shows badges render inside padded containers that should be visually contained. No negative margins or absolute positioning push badges outside card boundaries. The overflow may be a rendering artifact at certain viewport sizes or a z-index layering issue.

Decision: Add `overflow-hidden` to the card wrapper in `LiveStoryCardExpanded` (line 73-75) — the outermost `div` with `rounded-lg border-l-4`. This is a zero-risk defensive fix that ensures any future content stays within the card boundary. The `overflow-hidden` is consistent with standard card component patterns.

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

1. **Drawer overlay fix** (Issue 1) — add `overlayClassName="bg-transparent"` to both letter pages. Smallest change, highest visual impact.
2. **Drawer styling match** (Issue 2) — rework the drawer internals in both letter pages to match /live's `RatingCard` pattern (sr-only header, centered smaller Submit, scale labels, `pb-8` padding).
3. **Continue button secondary weight** (Issue 3) — change all post-reveal Continue buttons in both letter pages to `variant="outline"` styling.
4. **Card overflow-hidden** (Issue 4) — add `overflow-hidden` to `LiveStoryCardExpanded` card container.
5. **Regression check** — verify /live drawer unchanged, run existing P673 tests.

#### Files to Create

None.

#### Files to Modify

| File | Changes |
|------|---------|
| `.claude/worktrees/w2/src/app/pages/letter-reading-page.tsx` | (1) Add `overlayClassName="bg-transparent"` to `<DrawerContent>` at line 537. (2) Rework drawer internals (lines 538-565): `DrawerHeader className="sr-only"`, inner div `px-4 pb-8 pt-4 space-y-4`, question as centered `h2`, scale labels, `RatingButtons`, smaller centered Submit. (3) Change 3 Continue buttons (lines 505-509, 596-603, 627-633) from `bg-[#0044CC] hover:bg-[#0033AA] text-white` to `variant="outline"` with `text-[#0044CC] border-[#0044CC]`. |
| `.claude/worktrees/w2/src/app/pages/letter-preview-page.tsx` | Same changes as above: (1) `overlayClassName="bg-transparent"` on `<DrawerContent>` at line 242. (2) Rework drawer internals (lines 243-264). (3) Change 3 Continue buttons (lines 223-229, 293-299, 327-333) to outline variant. |
| `.claude/worktrees/w2/src/app/components/partners/live-story-card-expanded.tsx` | Add `overflow-hidden` to the outermost card `div` at line 73 — change class from `rounded-lg border-l-4 border-l-blue-500 border border-gray-200 bg-white shadow-sm shrink-0` to include `overflow-hidden`. |

### Reuse Inventory

| Component / Utility | File Path (on w2) | Role in P676 |
|---------------------|-------------------|-------------|
| `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription` | `src/components/ui/drawer.tsx` | Already used; `overlayClassName` prop already exists — no changes needed to this file |
| `RatingButtons` | `src/app/components/partners/shared.tsx` (line 29) | Already imported in letter pages; reused as-is |
| `RatingCard` (local to live-mode-view) | `src/app/components/partners/live-mode-view.tsx` (line 1787) | Reference implementation for drawer styling; NOT imported (pattern replicated instead) |
| `LiveStoryCardExpanded` | `src/app/components/partners/live-story-card-expanded.tsx` | Receives `overflow-hidden` fix |
| `LetterPointCard` | `src/app/components/letters/letter-point-card.tsx` | No changes — "Submit" button is the action trigger, not a progression button |
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

**`e2e/p676-visual-corrections.spec.ts`** — 18 test stubs across 5 describe blocks:

| Block | Tests | Covers |
|-------|-------|--------|
| Drawer backdrop transparency | 3 | Issue 1: `overlayClassName="bg-transparent"` on reading + preview pages |
| Drawer styling matches /live | 5 | Issue 2: sr-only header, centered h2, sm Submit, pb-8 padding, scale labels |
| Continue button secondary weight | 5 | Issue 3: outline variant on all 3 post-reveal Continue buttons + preview parity + Submit regression guard |
| Position badge overflow-hidden | 2 | Issue 4: overflow-hidden class on card + badge bounding box containment |
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

### UAT Scenarios

UAT file: `features/uat/p676.md` — 10 scenarios across 5 groups matching the 4 issues + regression checks. Each scenario includes specific verify instructions (screenshot comparison, visual inspection, side-by-side with /live).
