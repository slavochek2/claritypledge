---
status: all-done
type: change-request
rank: 1000066
changes: p661
chain_root: p581
tags:
  - redesign
  - p661
  - letters
  - preview
  - chrome-free
created_date: 2026-04-06T00:00:00.000Z
delivery_stage: fix
pipeline_ran:
  - change-request
  - architect
  - generate-tests
  - dev
  - fix
uat_file: features/uat/p665.md
test_files:
  - e2e/p665-letter-immersive.spec.ts
  - e2e/a11y/p665-accessibility.spec.ts
locked_at: '2026-04-20T09:56:03.061Z'
---

# P665: Letter Routes — Chrome-Free + Preview Reuses Reading Components

> **Redesign of:** [P661: Letter Composition — Sender Walks Receiver's Reading Flow](../../archive/p661_letter_composition_ux_redesign.md)
> **Chain root:** [P581: Letters with Comprehension Assessment](./p581_letters_with_comprehension_assessment.md)
> **Sibling CR:** [P651: Letter Recipient Onboarding](p651_letter_recipient_onboarding_redesign.md) (different surface — recipient auth, not chrome/preview)
> **What was wrong:** P661 AD5 specifies the preview route should "render `LetterStoryReader` + `LetterProgressBar` in non-persisting mode" so "the sender sees the exact same components, layout, and pacing the receiver will see." The implementation diverged — `letter-preview-page.tsx` uses `LiveStoryCardExpanded` + `RatingButtons` directly, creating a parallel UI that doesn't match the actual reading flow. Additionally, neither the preview nor reading routes strip app chrome (top nav, bottom nav) — the recipient sees the full ClarityPledge navigation bar during what should be an immersive, focused reading experience.

## Operating Mode

> This spec is an **incremental correction** to P661, not a greenfield design.
> The predecessor spec is **read-only shipped history** — do not recommend edits to it.
> Your job at every pipeline stage is to **implement the delta** described below.
> Settled decisions from P661 and P581 are not up for re-examination.

## Problem Statement

Two failures in the current letter preview and reading experience:

**1. Preview doesn't match reading (component divergence).** P661 AD5 explicitly chose `/letter/:docId/preview` as a route that "renders the reading flow components with doc stories transformed to snapshot shape client-side via `docStoryToStoryWithPoints()`. No letter row needed — `LetterStoryReader` receives data as props regardless of source." The implementation instead builds a parallel UI with `LiveStoryCardExpanded` + `RatingButtons` + hand-rolled navigation. The sender previews something different from what the receiver sees.

**User harm:** The preview banner says "The receiver will see this" — but they won't. Different components, different layout, different interaction patterns. False confidence about what was sent.

**2. App chrome shows on letter routes (immersion failure).** Both `/letter/:docId/preview` and `/letter/:id` (reading) are wrapped in `ClarityLandingLayout`, which renders `SimpleNavigation` (top nav with Home/Letters/Events/My Profile) on every page. The bottom nav hides correctly via `focusRoutes`, but the top nav has no equivalent gating. The recipient arriving via email link sees ClarityPledge navigation chrome before they've even opened the letter — breaking the ritual framing (D6).

**User harm:** Navigation chrome invites the recipient to browse away before engaging with the letter. It signals "this is an app page" not "this is a personal letter someone sent you."

## Jobs To Be Done

- **Preserved from P661/P581:** All jobs unchanged — prediction walk, preview, reading ritual, gap reveal, completion summary
- **Corrected:** "As a letter sender, I want to experience what the receiver will see before sending" — P661 specifies this but the implementation doesn't deliver it (different components in preview vs reading)
- **New:** "As a letter recipient, I want to read the letter without distraction, in an experience that feels personal, not like an app page I wandered onto" — this job was implicit in the ritual design language (D6) but never explicitly required for letter routes

## Current State

**Preview page** (`/letter/:docId/preview`):
- Full ClarityPledge top nav bar (Home, Letters, Events, My Profile, Start a Clarity S...)
- Amber preview banner
- Story rendered via `LiveStoryCardExpanded` (NOT `LetterStoryReader`)
- Rating via `RatingButtons` directly (NOT through `LetterStoryReader`)
- "Back to composition" link (left) and "End of preview" plain text (right) at bottom
- No `FocusHeader`, no `CertificatePageShell`, no parchment background

**Reading page** (`/letter/:id`):
- Full ClarityPledge top nav bar (same chrome)
- Uses `CertificatePageShell` with parchment background
- Cover → reading (via `LetterStoryReader` + `useLetterReadingState`) → completion
- `FocusHeader` with "Leave letter" back button
- Bottom nav correctly hidden (via `focusRoutes`)

```
BEFORE — Preview (/letter/:docId/preview):
┌─────────────────────────────────────────┐
│ 🔵 ClarityPledge  Home Letters Events MyProfile │  ← top nav (WRONG)
├─────────────────────────────────────────┤
│ ⚠ THIS IS A PREVIEW — The receiver...  │  ← preview banner
│                                         │
│  ████████████████░░░░  Story 4 of 4     │
│  ┌─────────────────────────────────┐    │
│  │ LiveStoryCardExpanded           │    │  ← WRONG component
│  │ (not LetterStoryReader)         │    │
│  └─────────────────────────────────┘    │
│  "How well do you believe..."           │
│  [0][1][2][3][4][5][6][7][8][9][10]     │  ← RatingButtons directly
│                                         │
│  Back to composition    End of preview  │  ← confusing exit UX
└─────────────────────────────────────────┘

BEFORE — Reading (/letter/:id):
┌─────────────────────────────────────────┐
│ 🔵 ClarityPledge  Home Letters Events MyProfile │  ← top nav (WRONG)
├─────────────────────────────────────────┤
│ ← Leave letter                          │  ← FocusHeader
│                                         │
│  LetterStoryReader                      │  ← correct component
│  (CertificatePageShell + parchment)     │
│                                         │
└─────────────────────────────────────────┘
```

## Root Cause

**Component divergence:** `letter-preview-page.tsx` was implemented as a standalone 139-line page that imports `LiveStoryCardExpanded` and `RatingButtons` directly rather than reusing `LetterStoryReader` as AD5 specified. The `previewMode?: boolean` prop planned for `LetterStoryReader` was never added.

Code: `src/app/pages/letter-preview-page.tsx:98-113` — renders `LiveStoryCardExpanded` + `RatingButtons` inline instead of `LetterStoryReader`.

**Chrome leak:** All letter routes (`/letter/:docId/preview`, `/letter/:docId/compose`, `/letter/:id`, `/letter/:id/results`) are wrapped in `ClarityLandingLayout` in `App.tsx:637-666`. This layout always renders `SimpleNavigation` (top nav). The bottom nav has `focusRoutes` gating for `/letter/` prefixes, but `SimpleNavigation` has no equivalent. No "chrome-free layout" or "immersive layout" exists.

Code: `src/App.tsx:637-666` — all letter routes wrapped in `ClarityLandingLayout`.
Code: `src/app/layouts/clarity-landing-layout.tsx:62-63` — `SimpleNavigation` renders unconditionally (except embed mode).

## Redesign

**1. Preview reuses reading components:** Rewrite `letter-preview-page.tsx` to render `LetterStoryReader` (with a new `previewMode` prop) inside `CertificatePageShell` with parchment — exactly matching the reading page's visual and interactive experience. Preview mode: ratings interactive but local-only (no DB writes), no position submissions, no verification rows.

**2. Chrome-free letter routes:** Create a minimal layout wrapper (or route-level opt-out) that strips top nav from letter routes. The recipient should see only: preview banner (if preview) or FocusHeader (if reading) → letter content → nothing else until completion.

```
AFTER — Preview (/letter/:docId/preview):
┌─────────────────────────────────────────┐
│ ⚠ THIS IS A PREVIEW — The receiver...  │  ← preview banner (top)
│                                         │
│  ████████████████░░░░  Story 4 of 4     │
│  ┌─────────────────────────────────┐    │
│  │ LetterStoryReader               │    │  ← SAME as reading
│  │ (CertificatePageShell+parchment)│    │
│  └─────────────────────────────────┘    │
│                                         │
│ ← Back to composition                   │  ← FocusHeader or clear link
└─────────────────────────────────────────┘
  NO top nav. NO bottom nav.

AFTER — Reading (/letter/:id):
┌─────────────────────────────────────────┐
│ ← Leave letter                          │  ← FocusHeader (top)
│                                         │
│  LetterStoryReader                      │  ← unchanged
│  (CertificatePageShell + parchment)     │
│                                         │
└─────────────────────────────────────────┘
  NO top nav. NO bottom nav.
```

## Predecessor Sections Superseded

| Section | P661 said | Status | Replaced by |
|---------|-----------|--------|-------------|
| AD5 implementation | "renders `LetterStoryReader` + `LetterProgressBar` in non-persisting mode" | Superseded (implementation diverged) | This spec corrects the implementation to match AD5's intent |
| Files to Modify: `letter-story-reader.tsx` | "Add optional `previewMode?: boolean` prop" | Superseded (never implemented) | This spec implements the planned `previewMode` prop |
| Files to Create: `letter-preview-page.tsx` | "Reads doc stories, transforms to snapshot shape, renders reading flow in non-persisting preview mode" | Superseded (implementation diverged) | This spec rewrites the preview page |
| AC: "Preview as [Name]" | "renders exact receiver reading flow with preview banner" | Superseded (not delivered) | This spec delivers what was promised |
| AC: "Composition and reading share the same story display component" | "(no parallel UI)" | Superseded (parallel UI exists) | This spec eliminates the parallel UI |

No predecessor sections address chrome removal — that is a net-new requirement.

## Requirements

1. **Preview route reuses `LetterStoryReader`** with `previewMode: true` — same component, layout, and pacing as the real reading flow
2. **Preview mode in `LetterStoryReader`:** ratings interactive but write to local state only (no DB calls), no `submitPosition` calls, no `story_verifications` rows created
3. **Chrome-free letter routes:** `/letter/:docId/preview`, `/letter/:id`, `/letter/:id/results` render without `SimpleNavigation` (top nav) or `BottomNav`
4. **Preview exit:** Clear "Back to composition" action (via `FocusHeader` or equivalent), replacing the current confusing dual-link layout
5. **"End of preview" is actionable:** Should be a button/link that returns to composition, not plain text

## What Stays the Same

- **Data model:** No DB changes. Preview still reads doc stories (no delivery/snapshot).
- **Reading flow logic:** `useLetterReadingState` hook unchanged. `LetterStoryReader` internals unchanged except adding `previewMode` prop.
- **Composition flow:** `letter-compose-page.tsx` unchanged — prediction walk, receiver modal, review screen, seal all stay as-is.
- **Letter cover:** `LetterCover` component unchanged.
- **Completion summary:** `LetterCompletionSummary` unchanged.
- **Auth/onboarding (P651):** Recipient auth flow unchanged — the reading page still loads same data; only the layout wrapper changes.
- **Email delivery:** No changes to `letter-emails.ts` or edge functions.
- **Bottom nav:** Already hidden for `/letter/` routes via `focusRoutes` — no change needed.

## Surfaces in Scope

**In scope:**
- `src/app/pages/letter-preview-page.tsx` — rewrite to use `LetterStoryReader`
- `src/app/components/letters/letter-story-reader.tsx` — add `previewMode?: boolean` prop
- `src/App.tsx` — change layout wrapper for letter routes (chrome-free)
- `src/app/layouts/clarity-landing-layout.tsx` — possibly add chrome-free mode, OR create a new minimal layout

**Out of scope:**
- `src/app/pages/letter-reading-page.tsx` — no logic changes (only layout wrapper change in App.tsx)
- `src/app/pages/letter-compose-page.tsx` — no changes
- `src/app/components/letters/letter-cover.tsx` — no changes
- `src/app/components/letters/letter-completion-summary.tsx` — no changes
- `src/app/hooks/useLetterReadingState.ts` — no changes
- `src/app/data/letters-service.ts` — no changes
- P651 recipient onboarding — no changes

## Acceptance Criteria

- [ ] Preview page (`/letter/:docId/preview`) renders `LetterStoryReader` with `previewMode: true` — same visual output as reading page
- [ ] Preview page has parchment background (`CertificatePageShell`)
- [ ] Preview ratings are interactive but do not write to DB
- [ ] Preview page shows no top navigation bar
- [ ] Preview page shows no bottom navigation bar
- [ ] Reading page (`/letter/:id`) shows no top navigation bar
- [ ] Reading page shows no bottom navigation bar (already true — verify not broken)
- [ ] Preview has clear "Back to composition" exit action (not plain text)
- [ ] "End of preview" state has an actionable return-to-composition button
- [ ] Surfaces NOT in scope are visually unchanged (composition, cover, completion)
- [ ] All existing P661 and P581 tests still pass
- [ ] Preview page and reading page show the same story display components (no parallel UI)

## Technical Architecture

### Technical Analysis

**Reuse Inventory** (existing components, hooks, and patterns in the feature area):

| Asset | Path (w2) | Role |
|-------|-----------|------|
| `LetterStoryReader` | `src/app/components/letters/letter-story-reader.tsx` | Phase-driven story reader — anti-point, position-revealed, story, rate, gap-reveal, remaining-points, transition |
| `useLetterReadingState` | `src/app/hooks/useLetterReadingState.ts` | State machine for reading flow — manages phase progression, DB writes (rating, position, prediction reveal) |
| `LetterProgressBar` | `src/app/components/letters/letter-progress-bar.tsx` | Story progress indicator |
| `CertificatePageShell` | `src/app/components/layout/certificate-page-shell.tsx` | Width wrapper with optional parchment background (`bg-[#F5F3EF]`) |
| `FocusHeader` | `src/app/components/layout/focus-header.tsx` | Back button for focus pages — `onBack` + optional `label` |
| `ClarityLandingLayout` | `src/app/layouts/clarity-landing-layout.tsx` | Main layout — renders `SimpleNavigation` + `BottomNav` + footer. Has `?embed=true` mode that strips all chrome |
| `BottomNav` | `src/app/components/layout/bottom-nav.tsx` | Already hides for `/letter/` routes via `focusRoutes` array |
| `SimpleNavigation` | `src/app/components/layout/simple-navigation.tsx` | Top nav — no route-based hiding; renders unconditionally inside `ClarityLandingLayout` |
| `LetterReadingPage` | `src/app/pages/letter-reading-page.tsx` | Reading route — uses `CertificatePageShell parchment` + `LetterStoryReader` via inner `LetterReadingFlow` component |
| `LetterPreviewPage` | `src/app/pages/letter-preview-page.tsx` | Preview route — currently uses `LiveStoryCardExpanded` + `RatingButtons` directly (the divergence this CR fixes) |

**Current data shapes:**
- `LetterStorySnapshot`: `{letter_id, story_id, version_id, position, point_config, visibility}` — used by `LetterStoryReader` which reads `point_config.points[]` and `point_config.storyText`
- `DocStory`: `{doc_id, story_id, position, point_config, created_at, story: StoryWithPoints}` — used by preview page. Shares `point_config` structure with `LetterStorySnapshot`
- `LetterStoryReader` only accesses `snapshot.point_config` (via `getPoints()` and `getStoryText()`) — it never reads `letter_id`, `version_id`, or `visibility`. This means a `DocStory` can be cheaply adapted to the snapshot interface by mapping `point_config` fields.

**Chrome-free pattern precedent:** `ClarityLandingLayout` already has `?embed=true` that returns `<>{children}</>` — stripping all chrome. However, embed mode also strips `LiveSessionProvider`, which provides `useActiveSession` context. Letter routes don't use live session context, so this is safe for letters but not a general solution.

### Architecture Decisions

**Decision 1: Chrome-free via route-aware layout, not embed mode**
- **Chosen:** Add a `chromeFree` prop to `ClarityLandingLayout` that, when true, renders children inside `LiveSessionProvider` but without `SimpleNavigation`, `BottomNav`, footer, or top/bottom padding. In `App.tsx`, letter routes (`/letter/:docId/preview`, `/letter/:id`, `/letter/:id/results`) pass `chromeFree` to `ClarityLandingLayout`.
- **Rationale:** Embed mode (`?embed=true`) is a URL-param escape hatch for third-party iframes — it strips `LiveSessionProvider` and `Toaster`. Letter routes need `Toaster` (error toasts on load failure) and may need `LiveSessionProvider` in the future. A prop-based approach keeps the layout's responsibility (wrapping children with providers) while selectively hiding chrome.
- **Trade-off:** Adds one conditional branch to `ClarityLandingLayout`. Simple, but must not become a bag of mode flags. If a third mode is needed later, extract a layout factory.
- **Alternative rejected:** (A) New `ImmersiveLayout` component — creates a second layout to maintain. Letter routes are the only consumer; YAGNI. (B) Route-based detection inside `ClarityLandingLayout` (check `location.pathname.startsWith('/letter/')`) — couples layout to route knowledge, fragile if routes change. (C) Keep embed mode and add `?embed=true` to letter route elements — loses `LiveSessionProvider` and `Toaster`.

**Decision 2: Preview page reuses `LetterStoryReader` via `previewMode` prop + local state machine**
- **Chosen:** Add `previewMode?: boolean` to `LetterStoryReader`. When true, all callback props (`onPositionSubmit`, `onRatingSubmit`, etc.) still fire, but the caller provides no-op or local-state-only handlers. The preview page creates a lightweight local version of the reading flow (inner `LetterPreviewFlow` component) that:
  1. Converts `DocStory[]` to `LetterStorySnapshot[]` by mapping `{story_id, position, point_config}` and filling `letter_id`/`version_id`/`visibility` with empty/default values (LetterStoryReader never reads them).
  2. Uses `useLetterReadingState` with a synthetic delivery ID (e.g., `preview-{docId}`) — the hook manages phase progression locally. All DB write calls (`submitRating`, `submitPointResponse`, etc.) are intercepted: the preview page passes stub callbacks that update local state without network calls.
- **Rationale:** Reusing `useLetterReadingState` gives identical phase progression (anti-point, position-revealed, story, rate, gap-reveal, remaining-points, transition). Writing a separate state machine would diverge. The hook's DB calls are the only thing that must be stubbed.
- **Trade-off:** `useLetterReadingState` currently calls service functions directly inside itself (not via props). To make it preview-safe, we need to either: (a) add a `previewMode` flag to the hook that skips DB calls, or (b) refactor DB calls out of the hook into callbacks. Option (a) is simpler — one boolean guard per DB call, 5 call sites inside the hook.
- **Alternative rejected:** Building a separate mini state machine for preview — the whole point of this CR is to eliminate parallel implementations. A second state machine would be the same mistake at a different layer.

**Decision 3: `previewMode` flag on `useLetterReadingState` to skip DB writes**
- **Chosen:** Add `previewMode?: boolean` as the 5th parameter to `useLetterReadingState`. When true: `submitRating`, `revealPrediction`, `submitPointResponse`, `updateDeliveryStatus` calls are skipped (replaced with immediate local state updates). SessionStorage persistence still works (keyed by delivery ID — the synthetic `preview-{docId}` key isolates preview state from real reading state).
- **Rationale:** The hook has 5 DB call sites. Wrapping each in `if (!previewMode)` is 5 one-line changes. The phase progression logic (which is the valuable part) stays untouched.
- **Trade-off:** Slightly muddies the hook's single responsibility (it now knows about "preview"). Acceptable because the alternative (extracting all DB calls to callbacks) would be a larger refactor touching `LetterReadingFlow` and every test that uses the hook.
- **Alternative rejected:** Extracting DB calls as injectable callbacks — correct in principle, but 3x the diff for one consumer. Can be done later if a third mode appears.

**Decision 4: Preview page data transformation — DocStory to LetterStorySnapshot**
- **Chosen:** A pure function `docStoryToSnapshot(docStory: DocStory, docId: string): LetterStorySnapshot` that maps `{letter_id: '', story_id: docStory.story_id, version_id: '', position: docStory.position, point_config: docStory.point_config, visibility: 'published'}`. Defined inline in the preview page — no shared utility file needed for one consumer.
- **Rationale:** `LetterStoryReader` only reads `point_config` from the snapshot. The other fields are pass-through identifiers used by the reading page's DB calls (which preview skips). Empty strings are safe because `previewMode: true` ensures no DB call will reference them.

**Decision 5: Preview uses `FocusHeader` for "Back to composition"**
- **Chosen:** Replace the current dual-link footer with `FocusHeader` at the top, label "Back to composition", navigating to `/letter/${docId}/compose`. The preview banner sits above `FocusHeader`. At end-of-preview (transition phase), the "Complete letter" button text changes to "Back to composition" and navigates back.
- **Rationale:** Matches the reading page's `FocusHeader` pattern. Single clear exit, not the confusing "Back to composition (left) / End of preview (right)" layout.
- **UX change from current implementation:** Current preview has navigation buttons (Next Story) at the bottom of each story. With `LetterStoryReader`, navigation is phase-driven (the component shows Continue/Next Story buttons internally). This is intentional — it's the exact reading flow the receiver experiences.

**Decision 6: Compose route keeps `ClarityLandingLayout` with chrome**
- **Chosen:** `/letter/:docId/compose` stays wrapped in `ClarityLandingLayout` with normal chrome (top nav, bottom nav). Only preview, reading, and results routes go chrome-free.
- **Rationale:** Composition is a sender-side editing flow. The sender is a logged-in user navigating the app — chrome helps them navigate. Preview/reading/results are immersive experiences (ritual framing for receiver, faithful preview for sender).

### Security Review

**RLS Policies:**
- No new RLS policies needed. Preview reads doc stories via `docsService.getDoc()` which already requires the authenticated sender to own the doc. No new DB tables or rows.
- `previewMode` in `useLetterReadingState` skips all DB write calls — no risk of phantom `story_verifications`, `story_positions`, or `letter_delivery` status updates from preview.

**Authentication:**
- Preview route (`/letter/:docId/preview`) is sender-only — requires authentication (same as current). No auth change.
- Reading route (`/letter/:id`) supports both authenticated and token-based anonymous access — unchanged.
- Chrome-free layout does not affect auth. `AuthProvider` wraps the entire router, not the layout.

**Input Validation:**
- No new user input. The `previewMode` flag is set by the component tree (not URL params), preventing client manipulation.
- Synthetic delivery ID (`preview-{docId}`) is used only for sessionStorage key — never sent to the server.

**Data Protection:**
- No new data exposure. Preview shows the same stories the sender already created.
- No PII changes. Chrome removal does not affect what data is rendered.

### Implementation Approach

#### Build Sequence

1. **Add `chromeFree` prop to `ClarityLandingLayout`** — when true, render children inside `LiveSessionProvider` with `Toaster` but without `SimpleNavigation`, `BottomNav`, footer, padding classes
2. **Update `App.tsx` letter routes** — pass `chromeFree` to `ClarityLandingLayout` for `/letter/:docId/preview`, `/letter/:id`, `/letter/:id/results`
3. **Add `previewMode` to `useLetterReadingState`** — guard 5 DB call sites with `if (!previewMode)`, use immediate local state updates instead
4. **Add `previewMode` prop to `LetterStoryReader`** — currently unused by the component itself (it only affects display of auth-gated UI like "Sign in to continue"), but forward-declared for downstream use. In preview mode, `isAuthenticated` is always `true` (sender is always authenticated) so the sign-in prompt never shows.
5. **Rewrite `letter-preview-page.tsx`** — replace `LiveStoryCardExpanded` + `RatingButtons` with `CertificatePageShell parchment` + `FocusHeader` + `LetterProgressBar` + `LetterStoryReader`. Add `docStoryToSnapshot()` transform. Create inner `LetterPreviewFlow` component mirroring `LetterReadingFlow` but with `previewMode: true` on the hook, and preview-specific completion behavior (back to composition, not letter completion summary).
6. **Verify** — all existing P581/P661 tests pass, preview shows identical layout to reading

#### Files to Modify

1. **`src/app/layouts/clarity-landing-layout.tsx`** — add `chromeFree?: boolean` prop. When true, render minimal shell: `LiveSessionProvider` + `Toaster` + children, no nav/footer/padding.
2. **`src/App.tsx`** (~lines 622-666) — change letter route wrappers from `<ClarityLandingLayout>` to `<ClarityLandingLayout chromeFree>` for preview, reading, and results routes. Compose route stays unchanged.
3. **`src/app/hooks/useLetterReadingState.ts`** — add `previewMode?: boolean` parameter. Guard `submitRating()`, `revealPrediction()` / `revealPredictionByToken()`, `submitPointResponse()` / `submitPointResponseByToken()`, `submitRatingByToken()`, and `updateDeliveryStatus()` / `updateDeliveryStatusByToken()` calls with `if (!previewMode)`.
4. **`src/app/components/letters/letter-story-reader.tsx`** — add `previewMode?: boolean` to `StoryReaderProps`. No behavioral change in the component itself (auth gating handled by caller passing `isAuthenticated: true`), but the prop is declared for forward compatibility and documentation.
5. **`src/app/pages/letter-preview-page.tsx`** — full rewrite. Replace 139-line `LiveStoryCardExpanded`-based page with `CertificatePageShell` + `FocusHeader` + `LetterStoryReader`-based page using `useLetterReadingState` in preview mode.

#### Files to Create

None. All changes are modifications to existing files.

**No database migrations needed.**

## Test Coverage Strategy

**Generated:** 2026-04-06
**Feature:** P665 Letter Routes — Chrome-Free + Preview Reuses Reading Components

---

### What's Tested (and Why)

**E2E Tests (12 acceptance criteria):**
- AC1: Preview uses `LetterStoryReader` (not `LiveStoryCardExpanded`) — core requirement, eliminates parallel UI
- AC2: Preview has parchment background (`CertificatePageShell`) — visual parity with reading
- AC3: Preview ratings are interactive but do not write to DB — `previewMode` correctness
- AC4-AC5: Preview page has no top/bottom navigation — chrome-free layout
- AC6-AC7: Reading page has no top/bottom navigation — chrome-free layout
- AC8: "Back to composition" is a clickable action — exit UX
- AC9: End of preview has actionable return button — exit UX
- AC10: Composition page not affected by chrome-free changes — regression guard
- AC11: Preview still loads and shows banner — P661 regression
- AC12: Preview and reading use same component structure — no parallel UI verification
- **Why:** All ACs are UI behavior changes best verified through E2E user flows

**Smoke Tests:**
- Preview route loads without console errors
- Non-letter routes still have top nav (regression guard against over-broad chrome stripping)
- **Why:** Fast regression detection; layout wrapper changes could silently break other routes

**Accessibility Tests:**
- "Back to composition" is keyboard accessible
- No orphaned focus trap after top nav removal
- **Why:** Removing top nav changes the tab order; keyboard users must still navigate the page

**UAT Scenarios (8 manual tests):**
- 3 preview component reuse tests (visual comparison with reading page)
- 3 chrome-free layout tests (top/bottom nav absence)
- 2 exit action tests (clickability and navigation)
- **Why:** Visual parity and "feel" require human eyes; automated tests verify structure, not ritual quality

---

### What's NOT Tested (Rationale)

**Unit tests:**
- `docStoryToSnapshot()` — pure mapper, 5-field assignment. Covered by E2E (if transform is wrong, reader won't render). Not worth a dedicated unit test.
- `previewMode` flag on `useLetterReadingState` — state machine progression tested via E2E. The flag guards DB calls; AC3 verifies no DB writes occur.
- **Rationale:** No new complex business logic. Changes are integration points (layout wrappers, prop threading), not algorithms.

**Integration tests (DB migration):**
- N/A — no database changes in this spec.

**Component tests:**
- `LetterStoryReader` with `previewMode` prop — the prop is currently forward-declared only; the component itself has no conditional behavior based on it.
- **Rationale:** Covered by E2E tests that verify the full preview flow renders correctly.

**Letter reading page deep flow:**
- Token exchange, 1-to-1 auth, OTP fallback — unchanged by this CR. Existing P581 tests cover these paths.
- **Rationale:** This spec only changes the layout wrapper (chrome removal); reading logic is untouched.

---

### Test Pyramid Breakdown

```
     /\
    /  \   12 E2E tests (all ACs)
   /____\
  /      \
 / 2 SMOKE \ 2 smoke tests (route health)
/____________\
/ 2 A11Y      \ 2 accessibility tests
/______________\
```

**Total:** 16 automated tests + 8 UAT scenarios
**Estimated run time:** ~45 seconds (E2E: 35s, smoke: 5s, a11y: 5s)

---

### Files Generated

1. `e2e/p665-letter-immersive.spec.ts` — E2E tests (12 tests, all acceptance criteria)
2. `e2e/p665-smoke.spec.ts` — Smoke tests (2 tests)
3. `e2e/a11y/p665-accessibility.spec.ts` — Accessibility tests (2 tests)
4. `features/uat/p665.md` — UAT scenarios (8 tests)

---

### Next Steps

P665 has 2 implementation layers (layout wrapper + component rewrite) and a 6-step build sequence — this is a **simple feature**. Recommended: `/dev features/p665_letter_immersive_preview_reuse.md`.
