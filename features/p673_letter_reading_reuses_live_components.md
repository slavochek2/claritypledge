---
status: in-progress
type: story
rank: 1000073.0
tags:
  - letters
  - reading-flow
  - component-reuse
  - live
created_date: '2026-04-07'
delivery_stage: dev
pipeline_plan: [create-spec, architect, generate-tests, dev, verify]
pipeline_ran: [create-spec, architect, generate-tests, dev]
pipeline_skipped: [challenge-prd -- founder co-designed in conversation, ux -- reuses /live components verbatim, decompose -- single concern under 10 files]
uat_file: features/uat/p673.md
test_files:
  - src/tests/letter-snapshot-mapper.test.ts
  - e2e/p673-letter-reading-flow.spec.ts
  - e2e/p673-smoke.spec.ts
  - e2e/a11y/p673-accessibility.spec.ts
---

# P673: Letter Reading Flow Reuses /live Components

## Problem

**Situation:** The letter reading flow (P581) was built with custom components — `LetterStoryReader` (plain-text renderer), `LetterGapReveal` (hand-built dual numbers), `LetterPointEngagement` (custom 3-button positions). These share zero code with /live, which already has production-tested components for the same concepts: story cards, rating drawers, gap reveals, point positioning.

**Complication:** P665 (rejected) tried to fix preview-vs-reading divergence by making preview reuse `LetterStoryReader` — but `LetterStoryReader` itself is the problem. It renders stories as plain text with no card structure, shows points as a custom sequential engagement flow, and has an unnecessary "I've read this" gate between story and rating. The result looks nothing like /live, despite being the same product showing the same data types. The preview is also broken (stuck at "Story 5 of 4" due to sessionStorage/snapshot mismatch).

**Question:** How do we rebuild the letter reading flow by composing from /live's existing components — `LiveStoryCardExpanded`, `JourneyToUnderstanding`, `RatingCard`/`Drawer`, and point cards with `PositionButtons`?

## Appetite

**Blast radius:** Letter reading and preview pages only. Composition, cover, completion, auth, email delivery, DB schema — all untouched. /live components gain one new prop (`hidePoints`) but no behavioral change for existing callers.

**Reversibility:** Fully reversible — all changes on w2 feature branch. Old components stay in git history. No DB migration.

**Decision density:** Low — all design decisions made in founder conversation (session 2026-04-07). Flow, component mapping, and ordering rules confirmed.

## Solution

Replace the 3 custom letter reading components with compositions of existing /live components:

| Concept | Delete (custom) | Replace with (/live) |
|---------|-----------------|---------------------|
| Story display | `letter-story-reader.tsx` | `LiveStoryCardExpanded` with `hidePoints` prop |
| Gap reveal | `letter-gap-reveal.tsx` | `JourneyToUnderstanding` (sealed-bid) + gap banner |
| Point engagement | `letter-point-engagement.tsx` | Point cards with `PositionButtons` from /live |
| Rating question | inline in LetterStoryReader | `RatingCard` / `RatingButtons` in `Drawer` (like /live) |
| "I've read this" gate | phase in useLetterReadingState | Removed — story + rating shown together |

### Reading flow per story

