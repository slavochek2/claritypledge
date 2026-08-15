---
status: rejected
type: change-request
rank: 1000063
changes: p581
tags:
  - redesign
  - p581
  - letters
  - composition
  - ux
created_date: 2026-04-05T00:00:00.000Z
delivery_stage: verify
pipeline_plan:
  - change-request
  - architect
  - generate-tests
  - dev
  - verify
pipeline_ran:
  - change-request
  - architect
  - generate-tests
  - dev
  - verify
uat_file: features/uat/p661.md
test_files:
  - e2e/p581-letter-composition.spec.ts
  - e2e/p661-letter-preview.spec.ts
pipeline_skipped:
  - ux -- UX resolved in ascii-flows session before filing
  - challenge-prd -- business requirements unchanged
  - decompose -- under 5 files
superseded_by: p665
locked_at: '2026-04-07T11:19:38.000Z'
---

# P661: Letter Composition — Sender Walks Receiver's Reading Flow

> **Redesign of:** [P581: Letters with Comprehension Assessment](../done/22_mar_26/p581_letters_with_comprehension_assessment.md)
> **Sibling CR:** [P651: Letter Recipient Onboarding](../done/22_mar_26/p651_letter_recipient_onboarding_redesign.md) (different surface — recipient auth, not composition)
> **What was wrong:** P581 specifies a 3-step wizard for letter composition (receivers → summary-card predictions → inline preview → seal). The wizard shows stories as compact summary cards during prediction — the sender never experiences what the receiver will experience. Preview is an in-wizard summary view, not the real receiver reading flow. The wizard pattern is a SaaS form that breaks ClarityPledge's ritual design language (D6: "ritual, not feed"). Story cards don't reuse `LiveStoryCardExpanded` from /live — builds parallel UI.

## Operating Mode

> This spec is an **incremental correction** to P581, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P581 are not up for re-examination.

## Problem Statement

P581's composition wizard fails the product's own design principle D6 ("ritual, not feed — deliberate slowness, one story at a time"). The reading flow is ritualistic — full-screen, sequential, one story at a time. But the composition flow where the sender sets predictions is a SaaS wizard with summary cards. The sender who predicts "How well will Alex understand this?" while looking at a compact card is making a shallower prediction than one who reads the full story with points expanded, exactly as Alex will see it.

The preview step (D42) compounds this: it renders a summary view inside the wizard, not the actual receiver experience. The sender cannot open it on their phone to check mobile layout, cannot share it to test, cannot experience the pacing the receiver will feel.

**User harm:** Shallow predictions → less meaningful gap reveals. Sender doesn't empathize with the receiver's reading experience → poor story curation. Preview that isn't the real thing → false confidence about what was sent.

## Jobs To Be Done

- **Preserved from P581:** All 6 jobs unchanged — post-workshop proof, pre-session triage, focused reading ritual, gap reveal moment, false premise rejection, post-reading gap map
- **Corrected:** "As a letter sender, I want to predict how well the receiver will understand each story" — the JTBD is preserved but the mechanism changes: prediction now happens while experiencing the full story card (same as receiver), not a summary card
- **New:** "As a letter sender, I want to experience what the receiver will see before sending, so I can judge whether the letter achieves what I intended" — this job was nominally served by preview (D42) but the summary view didn't actually deliver it

## Current State

P581 specifies (not yet fully built — spec-level redesign):

```
┌─────────────────────────┐
│ Wizard Step 1           │
│ ○ Specific people       │
│ ○ Anyone with a link    │
│ [email, email, ...]     │
│         [→ Next]        │
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Wizard Step 2           │
│ ┌─ Story 1 ──────────┐ │
│ │ (summary card)      │ │
│ │ Predict: ● ● ● ●   │ │
│ └─────────────────────┘ │
│ ┌─ Story 2 ──────────┐ │
│ │ (summary card)      │ │
│ │ Predict: ● ● ● ●   │ │
│ └─────────────────────┘ │
│         [→ Preview]     │
└──────────┬──────────────┘
           ▼
┌─────────────────────────┐
│ Preview (in-wizard)     │
│ "This is a preview"     │
│ Summary of letter       │
│  [← Back] [Seal & Send] │
└─────────────────────────┘
```

- Stories shown as compact summary cards with prediction dots — not the full `LiveStoryCardExpanded` the receiver sees
- Preview is a summary view inside the wizard, not a real URL
- 3-step wizard with step indicators — SaaS form pattern
- Separate `letter-compose-page.tsx` planned as a wizard page
- Separate composition-specific progress bar component

## Root Cause

Design decision at spec time: composition was modeled as a form ("fill in predictions for each story") rather than as an experience ("walk through the stories as the receiver will"). This led to the wizard pattern, which naturally uses compact cards (forms show many items) rather than full cards (experiences show one at a time).

The preview (D42) was designed as a step within this form, not as a standalone URL — because the wizard owns the state. This prevents the preview from being the real receiver experience.

## Redesign

Replace the 3-step wizard with: modal for receiver setup → sender walks the receiver's reading flow with "predict" swapped for "rate" → review + send screen.

**After (redesign):**

### Phase 0: Receiver Setup (modal on doc page)

```
┌─────────────────────────────────┐
│  Doc: "Our Q2 Decisions"        │
│  3 stories · 7 points           │
│                                 │
│  [Prepare a Letter]  ← primary CTA (D22 preserved)
└──────────┬──────────────────────┘
           ▼
┌─────────────────────────────────┐
│ ╔═══════════════════════════╗   │
│ ║                           ║   │
│ ║   Who is your letter for? ║   │
│ ║                           ║   │
│ ║   ○ Specific people       ║   │
│ ║     [alex@..., bob@...]   ║   │
│ ║                           ║   │
│ ║   ○ Anyone with a link    ║   │
│ ║     (public docs only)    ║   │
│ ║                           ║   │
│ ║              [Continue →] ║   │
│ ╚═══════════════════════════╝   │
└──────────┬──────────────────────┘
           ▼
```

### Phase 1: Prediction Walk (sender walks receiver's reading flow)

Renders the EXACT same reading flow the receiver will see — same full-screen, one-story-at-a-time `LiveStoryCardExpanded`, same progress bar, same pacing. The only difference: the prompt swaps.

- Receiver sees: "How confident are you that you understand [Author]?"
- Sender sees: **"How well do you believe [Alex] understands your story?"** (same pattern as /live speaker question)

```
┌─────────────────────────────────┐
│ ✕                               │
│ ▓▓▓░░░░░░░░░░  Story 1 of 3    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  [LiveStoryCardExpanded]│    │
│  │                         │    │
│  │  Avatar · Author · 🦻   │    │
│  │  Story text...          │    │
│  │                         │    │
│  │  ▼ 3 points linked      │    │
│  │  ┌─ Point 1 ──────────┐│    │
│  │  │  position badge     ││    │
│  │  └─────────────────────┘│    │
│  │  ┌─ Point 2 ──────────┐│    │
│  │  │  ...                ││    │
│  │  └─────────────────────┘│    │
│  │                         │    │
│  └─────────────────────────┘    │
│                                 │
│  "How well do you believe       │
│   Alex understands your story?" │
│                                 │
│  (0) ● ● ● ● ● ● ● ● ● ● (10) │
│                                 │
│                  [Next Story →] │
└──────────┬──────────────────────┘
           ▼
  (repeat for each story)
           ▼
```

For 1-to-1 with MULTIPLE receivers: after completing predictions for Alex, prompt "Now predict for Bob" — same stories, fresh predictions. Progress bar resets.

For 1-to-many: single "typical reader" prediction per story. Prompt: "How well do you believe readers will understand your story?"

### Phase 2: Review + Send

```
┌─────────────────────────────────┐
│ ✕                               │
│                                 │
│  Ready to send                  │
│                                 │
│  To: Alex (alex@example.com)    │
│  3 stories · 7 points           │
│                                 │
│  ┌─────────────────────────┐    │
│  │ "When we decided..."    │    │
│  │ Your prediction: 7      │    │
│  ├─────────────────────────┤    │
│  │ "The time we..."        │    │
│  │ Your prediction: 4      │    │
│  ├─────────────────────────┤    │
│  │ "Remember when..."      │    │
│  │ Your prediction: 8      │    │
│  └─────────────────────────┘    │
│                                 │
│  [Preview as Alex ↗]           │
│  (opens /letter/:id?preview=true│
│   — real receiver URL + banner) │
│                                 │
│  [Seal & Send]                  │
│                                 │
└──────────┬──────────────────────┘
           ▼
```

### Phase 3: Confirmation