**For stories with 2+ visible points (anti-point lead):**
1. **Point 1** (card) → receiver positions (agree/disagree/unsure) → Submit → reveal sender's position + gap → Continue
2. **Story card** (`LiveStoryCardExpanded`, points hidden) → rating question in `Drawer` → Submit → `JourneyToUnderstanding` appears above story (sealed-bid: sender's prediction revealed after receiver rates) + blue gap banner with insight message → Continue
3. **Point 2** → position → Submit → reveal → Continue
4. **Point N** → ... → Continue
5. → Next story

**For stories with 1 visible point (D36 — story first):**
1. **Story card** → rate in Drawer → Submit → JourneyToUnderstanding + gap banner → Continue
2. **Point 1** → position → Submit → reveal → Continue
3. → Next story

**For stories with 0 visible points:**
1. **Story card** → rate in Drawer → Submit → JourneyToUnderstanding + gap banner → Continue
2. → Next story

**"Visible" = not hidden by sender in the clarity doc.** Point count for anti-point lead logic uses only visible points.

### JourneyToUnderstanding sealed-bid mechanic

Reuse the same `hideUntilBothSubmitted` pattern from /live. In letters, the sender's prediction is stored at seal time — it becomes "their rating." The receiver's rating is "your rating." After receiver submits, both numbers reveal simultaneously via `JourneyToUnderstanding`.

### Gap banner after story rating

Extract the blue gap banner from `live-mode-view.tsx` (lines ~2984-2988) into a shared component. Shows: "{N} points gap" badge + insight message ("{SenderName} thinks you understand **less/more** than you think"). Used by both /live and letters.

### Chrome-free letter routes (carried from P665)

The `chromeFree` prop on `ClarityLandingLayout` and the route wrappers in `App.tsx` — already implemented by P665 on w2. Keep as-is.

### Preview = reading (same principle as P665)

Preview page composes the same /live components with `previewMode: true`. Ratings interactive but local-only (no DB writes). `useLetterReadingState` hook keeps its `previewMode` guard.

## Risks / Non-Goals

### Risks

1. **`LiveStoryCardExpanded` may need props it doesn't have.** Mitigation: only one new prop needed (`hidePoints`). Verify during `/architect` that no other props are needed for the letter context (e.g., `onPositionSelect` can be omitted).

2. **Gap banner extraction from 3000-line `live-mode-view.tsx` may have hidden dependencies.** Mitigation: the banner is ~5 lines of JSX with no hooks or state. Extraction is mechanical.

3. **`useLetterReadingState` phase machine needs rewrite.** Dropping "I've read this" and changing phase names affects the hook's state transitions. Mitigation: the hook is 345 lines and well-structured — phases are string literals, transitions are explicit. `/generate-tests` locks the new behavior before `/dev`.

### Non-Goals

- Do NOT change /live's reading flow behavior — only add `hidePoints` prop to `LiveStoryCardExpanded`
- Do NOT change letter composition, cover, completion, auth, email delivery, or DB schema
- Do NOT add new database tables or migrations
- Do NOT create new custom components — the whole point is to reuse existing ones
- Do NOT change how points are stored in `point_config` — the data layer is correct
- Do NOT touch P660 (letters navigation), P651 (recipient onboarding), or P661 (composition wizard)

## Done-When

- [ ] Letter reading page shows story cards using `LiveStoryCardExpanded` (same card as /live, points hidden)
- [ ] Rating question appears in a bottom `Drawer` (same pattern as /live)
- [ ] After rating, `JourneyToUnderstanding` shows above story with sealed-bid reveal
- [ ] Gap banner shows point gap + insight message (same copy pattern as /live)
- [ ] Point engagement uses point cards with `PositionButtons` (same as /live)
- [ ] Anti-point lead: first visible point before story, rest after (2+ visible points)
- [ ] D36 preserved: 1 visible point = story first, then point
- [ ] No "I've read this" intermediate step — story and rating together
- [ ] Preview page (`/letter/:docId/preview`) renders identically to reading page
- [ ] Preview ratings are interactive but do not write to DB
- [ ] Chrome-free: no top nav or bottom nav on letter routes (carried from P665)
- [ ] `letter-story-reader.tsx`, `letter-gap-reveal.tsx`, `letter-point-engagement.tsx` deleted
- [ ] All existing P581/P661 tests updated to reflect new component structure

## Acceptance Criteria

- [ ] Recipient sees story cards identical to /live (minus points section)
- [ ] Rating experience matches /live drawer pattern
- [ ] Gap reveal matches /live `JourneyToUnderstanding` + banner
- [ ] Sequential ritual preserved — one story at a time, forward-only, Submit → reveal → Continue
- [ ] Sender preview shows exact same experience as recipient reading
- [ ] Hidden points (in clarity doc) are not shown and not counted for anti-point lead

## UX Notes

**States per story step:**
- **Point card:** idle → positioned (Submit enabled) → revealed (sender's position visible, gap shown) → Continue enabled
- **Story + Drawer:** story card visible, drawer slides up with rating question → rating selected (Submit enabled) → submitted → JourneyToUnderstanding + gap banner appear above story → Continue enabled
- **Transition:** after last point for a story, Continue advances to next story's first step

**Button labels:**
- Position/rating action: "Submit" (consistent across points and stories)
- After reveal: "Continue" (advances to next step)
- Last story, last step: "Complete letter" (triggers completion flow)

**Empty/edge states:**
- 0 stories in letter: not possible (composition requires >=1 story)
- Story with no text: shows card with empty content area (unlikely but graceful)
- All points hidden: behaves like 0-point story (story → rate → reveal)

## Predecessor Context

- **P581** (qa): Foundation — letter concept, reading ritual, gap reveal. Reading components built custom (the mistake this spec corrects).
- **P661** (done, in w2): Composition UX redesign — prediction walk. Not affected by this spec.
- **P665** (rejected): Tried to fix preview by reusing `LetterStoryReader`. Rejected because `LetterStoryReader` itself was the problem. Chrome-free work from P665 is kept.
- **P642, P648, P651** (various): Auth, RLS, onboarding fixes. Not affected.
- **P660** (qa): Letters navigation tabs. Not affected.

## Technical Architecture

### Technical Analysis

**Components to DELETE (custom letter components):**

| File | Lines | What it does | Replaced by |
|------|-------|-------------|-------------|
| `src/app/components/letters/letter-story-reader.tsx` | 279 | Orchestrates all reading phases, renders plain-text story, inline RatingButtons, phase-based UI | Composition of LiveStoryCardExpanded + Drawer + JourneyToUnderstanding in the page |
| `src/app/components/letters/letter-gap-reveal.tsx` | 42 | Dual-number gap reveal (receiver vs sender) | `JourneyToUnderstanding` (compact, sealed-bid) + extracted `GapBanner` |
| `src/app/components/letters/letter-point-engagement.tsx` | 129 | 3-button agree/disagree/unsure with locked author reveal | `LiveStoryCardExpanded` point cards with shared `PositionButtons` from `src/app/components/shared/PositionButton.tsx` |

**Files to REWRITE:**

| File | Current state | New state |
|------|--------------|-----------|
| `src/app/pages/letter-reading-page.tsx` (485 lines) | Inner `LetterReadingFlow` delegates to `LetterStoryReader` | Inner `LetterReadingFlow` composes LiveStoryCardExpanded, Drawer+RatingButtons, JourneyToUnderstanding, GapBanner, point cards directly |
| `src/app/pages/letter-preview-page.tsx` (200 lines) | Inner `LetterPreviewFlow` delegates to `LetterStoryReader` | Same composition as reading page with `previewMode: true` |
| `src/app/hooks/useLetterReadingState.ts` (346 lines) | Phases: anti-point, position-revealed, story, rate, gap-reveal, remaining-points, point, transition | New phases (see Decision 4). Drops "story" as standalone phase and "position-revealed" as intermediate |

**Components being REUSED from /live (all in `.claude/worktrees/w2/src/`):**

| Component | File | Key props | Letter usage |
|-----------|------|-----------|--------------|
| `LiveStoryCardExpanded` | `app/components/partners/live-story-card-expanded.tsx` | `story: StoryWithPoints`, `hidePoints` (new), `readOnly`, `onPositionSelect` | Story card with points hidden; author info from snapshot |
| `JourneyToUnderstanding` | `app/components/partners/live-mode-view.tsx` (line 1883, exported) | `checkerRating`, `responderRating`, `explainBackRatings`, `isChecker`, `compact`, `hideUntilBothSubmitted` | Compact mode, sealed-bid, receiver=responder, sender=checker |
| `RatingButtons` | `app/components/partners/shared.tsx` (line 29) | `selectedValue`, `onSelect`, `disabled` | Inside Drawer for story rating |
| `Drawer` + subcomponents | `components/ui/drawer.tsx` | `open`, `onOpenChange`, `dismissible` | Bottom sheet for rating question |
| `PositionButtons` (shared) | `app/components/shared/PositionButton.tsx` (line 194) | `userPosition`, `counts`, `onPositionClick`, `compact`, `narrow` | Already used inside `LiveStoryCardExpanded` point rows |

**Components KEPT as-is (not affected):**

- `letter-cover.tsx` — cover screen before reading
- `letter-progress-bar.tsx` — progress indicator
- `letter-completion-summary.tsx` — post-reading summary
- `letter-prediction-walk.tsx` — composition wizard (P661)
- `letter-seal-confirmation.tsx` — seal flow
- `letter-review-screen.tsx` — composition review
- `letters-service.ts` — data layer (unchanged)
- Chrome-free layout: `chromeFree` prop on `ClarityLandingLayout` + App.tsx route wrappers (P665, kept)

**Key type: `StoryWithPoints`** — `LiveStoryCardExpanded` expects this type, not `LetterStorySnapshot`. The reading/preview pages must map `LetterStorySnapshot` (with `point_config` JSON) to `StoryWithPoints` (with typed `points` array, `authorName`, etc.). This mapping already exists partially in `letter-story-reader.tsx`'s `getPoints()` / `getStoryText()` helpers — extract and generalize.

### Architecture Decisions

**Decision 1: Add `hidePoints` prop to `LiveStoryCardExpanded`**

Add `hidePoints?: boolean` to `LiveStoryCardExpandedProps`. When true: hide the "N points" expand trigger (footer), hide the expanded points section entirely. The story card renders author info, avatar, story text, tags — but no points.

Why not `readOnly` (existing prop): `readOnly` already auto-expands points and hides PositionButtons. `hidePoints` is orthogonal — it hides the entire points section. Letters show points as separate step cards (not nested inside the story card), so points must be invisible on the story card itself.

Implementation: Two guards in the JSX — wrap the footer trigger (`{story.points.length > 0 && !readOnly && ...}`) to also check `!hidePoints`, and wrap the expanded points block (`{isExpanded && story.points.length > 0 && ...}`) to also check `!hidePoints`. ~4 lines changed.

**Decision 2: Extract `GapBanner` from `live-mode-view.tsx`**

The gap banner (lines 2984-2988 of live-mode-view.tsx) is 5 lines of JSX: a blue border box with a badge (`"{N} points gap"`) and an insight message. Extract to `src/app/components/shared/gap-banner.tsx`.

Props: `gap: number`, `senderName: string`, `isOverconfident: boolean`. The banner computes badge text and insight message internally. For letters, the "checker" is the sender and the "responder" is the receiver, so the insight message uses: `"{senderName} thinks you understand less/more than you think"`.

Both /live's `gap-revealed` phase and letters import the same `GapBanner`. The /live callsite replaces 5 inline lines with `<GapBanner ... />`.

**Decision 3: Compose Drawer + RatingButtons for letter story rating**

The letter rating step uses the same pattern as /live's `RatingScreenBase` (line 1796): a card with rating question text, 0-10 `RatingButtons`, and a Submit button. In letters, this appears inside a `Drawer` (bottom sheet) that slides up over the story card.

Composition: `<Drawer open={phase === 'story-rate'} dismissible={false}>` wrapping `<DrawerContent>` with `<DrawerHeader>` (question text: "How well do you believe you understand this story?"), `<RatingButtons>`, and a Submit button. `dismissible={false}` because the rating is mandatory for progression.

The `RatingCard` component from `rating-card.tsx` is NOT reused — it is built for the paraphrase loop (speaker/listener roles, correction text, round numbers, "Try Again" / "Accept as Understood" actions). Letters need only the rating input portion, which is `RatingButtons` + Submit.

**Decision 4: Rewrite `useLetterReadingState` phases**

Old phases per story: `anti-point` → `position-revealed` → `story` → `rate` → `gap-reveal` → `remaining-points` / `point` → `transition`

New phases (aligned with spec's "Reading flow per story"):

For stories with 2+ visible points:
1. `point-engage` — show point card, receiver positions
2. `point-revealed` — show sender's position + gap (per-point)
3. `story-rate` — story card visible + Drawer with rating
4. `story-revealed` — JourneyToUnderstanding + GapBanner above story
5. `remaining-point-engage` — next point card
6. `remaining-point-revealed` — sender's position + gap for that point
7. (repeat 5-6 for remaining points)
8. `transition` — "Story N complete" + Continue/Complete button

For stories with 0-1 visible points:
1. `story-rate` — story card + Drawer
2. `story-revealed` — JourneyToUnderstanding + GapBanner
3. `point-engage` / `point-revealed` (if 1 point, D36)
4. `transition`

Key change: the old `story` phase ("I've read this story" gate) is removed. Story and rating are now combined in `story-rate` — the story card is visible while the Drawer slides up.

The hook's `advanceToRate()` callback is removed (no longer needed — story and rate are one phase). `advanceToStory()` is removed (no position-revealed → story transition). New callback: `submitPointPosition()` replaces `submitPosition()` with clearer naming.

**Decision 5: Snapshot-to-StoryWithPoints mapping**

`LiveStoryCardExpanded` requires `StoryWithPoints` (with `id`, `content`, `authorName`, `authorAvatarUrl`, `points[]`, `tags`, etc.). `LetterStorySnapshot` stores this as `point_config` JSON.

Create a utility function `snapshotToStoryWithPoints(snapshot: LetterStorySnapshot, senderName: string): StoryWithPoints` in `src/app/utils/letter-snapshot-mapper.ts`. This replaces the `getPoints()` / `getStoryText()` helpers in the deleted `letter-story-reader.tsx`.

The mapper builds a `StoryWithPoints` with: `id` from `story_id`, `content` from `point_config.storyText`, `authorName` from `senderName` param, `points` mapped from `point_config.points` (filtering hidden points based on visibility), and sensible defaults for optional fields (`authorEarsCount: 0`, `authorHasPledged: false`, etc.).

**Decision 6: Point cards use `LiveStoryCardExpanded` with single-point stories**

For individual point engagement steps, do NOT render a full `LiveStoryCardExpanded`. Instead, render the point content directly using the same card styling (border-l-4 blue, rounded-lg) with the shared `PositionButtons` component. This avoids the story card's author header, text truncation, and expand/collapse logic — which are irrelevant for a standalone point.

Build a lightweight `LetterPointCard` component (~40 lines) that wraps point text + `PositionButtons` in a card matching the /live point row styling. This is the one new component — but it's a thin wrapper over existing shared components, not a custom interaction pattern.

After the receiver positions, the sender's position reveals with the same `PositionBadge` from `src/app/components/shared/index.ts`.

### Security Review

**RLS Policies:**
- ✅ No changes needed. No new DB tables, RPCs, or write paths introduced.
- ✅ Existing RLS boundaries preserved: `get_letter_for_reading` (SECURITY DEFINER RPC) for anonymous recipients; `auth.uid()` match on `letter_deliveries` for authenticated readers. Neither path touched by this spec.
- ⚠️ **Adapter must source data from `point_config` only** — never issue new queries to `stories` or `points` tables. Those tables have RLS policies not designed for the letter-reading context, and could expose live community position counts to the receiver.

**Authentication:**
- ✅ Component swap does not touch auth flow. Token validation, delivery claiming, `one-to-one`/`one-to-many` path split, and `wrong_user` guard all happen at page level before any component renders.
- ✅ Preview authentication unaffected — `docsService.getDoc(docId)` enforces owner-only reads via RLS.
- ⚠️ Preview must keep `isAuthenticated={true}` equivalent wiring so no write-path component misinterprets auth state.

**Input Validation:**
- ✅ No new user inputs. Same three inputs: story rating (number), point position (enum), navigation events.
- ✅ `RatingButtons` validates rating range. `PositionButtons` validates position types via TypeScript.
- ⚠️ `LiveStoryCardExpanded`'s `onPositionSelect` supports `null` (deselection). Old `LetterPointEngagement` did not. The adapter must intercept `null` deselection and either disable it or validate before calling `submitPosition`. If `null` reaches the DB, it could produce unexpected behavior.

**Data Protection:**
- ✅ Sealed-bid pattern intact — `useLetterReadingState` only reveals prediction after `submitStoryRating` completes and `revealPrediction` RPC returns. Logic is in hook, not components.
- ✅ `receiver_email` already redacted in `get_letter_for_reading` RPC response. Component swap doesn't change what the reading page fetches.
- ⚠️ **`positionCounts` must be empty/omitted** in the `StoryWithPoints` adapter — not fetched live. Passing actual community counts would expose aggregate platform data to the receiver that was not part of the letter.
- ⚠️ **Hidden points must be filtered** from `point_config.points` before constructing the adapter object. Hidden points should not appear in the `StoryWithPoints.points` array.

**Summary — items requiring explicit verification during `/dev`:**
1. `StoryWithPoints` adapter sources all data from `point_config` only — no live DB queries
2. `positionCounts` in adapter must be empty/omitted — not fetched live
3. Hidden points filtered from `point_config.points` before constructing adapter object
4. `onPositionSelect` / `submitPosition` path handles or rejects `null` position (deselection)
5. Preview keeps `isAuthenticated={true}` equivalent wiring

### Implementation Approach

#### Build Sequence

1. **Add `hidePoints` to `LiveStoryCardExpanded`** — 4-line change, no behavioral impact on existing callers. Verifiable immediately.
2. **Extract `GapBanner`** — new shared component from inline JSX in live-mode-view.tsx. Update /live callsite to use it. Verifiable by running existing /live tests.
3. **Create `snapshotToStoryWithPoints` mapper** — pure utility, unit-testable in isolation. Security constraints: (a) source all data from `point_config` only — no DB queries; (b) set `positionCounts` to empty objects for all points; (c) filter hidden points from `point_config.points` before constructing `StoryWithPoints`.
4. **Rewrite `useLetterReadingState`** — new phase machine. This is the core state change. Tests from `/generate-tests` lock the new behavior before implementation.
5. **Build `LetterPointCard`** — thin wrapper for point display + PositionButtons. Security constraint: intercept `null` position from `onPositionSelect` (deselection not supported in letters — disable or ignore).
6. **Rewrite `letter-reading-page.tsx`** — compose LiveStoryCardExpanded (hidePoints), Drawer+RatingButtons, JourneyToUnderstanding, GapBanner, LetterPointCard. Wire to rewritten hook.
7. **Rewrite `letter-preview-page.tsx`** — same composition with `previewMode: true`.
8. **Delete** `letter-story-reader.tsx`, `letter-gap-reveal.tsx`, `letter-point-engagement.tsx`.
9. **Update existing tests** — P581/P661 tests that reference deleted components.

Steps 1-3 can be parallelized. Step 4 depends on the phase design being locked. Steps 6-7 depend on all prior steps. Step 8 is mechanical cleanup after 6-7 are verified.

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/components/shared/gap-banner.tsx` | Extracted gap badge + insight message (from live-mode-view.tsx lines 2984-2988) |
| `src/app/utils/letter-snapshot-mapper.ts` | `snapshotToStoryWithPoints()` — maps LetterStorySnapshot to StoryWithPoints |
| `src/app/components/letters/letter-point-card.tsx` | Thin wrapper: point text + PositionButtons + sender position reveal |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/components/partners/live-story-card-expanded.tsx` | Add `hidePoints?: boolean` prop, two JSX guards |
| `src/app/components/partners/live-mode-view.tsx` | Replace inline gap banner JSX with `<GapBanner />` import (lines 2984-2988, and similar at ~3124) |
| `src/app/hooks/useLetterReadingState.ts` | Full rewrite: new phase types, remove advanceToStory/advanceToRate, add new phase transitions per Decision 4 |
| `src/app/pages/letter-reading-page.tsx` | Rewrite `LetterReadingFlow` inner component to compose /live components instead of delegating to LetterStoryReader |
| `src/app/pages/letter-preview-page.tsx` | Rewrite `LetterPreviewFlow` inner component, same composition as reading page |
| `src/app/components/letters/letter-story-reader.tsx` | DELETE |
| `src/app/components/letters/letter-gap-reveal.tsx` | DELETE |
| `src/app/components/letters/letter-point-engagement.tsx` | DELETE |

## Test Coverage Strategy

**Generated:** 2026-04-07
**Feature:** P673 Letter Reading Flow Reuses /live Components

---

### What's Tested (and Why)

**Unit Tests (13 tests):**
- `snapshotToStoryWithPoints` mapper — pure function with security constraints. Tests: basic mapping (6), security constraints (4: positionCounts empty, hidden points filtered, minimal input, no DB deps), edge cases (3: 0 points, missing text, null authorPosition).
- **Why unit:** Pure transformation with security-critical behavior. Cheapest to test at this level.

**E2E Tests (15 tests):**
- Story card renders with LiveStoryCardExpanded, hidePoints (AC1)
- Rating in Drawer (AC2) — drawer visible, Submit disabled until selection
- JourneyToUnderstanding + GapBanner after rating (AC3) — sealed-bid reveal, insight message
- Point engagement with PositionButtons (AC4) — position + reveal
- Anti-point lead ordering 2+ points (AC5)
- D36 story-first for 1 point (AC6)
- 0-point story flow (AC7)
- No "I've read this" gate (AC8)
- Forward-only navigation (AC9)
- Hidden points excluded (AC10)
- Chrome-free (AC11)
- Preview matches reading (AC12)
- Preview no DB writes (AC12)
- Boundary: all points hidden, sessionStorage resume
- **Why E2E:** UI composition changes best verified through user flows.

**Smoke Tests (4 tests):**
- Reading route loads without errors
- Preview route loads without errors
- Non-letter routes still have nav (regression guard)
- /letters route has nav (not chrome-free)
- **Why smoke:** Layout wrapper changes could silently break other routes.

**Accessibility Tests (4 tests):**
- Drawer keyboard accessible (Tab, Enter, Space)
- Point position buttons keyboard accessible
- Focus moves to Continue after reveal
- No orphaned focus trap after nav removal
- **Why a11y:** Removing top nav changes tab order. Drawer must be keyboard navigable.

**UAT Scenarios (11 manual tests):**
- 2 story card visual parity (vs /live side-by-side)
- 2 drawer experience (slides up, no gate)
- 2 gap reveal (JourneyToUnderstanding + banner)
- 2 point engagement (card + reveal)
- 3 flow ordering (anti-point, D36, 0-point)
- 1 preview fidelity
- 1 chrome-free
- **Why manual:** Visual parity and "feel" require human eyes.

---

### What's NOT Tested (Rationale)

**Integration tests:**
- N/A — no DB changes, no new RPCs, no migration.

**Component tests for GapBanner:**
- Covered by E2E (if banner renders wrong, gap reveal tests fail) and by /live's existing tests after extraction.

**Component tests for LetterPointCard:**
- Thin wrapper (~40 lines) over existing PositionButtons. Covered by E2E point engagement tests.

**useLetterReadingState phase transitions (unit):**
- State machine tested via E2E flows that exercise every phase. Unit testing the hook would duplicate E2E coverage without additional confidence.

**LiveStoryCardExpanded hidePoints prop:**
- ~4 lines of JSX guards. Covered by E2E story card tests (assert no points visible). /live tests verify existing behavior unchanged.

---

### Test Pyramid Breakdown

```
       /\
      /  \     15 E2E tests (all ACs)
     /____\
    /      \
   / 4 SMOKE \ 4 smoke tests (route health)
  /____________\
 / 4 A11Y      \ 4 accessibility tests
/________________\
/ 13 UNIT         \ 13 unit tests (mapper)
\__________________/
```

**Total:** 36 automated tests + 11 UAT scenarios
**Estimated run time:** ~50 seconds (unit: 2s, E2E: 35s, smoke: 8s, a11y: 5s)

---

### Files Generated

1. `src/tests/letter-snapshot-mapper.test.ts` — Unit tests (13 tests)
2. `e2e/p673-letter-reading-flow.spec.ts` — E2E tests (15 tests)
3. `e2e/p673-smoke.spec.ts` — Smoke tests (4 tests)
4. `e2e/a11y/p673-accessibility.spec.ts` — Accessibility tests (4 tests)
5. `features/uat/p673.md` — UAT scenarios (11 tests)