```
┌─────────────────────────────────┐
│                                 │
│   ╔═══════════════════════╗     │
│   ║                       ║     │
│   ║   Letter Sealed  ✦    ║     │
│   ║                       ║     │
│   ║   Sent to Alex        ║     │
│   ║   3 stories            ║     │
│   ║                       ║     │
│   ║   "You'll see Alex's  ║     │
│   ║    responses as they  ║     │
│   ║    read."             ║     │
│   ║                       ║     │
│   ╚═══════════════════════╝     │
│                                 │
│       [Back to Doc]             │
│                                 │
└─────────────────────────────────┘
```

### Preview Link Behavior

`/letter/:id?preview=true` renders:
- The exact receiver reading flow (same component, same pacing)
- Rating dots are interactive but don't persist
- Banner: "THIS IS A PREVIEW — The receiver will see this"
- Sender can open on their phone to check mobile layout
- [← Back to composition] link returns to review screen

## Predecessor Sections Superseded

| Section | P581 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AC: Composition | "Wizard Step 1: add receivers — mode selector... then email input or link generation" | **Partially superseded** | Modal replaces wizard step, but content (mode selector, email input) preserved |
| AC: Composition | "Wizard Step 2: set per-story predictions (0-10) using dot picker" | **Superseded** | Phase 1: prediction walk using LiveStoryCardExpanded |
| AC: Composition | "Preview step: sender previews the full reading flow with 'This is a preview' banner" | **Superseded** | Phase 2: preview = real link `/letter/:id?preview=true` |
| D42 | "Sender can preview the full reading flow with 'This is a preview' banner before committing" | **Superseded** | Preview is a real URL, not an in-wizard step |
| UI Contract | "Preview banner: 'This is a preview — the receiver will see this'" | **Partially superseded** | Banner text may differ; delivery is via URL, not wizard |
| Build: Files to Create | "`letter-compose-page.tsx` — 3-step composition wizard" | **Superseded** | Composition uses the reading flow component in predict mode |
| Build: Route | "`/letter/:docId/compose` — Composition wizard — Focus" | **Superseded** | No separate compose route; composition happens via modal + reading flow component |
| Build: Component | "`letter-progress-bar.tsx` for composition" | **Superseded** | Reuses the reading flow progress bar |
| Responsive spec | "Composition wizard: stacked steps, full-screen" / "centered card" / "side by side" | **Superseded** | Same responsive behavior as the reading flow |

## Requirements

1. "Prepare a Letter" on doc page opens a modal (not a wizard page) with mode selector + email input
2. After receiver setup, composition enters prediction walk: same full-screen, one-story-at-a-time flow that the receiver reading flow uses
3. Story cards in prediction walk use `LiveStoryCardExpanded` — same component as /live
4. Rating input uses `RatingButtons` — same component as /live and letter reading
5. Prediction prompt: "How well do you believe [Name] understands your story?" (matches /live speaker question pattern)
6. Progress bar at top shows story N of M — same component as letter reading flow
7. After all stories predicted, review screen shows compact summary + "Preview as [Name]" link + "Seal & Send"
8. "Preview as [Name]" opens `/letter/:id?preview=true` — the real receiver URL with a preview banner
9. "Seal & Send" commits the letter (snapshot, DB rows, email) — unchanged from P581
10. Confirmation screen with ceremonial "Letter Sealed ✦" pattern
11. For multiple 1-to-1 receivers: after completing predictions for one receiver, prompt to predict for next receiver
12. For 1-to-many: single "typical reader" prediction per story

## What Stays the Same

- **All reading-side behavior** — receiver reading flow, rating, positioning, story filing, sealed-bid, engagement gates
- **All completion summary behavior** — gap display, point sorting, /live CTA
- **All data model** — 5 tables, column additions, `story_versions` snapshots, `story_verifications`
- **All auth flows** — 1-to-1 auth (P651 handles corrections), 1-to-many anonymous access
- **All delivery mechanics** — email sending, token-gated access, status tracking
- **All RLS policies** — sealed-bid enforcement, letter access control
- **"Prepare a Letter" entry point** — still on doc page header, still primary CTA (D22)
- **Mode selector content** — "Specific people" vs "Anyone with a link"
- **Email input and receiver setup content** — email lookup, existing user detection
- **Hidden points excluded from snapshot**
- **Mid-composition story addition** — close composition, add to doc, reopen

## Surfaces in Scope

**In scope:**
- Letter composition UI (replace wizard with modal + prediction walk)
- Letter preview route (`/letter/:id?preview=true`)
- Letter reading flow component (add "predict" mode alongside "rate" mode)
- Doc detail page (entry point — "Prepare a Letter" opens modal instead of navigating to wizard)

**Out of scope:**
- Letter reading flow (receiver side) — unchanged
- Letter completion summary — unchanged
- All database schema and migrations — unchanged
- All auth/onboarding flows — unchanged (P651 handles separately)
- All email delivery — unchanged
- Sender results view — unchanged

## Acceptance Criteria

- [ ] "Prepare a Letter" on doc page opens a modal with receiver setup (mode + emails), not a wizard page
- [ ] Modal prompt: "Who is your letter for?"
- [ ] After receiver setup, sender enters full-screen prediction walk
- [ ] Prediction walk shows one story at a time using `LiveStoryCardExpanded` with points visible
- [ ] Progress bar shows "Story N of M" — same component as receiver reading flow
- [ ] Prediction prompt: "How well do you believe [Name] understands your story?"
- [ ] Rating input uses existing `RatingButtons` (0-10 discrete dots)
- [ ] After all stories, review screen shows prediction summary + preview link + Seal & Send
- [ ] "Preview as [Name]" opens `/letter/:id?preview=true` in a new tab — renders exact receiver reading flow with preview banner
- [ ] Preview banner: "THIS IS A PREVIEW — The receiver will see this"
- [ ] "Seal & Send" commits the letter — same snapshot + DB + email behavior as P581
- [ ] Confirmation screen shows "Letter Sealed ✦" with ceremonial framing
- [ ] Multiple 1-to-1 receivers: sequential prediction walks per receiver
- [ ] 1-to-many: single "typical reader" prediction, prompt uses "readers" not a name
- [ ] All existing P581 reading-side and completion-side tests still pass
- [ ] No separate `/letter/:docId/compose` wizard route created
- [ ] Composition and reading share the same story display component (no parallel UI)

## Technical Architecture

### Technical Analysis

**Current codebase state (on w2 branch):**

- `letter-compose-page.tsx` (717 lines) — fully built 4-step wizard: `ModeStep` → `PredictionsStep` → `PreviewStep` → `SealStep`. All wired to `lettersService.createLetter()` / `sealLetter()`. Contains `handleSeal()` with the full seal flow (create draft → build predictions → build deliveries → seal → fire emails).
- `letter-reading-page.tsx` (484 lines) — complete reading flow with `LetterReadingFlow` inner component using `useLetterReadingState` hook. Routes: `/letter/:id` with optional `?token=`.
- `useLetterReadingState.ts` (333 lines) — state machine with phases: `anti-point` → `position-revealed` → `story` → `rate` → `gap-reveal` → `remaining-points` → `transition`. Persists to sessionStorage. All DB writes go through `letters-service` RPCs.
- `LiveStoryCardExpanded` — renders story card with avatar, author name, ears count, story text, tag pills, expandable points with `PositionButtons`. Takes `StoryWithPoints` (from `/live` data model), not `LetterStorySnapshot`.
- `LetterStoryReader` — renders phase-appropriate UI per story: point engagement, position reveal, story text, `RatingButtons`, gap reveal. Takes `LetterStorySnapshot` + phase + callbacks.
- `LetterProgressBar` — simple segmented bar, takes `currentIndex` + `totalStories`. Fully reusable as-is.
- `RatingButtons` — 0-10 dot picker, takes `selectedValue` + `onSelect` + `disabled` + `fullWidth`. Fully reusable as-is.
- `doc-detail-page.tsx` — "Prepare a Letter" button navigates to `/letter/${doc.id}/compose` via `<Link>`.
- Route `/letter/:docId/compose` registered in `App.tsx` (line 609-618).

**Key data model difference:** `LiveStoryCardExpanded` consumes `StoryWithPoints` (live session data: `story.content`, `story.points[]` with `PositionButtons` counts). The letter flow uses `LetterStorySnapshot` (snapshot data: `point_config.storyText`, `point_config.points[]` with author positions). These are structurally different — `LiveStoryCardExpanded` cannot consume letter snapshot data without an adapter or prop changes.

**Reuse assessment of `LiveStoryCardExpanded` for prediction walk:**

The spec says "sender walks the receiver's reading flow" using `LiveStoryCardExpanded`. However, the prediction walk differs from both the /live flow and the letter reading flow:
1. **No position engagement** — sender predicts understanding (0-10), doesn't take positions on points.
2. **No phase state machine** — sender sees the full story card with all points expanded, then rates. No anti-point → position-revealed → story → rate sequence.
3. **No gap reveal** — prediction is being SET, not compared.
4. **Different data shape** — prediction walk works with `DocStory[]` (fetched from doc), not `LetterStorySnapshot[]` (which don't exist until seal).

The prediction walk is structurally simpler than the reading flow: show story card → show prediction prompt → next. `LiveStoryCardExpanded` can render the story content but needs its points in non-interactive display mode (no position buttons during prediction).

### Architecture Decisions

**AD1: Do NOT reuse `useLetterReadingState` for prediction walk.**
The reading state machine manages a complex phase sequence (anti-point → position-revealed → story → rate → gap-reveal → remaining-points → transition) with DB writes (submitPosition, submitRating, revealPrediction). The prediction walk has exactly one phase per story: "show story + predict." Building a second mode into this state machine would add conditional branches to every phase transition. A simple `useState` index + predictions map (which `letter-compose-page.tsx` already has) is sufficient.

**AD2: Reuse `LiveStoryCardExpanded` with `readOnly` prop for story display.**
Add an optional `readOnly?: boolean` prop to `LiveStoryCardExpanded`. When `true`: points auto-expand, `PositionButtons` hidden, "Add your story" CTA hidden. The card becomes a read-only display of the full story + points — exactly what the sender needs to see before predicting. This is a 1-prop addition, not a fork.

To bridge the data shape gap: create a `docStoryToStoryWithPoints(docStory: DocStory): StoryWithPoints` adapter function in the new composition page. `DocStory.story` already contains `content`, `points`, `authorName`, etc. — the mapping is mechanical.

**AD3: Prediction walk lives in a new `LetterPredictionWalk` component, not in `LetterStoryReader`.**
`LetterStoryReader` is tightly coupled to the reading state machine's phase system (it switches on `phase` to render different UIs). The prediction walk has no phases — it shows the full story card + `RatingButtons` prompt. A thin component that sequences through stories with `LiveStoryCardExpanded` (readOnly) + `RatingButtons` + "Next Story" button is cleaner than adding a `mode` branch to every phase block in `LetterStoryReader`.

**AD4: Replace wizard page with modal + orchestrator pattern.**
- `letter-compose-page.tsx` → **gut and repurpose** as `LetterComposeOrchestrator` (not a route page anymore). It becomes the state machine for: modal → prediction walk → review → seal → confirmation. All phases render full-screen except the initial modal.
- The `/letter/:docId/compose` route stays but renders the orchestrator instead of the wizard.
- Reason to keep the route: deep-linking, browser back button, bookmarkability. The modal is the first thing shown on this route.

**AD5: Preview = `/letter/:docId/preview` (separate route, no DB changes).**
The existing reading page (`/letter/:id`) expects a delivery ID + sealed snapshots. Preview happens BEFORE seal, so no delivery exists. Rejected alternatives: (a) adding `?preview=true` to the reading page (route expects delivery ID that doesn't exist yet), (b) two-phase seal creating draft snapshots first (requires new RPC + migration, spec says no DB changes).

Solution: `/letter/:docId/preview` (new route) renders the reading flow components with doc stories transformed to snapshot shape client-side via `docStoryToStoryWithPoints()`. No letter row needed — `LetterStoryReader` receives data as props regardless of source. Rating dots are interactive but write to local state only (no DB calls). Preview banner shown. "Back to composition" link navigates back.

This avoids ALL schema changes. The "real receiver URL" aspect is sacrificed — but the sender sees the exact same components, layout, and pacing the receiver will see. The URL is different but the experience is identical. The spec's intent ("sender can open on their phone to check mobile layout") is still met — the preview route is a real URL they can share/open anywhere.

**AD6: Receiver setup modal — new component, standard Dialog pattern.**
Create `LetterReceiverModal` using shadcn `Dialog`. Content is extracted from the existing `ModeStep` component (mode selector cards + email input + name input + lookup logic). The modal opens when "Prepare a Letter" is clicked on the doc page, and on submit it navigates to the compose route with receiver data in route state.

**AD7: Review + Send screen — new component within the compose orchestrator.**
`LetterReviewScreen` shows: recipient info, compact story summaries with prediction values, "Preview as [Name]" link (opens `/letter/:docId/preview` in new tab), "Seal & Send" button. The seal handler is extracted from the current `handleSeal` in `letter-compose-page.tsx` — logic is identical.

**AD8: Confirmation screen — new component within the compose orchestrator.**
`LetterSealConfirmation` shows the ceremonial "Letter Sealed" pattern. Extracted/simplified from the current `SealStep`'s post-seal state. "Back to Doc" navigates to `/d/:docId`.

**AD9: Multiple receivers — sequential prediction walks.**
For 1-to-1 with N receivers: the orchestrator loops the prediction walk N times, each time displaying the receiver name in the prompt. Predictions stored per-receiver in a `Map<receiverEmail, Map<storyId, number>>`. After all receivers predicted, move to review screen showing all receivers. Seal creates N deliveries with per-receiver predictions (current `sealLetter` RPC already supports N deliveries).

### Security Review

**RLS Policies:**
- ✅ **No new RLS needed for prediction walk.** Predictions are client-side state until seal. The `seal_and_send_letter` RPC validates `sender_id = auth.uid()` before inserting — unchanged.
- ✅ **Preview route (`/letter/:docId/preview`) needs no new RLS.** It reads doc stories (already gated by doc RLS — owner or public doc) and renders client-side only. No letter/delivery rows accessed.
- ✅ **Sealed-bid protection robust against preview abuse.** Even if a receiver somehow reached the preview route, `letter_predictions` RLS only reveals predictions after a `story_verifications` row exists with `source='letter'`. Preview mode creates no verification rows. Sealed-bid enforced at DB level.

**Authentication:**
- ✅ **Compose flow remains auth-gated.** Doc detail page requires auth. `createLetter` / `sealLetter` RPCs validate `auth.uid()`. Modal + prediction walk render inside the auth-gated compose route.
- ✅ **Preview route auth-gated by doc ownership.** `/letter/:docId/preview` fetches doc stories — doc RLS enforces the viewer is the owner (private docs) or doc is public. For private docs, only the owner (sender) can access preview.

**Input Validation:**
- ✅ **Email validation unchanged.** Modal reuses exact same email input + lookup + self-send check from `ModeStep`.
- ✅ **Prediction values validated at DB level.** `letter_predictions` has `CHECK (prediction >= 0 AND prediction <= 10)`.

**Data Protection:**
- ✅ **Predictions remain client-side until seal.** No intermediate persistence, no intermediate leak surface.
- ✅ **Preview ratings non-persistent.** Preview mode skips all DB write calls.
- ⚠️ **Multi-receiver prediction state isolation.** Sequential prediction walks must reset cleanly between receivers. AD9 uses `Map<receiverEmail, Map<storyId, number>>` — implementation must ensure the prediction walk component receives a fresh empty map for each new receiver, not a reference to the previous receiver's predictions. Implementation correctness concern, not confidentiality.

### Implementation Approach

#### Build Sequence

1. **Add `readOnly` prop to `LiveStoryCardExpanded`** — when true, auto-expand points, hide `PositionButtons` and story CTA. Zero visual change when prop is absent.
2. **Create `LetterReceiverModal`** — extract mode selector + email input + lookup from `ModeStep`. Wire to `doc-detail-page.tsx` replacing the `<Link to="/letter/.../compose">`.
3. **Create `LetterPredictionWalk`** — sequential story display using `LiveStoryCardExpanded` (readOnly) + `RatingButtons` + `LetterProgressBar`. Takes `DocStory[]` + receiver name + `onComplete(predictions)`.
4. **Create `LetterReviewScreen`** — compact prediction summary + preview link + Seal & Send button.
5. **Create `LetterPreviewPage`** — route component at `/letter/:docId/preview`. Transforms `DocStory[]` to snapshot shape, renders `LetterStoryReader` + `LetterProgressBar` in non-persisting mode with preview banner.
6. **Create `LetterSealConfirmation`** — ceremonial "Letter Sealed" screen with "Back to Doc" CTA.
7. **Rewrite `letter-compose-page.tsx`** — replace wizard with orchestrator: modal result → prediction walk → review → seal → confirmation. Reuse `handleSeal` logic.
8. **Update `App.tsx`** — add `/letter/:docId/preview` route, keep `/letter/:docId/compose`.
9. **Update `doc-detail-page.tsx`** — "Prepare a Letter" opens modal (onClick handler) instead of navigating (Link).

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/components/letters/letter-receiver-modal.tsx` | Dialog with mode selector + email input + receiver lookup. Extracted from `ModeStep`. |
| `src/app/components/letters/letter-prediction-walk.tsx` | Sequential story display: `LiveStoryCardExpanded` (readOnly) + `RatingButtons` + progress bar. One story at a time. |
| `src/app/components/letters/letter-review-screen.tsx` | Prediction summary + preview link + Seal & Send. |
| `src/app/components/letters/letter-seal-confirmation.tsx` | "Letter Sealed" ceremonial screen. |
| `src/app/pages/letter-preview-page.tsx` | Route: `/letter/:docId/preview`. Reads doc stories, transforms to snapshot shape, renders reading flow in non-persisting preview mode. |

#### Files to Modify

| File | Change |
|------|--------|
| `src/app/components/partners/live-story-card-expanded.tsx` | Add `readOnly?: boolean` prop. When true: `defaultExpanded=true`, hide `PositionButtons`, hide story CTA, hide "N points" toggle (always expanded). ~15 lines changed. |
| `src/app/pages/letter-compose-page.tsx` | **Major rewrite.** Remove `ModeStep`, `PredictionsStep`, `PreviewStep`, `SealStep` wizard components. Replace with orchestrator that sequences: receiver modal result → `LetterPredictionWalk` → `LetterReviewScreen` → seal → `LetterSealConfirmation`. Keep `handleSeal` logic, `handleEmailChange` (moves to modal), doc/stories fetch. |
| `src/app/pages/doc-detail-page.tsx` | Replace `<Link to="/letter/.../compose">` with `onClick` handler that opens `LetterReceiverModal`. Add modal state + import. ~10 lines changed. |
| `src/App.tsx` | Add route: `/letter/:docId/preview` → `LetterPreviewPage`. ~8 lines added. |
| `src/app/components/letters/letter-story-reader.tsx` | Add optional `previewMode?: boolean` prop. When true: `onRatingSubmit` writes to local state only (no DB call), `onPositionSubmit` writes to local state only. ~5 lines changed. |

## Test Coverage Strategy

**What's Tested:**
- ✅ Receiver modal opens from doc page (E2E) — entry point change is the most visible UX shift
- ✅ Mode selector + email input in modal (E2E) — validates receiver setup preserves P581 behavior
- ✅ Private doc restricts 1-to-many mode (E2E) — regression on D45
- ✅ Sequential prediction walk: one story at a time (E2E) — core redesign behavior
- ✅ LiveStoryCardExpanded visible in prediction walk (E2E) — validates component reuse
- ✅ Prediction prompt contains receiver name (E2E) — personalization from /live
- ✅ RatingButtons interactive during prediction (E2E) — reuse validation
- ✅ Story progression via "Next Story" (E2E) — sequential flow works
- ✅ Review screen shows predictions + preview link + Seal & Send (E2E) — post-prediction state
- ✅ Seal creates letter + shows "Letter Sealed" confirmation (E2E) — seal behavior unchanged
- ✅ Preview route loads with banner (E2E) — new route works
- ✅ Preview ratings don't persist to DB (E2E) — data protection
- ✅ Existing reading + completion tests still pass (regression) — P581 reading side untouched

**What's NOT Tested (rationale):**
- ❌ Unit tests for `docStoryToStoryWithPoints` adapter — simple mechanical mapping, covered by E2E
- ❌ Multi-receiver sequential walks — requires complex multi-email setup, covered by UAT-5.1
- ❌ `readOnly` prop on LiveStoryCardExpanded — prop addition tested indirectly by E2E (card visible, no position buttons)
- ❌ Integration tests — no new DB schema, existing RLS unchanged, seal RPC unchanged

**Test Pyramid:**
```
       /\
      /  \     2 E2E test files (16 composition + 5 preview)
     /    \
    /______\
   / 0 INT  \  (no schema changes)
  /__________\
 / 0 UNIT     \ (mechanical adapters only)
```

**Files generated:**
- `e2e/p581-letter-composition.spec.ts` — rewritten for P661 flow (16 tests)
- `e2e/p661-letter-preview.spec.ts` — new preview route tests (5 tests)
- `features/uat/p661.md` — 12 UAT scenarios across 6 categories

**Total:** 21 automated tests + 12 UAT scenarios
