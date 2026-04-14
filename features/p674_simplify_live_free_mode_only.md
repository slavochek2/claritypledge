---
status: rejected
type: task
rank: 1
severity: high
date_reported: '2026-04-07'
created_date: 2026-04-07T00:00:00.000Z
delivery_stage: decompose
pipeline_ran: [challenge-prd, architect, generate-tests, spec-review, decompose]
uat_file: features/uat/p674.md
test_files:
  - src/tests/live-state-guard.test.ts
  - e2e/integration/p674-live-state-machine.spec.ts
  - e2e/p674-linear-flow.spec.ts
tags:
  - live
  - realtime
  - refactor
---

> Rejected 2026-04-14 — failed attempt, not pursued.

# P674: Simplify /live — Merge Guided+Free Into Single Linear Flow

## Problem

The /live state layer has 40+ JSONB fields, 25 useRefs, 20 useStates, 3 sync paths (Realtime + polling + optimistic), and two mode branches (guided + free). Bug fixes cascade — P671's one-line phase guard failed because it guarded 1 field out of 40. Every fix in this architecture risks introducing new race conditions.

**P671 root cause (confirmed):** During sealed bid submission, a stale Realtime echo from the first submitter's write arrives carrying `responderSubmitted: false`. The phase guard only checks `ratingPhase` regression — same phase (`waiting → waiting`) passes the guard, so the stale echo clobbers the submission flag back to `false`. The listener sees the rating question again. This bug exists because the Realtime handler applies field-by-field updates without monotonic protection across the full state.

Root cause of architectural complexity: incremental feature additions (25+ P-numbers) expanded the state surface without simplifying it. The guided/free mode split doubles the code paths. The mode switcher (P672) would add more.

## Appetite

High blast radius (merges two code paths into one and rewrites the Realtime guard logic) but **reversible** — the old code exists in git. Rollback caveat: sessions created with the new JSONB shape would need migration back; old fields should be left as dead weight rather than deleted during the transition period. Decision density is low: the flow is well-understood, the cut list is clear. The risk is regression in the remaining features, mitigated by the existing E2E test infrastructure.

## Solution

Merge the best parts of guided mode (sealed bid, reveal, paraphrase, re-rate) and free mode (sliders for convergence) into a single linear flow. This is NOT a pure free-mode promotion — the current free mode assumes guided mode bootstrapped the session (initial slider values come from guided round). The new flow is a merge-and-simplify that takes the sealed bid entry from guided and the slider convergence from free, with a new Realtime guard design that prevents P671-class bugs.

### Implementation Strategy

**Promote, don't rewrite.** Start by deleting guided-mode-only code paths. The free mode flow already works — extend its entry point to include the sealed bid and paraphrase steps directly, rather than requiring a guided round first.

### What Gets Cut

- **Guided-only code paths** — the `ratingPhase` state machine's 6-phase branching, checker/responder/prover role logic, `checkerSubmitted`/`responderSubmitted` flags, `freeRerating` (replaced by `speakerReRating`)
- **Mode switcher** — `sessionMode`, `roleSwitchNegotiation`, P672 becomes unnecessary
- **In-session history display** — `live-content-cards.tsx` (603 lines). Session history exists as a separate page; no need to show it during /live
- **Dual mode branching** in `live-mode-view.tsx` — the 8-branch if-tree collapses to a single linear path

### What Stays

- Session create/join
- Story selection (with or without story)
- Position tracking on story points (live, bidirectional)
- Speak freely, back, decline — escape hatches
- Recording/transcription infrastructure
- Partner departure detection + grace period
- Celebration with dual-ack

### The Flow

**Idle screen:** Two actions — pick story, or tap "speak."

**Role assignment:** Whoever taps "speak" or selects a story first becomes the speaker. The other is the listener.

**Round (single linear path, no branching):**

```
IDLE
  ↓  (speaker taps "speak" or selects story)
RATING (both enter simultaneously)
  │
  ├─ Listener: rates own confidence (sealed bid)
  │   • Can expand story card, see points
  │   • Can place/change positions on story points
  │   • Can see partner's positions live
  │
  ├─ Speaker: rates belief in listener's understanding (sealed bid)
  │   • Same story/position functionality as listener
  │
  ├─ WAITING: if one submitted before the other
  │
  ↓  (both submitted)
REVEAL — show the gap between the two ratings
  ↓
PARAPHRASE
  │  Speaker waits
  │  Listener taps "Explain back" → sets `explainBackStarted: true`
  │  Listener paraphrases (outside app) → taps "I'm done" → sets `explainBackDone: true`
  │  Speaker re-rates (rating #3 — post-paraphrase belief) → sets `speakerReRating: N`
  ↓
SLIDERS — both adjust live until 10/10 convergence
  │  • Slider values initialize from ratings
  │  • Both see partner's slider position in real-time
  │  • 10/10 hold for 2 seconds triggers success
  ↓
CELEBRATION — both acknowledge (dual-ack) → back to IDLE
```

**Story/position functionality persists throughout the entire round** — from RATING through CELEBRATION, both participants can expand stories, view points, see partner positions, and change their own positions.

**Escape hatches available throughout:** speak freely (exits round), back, decline.

### State Surface (Target)

The simplified `liveState` JSONB should contain approximately:

- `currentRound` — round counter
- `speakerIsCreator` — role assignment (replaces checkerIsCreator/checkerName/proverName)
- `ratingA` / `ratingB` — sealed bid values (replaces checkerRating/responderRating)
- `ratingASubmitted` / `ratingBSubmitted` — submission flags
- `speakerReRating` — post-paraphrase rating (#3)
- `explainBackStarted` / `explainBackDone` — paraphrase phase tracking
- `sliderCreator` / `sliderJoiner` — live slider values
- `phase` — single enum: `idle | rating | waiting | revealed | paraphrase | sliders | celebration`
- `celebrationAckedCreator` / `celebrationAckedJoiner` — dual-ack
- `selectedStoryId` / `selectedPointId` — story selection
- `positionsCreator` / `positionsJoiner` — point positions
- `skippedBy` / `ratingInitiatedBy` — escape hatch tracking
- `sessionHistory` — round history array (preserved for sessions history page, not displayed inline)
- `sessionEnded` / `sessionEndedAt` — sign-out cleanup flags (written by `AuthContext.tsx`)
- `checksCount` — round counter (existing, preserved)

~25 fields (down from 40+). Single phase enum (down from 6 phases + mode + freePhase).

### Field Mapping (Old → New)

| Old Field | New Field | Notes |
|-----------|-----------|-------|
| `ratingPhase` | `phase` | Single enum replaces both `ratingPhase` + `freePhase` |
| `freePhase` | `phase` | Absorbed into single `phase` enum |
| `sessionMode` | _(deleted)_ | No mode branching |
| `checkerIsCreator` | `speakerIsCreator` | Role rename |
| `checkerName` / `proverName` | _(deleted)_ | Derived from `speakerIsCreator` + session data |
| `checkerRating` | `ratingA` | Sealed bid value |
| `responderRating` | `ratingB` | Sealed bid value |
| `checkerSubmitted` | `ratingASubmitted` | Submission flag |
| `responderSubmitted` | `ratingBSubmitted` | Submission flag |
| `freeRerating` | `speakerReRating` | Post-paraphrase rating (#3) |
| `freeSliderCreator` | `sliderCreator` | Slider value |
| `freeSliderJoiner` | `sliderJoiner` | Slider value |
| `celebrationAcknowledgedByCreator` | `celebrationAckedCreator` | Shortened |
| `celebrationAcknowledgedByJoiner` | `celebrationAckedJoiner` | Shortened |
| `livePositions.creator` | `positionsCreator` | Top-level for concurrent writes |
| `livePositions.joiner` | `positionsJoiner` | Top-level for concurrent writes |
| `clarificationPhase` | _(deleted)_ | Guided-only |
| `roleSwitchNegotiation` | _(deleted)_ | Mode switcher removed |
| `perspectiveRequestedBy` | _(deleted)_ | Guided-only |
| `explainBackRound` | _(deleted)_ | Single paraphrase step, no loop |
| `explainBackRatings` | _(deleted)_ | Single paraphrase step, no loop |
| `sessionHistory` | `sessionHistory` | Preserved (not displayed inline, used by sessions page) |
| `sessionEnded` / `sessionEndedAt` | `sessionEnded` / `sessionEndedAt` | Preserved (AuthContext sign-out cleanup) |
| `checksCount` | `checksCount` | Preserved |

### Monotonic State Guard (P671 Fix)

**The core architectural requirement.** The Realtime handler must reject any incoming state update that would regress any field. The rule:

1. If incoming `phase` is behind local `phase` → drop entire event (exception: `idle` reset after celebration)
2. If incoming `phase` equals local `phase` → never regress boolean flags from `true` to `false` (e.g., `ratingASubmitted: true → false` is always rejected)
3. The drift poll applies the same guard — no bypass path

This is what P671's fix attempted with `isPhaseRegression` but failed because it only guarded the phase field. The new design guards the **entire state update** as a unit.

**Why this works with ~20 fields but didn't with 40+:** Fewer fields means fewer things to guard. A single monotonic `phase` enum means "is this event stale?" has one canonical answer, not a matrix of field-by-field checks.

## Risks / Non-Goals

- **Risk:** Regression in story selection or position tracking — these features thread through the round and touch multiple components
- **Risk:** Existing E2E tests assume guided mode flow — tests need rewriting (14+ test files reference guided/free mode concepts)
- **Risk:** Free mode entry currently assumes guided mode bootstrapped the session — must audit and rework entry point
- **Non-goal:** Changing the session create/join flow
- **Non-goal:** Changing the recording/transcription infrastructure
- **Non-goal:** 1-to-many support (future concern, don't design for it but don't hardcode 2-party deeper)
- **Non-goal:** Decomposing `clarity-live-page.tsx` into smaller files (valuable but separate scope — track as follow-up)

## Done-When

- [ ] Guided mode code paths removed from `clarity-live-page.tsx` and `live-mode-view.tsx`
- [ ] Mode switcher removed (P672 closed as won't-fix)
- [ ] In-session history display removed
- [ ] Single linear flow works: idle → rating → waiting → reveal → paraphrase → sliders → celebration → idle
- [ ] Story selection and position tracking work throughout the round
- [ ] Escape hatches (speak freely, back, decline) work at each phase
- [ ] Existing verification write fires with post-paraphrase re-rating (#3) as `speaker_rating` in `story_verifications` (calibration data source fix included — see below)
- [ ] `liveState` JSONB reduced to ~20 fields (old fields left as dead weight, not deleted — rollback safety)
- [ ] E2E tests rewritten for new flow (14+ files affected)
- [ ] P671 closed — root cause addressed by monotonic state guard design
- [ ] P672 closed as won't-fix (mode switcher removed)
- [ ] Specific race condition scenarios verified in E2E:
  - [ ] Simultaneous rating submission (both submit within <100ms)
  - [ ] Simultaneous celebration acknowledgment
  - [ ] Partner disconnect during reveal phase
  - [ ] Stale Realtime echo after rating submission (the P671 scenario)

## Calibration Data Source Fix (Included)

`writeVerification` currently stores the sealed-bid value (rating #2) as `speaker_rating`. The post-paraphrase re-rating (#3) is more accurate — the speaker's assessment *after hearing the paraphrase*. Since we're rewriting `writeVerification` anyway, this spec includes the fix: `speakerReRating` writes to `speaker_rating` in `story_verifications`. This changes calibration scores for future sessions; historical data retains the old values.

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd | [BLOCK] Spec describes "new flow" but it's the existing free mode | Reframed as merge-and-simplify: sealed bid from guided + sliders from free | Free mode can't work standalone — it assumes guided bootstrapped the session |
| 2 | /challenge-prd | [BLOCK] "Two-browser manual QA confirms no race conditions" is unfalsifiable | Replaced with 4 specific race condition E2E scenarios | Race conditions need targeted reproduction, not general "no bugs" assertion |
| 3 | /challenge-prd | [WARN] Calibration fix deferred but rewriting same code path | Included in P674 — 5-line change in a function being rewritten | Deferring means new flow writes wrong rating to profiles |
| 4 | /challenge-prd | [WARN] Rollback cost understated | Added: old JSONB fields left as dead weight, not deleted | Sessions created during new code need compatible schema |
| 5 | /challenge-prd | [WARN] P671 not "won't fix" — sealed bid phase still exists | P671 root cause addressed by monotonic state guard design | The guard must protect full state, not just phase field |

## Technical Architecture

### Technical Analysis

#### Current Code State

The /live feature is implemented across three primary files totaling ~8,000 lines:

| File | Lines | Role |
|------|-------|------|
| `src/app/pages/clarity-live-page.tsx` | 3,872 | Session lifecycle, Realtime subscription, state management, all handlers (133 hooks) |
| `src/app/components/partners/live-mode-view.tsx` | 3,591 | Rendering: idle screen, rating drawer, understanding screen, celebration, mode switcher |
| `src/app/components/partners/live-content-cards.tsx` | 603 | In-session history display (`SessionHistoryList`, `PointCardPreview`) |

Supporting components in `src/app/components/partners/`:

| File | Lines | Role | P674 Impact |
|------|-------|------|-------------|
| `free-mode-view.tsx` | 268 | Unlocked slider phase + success screen | Promotes to primary flow |
| `free-mode-success.tsx` | 144 | Celebration/success screen for free mode | Becomes the single celebration screen |
| `round-summary-screen.tsx` | 107 | Post-round summary display | Stays (round history) |
| `shared.tsx` | 62 | `getFirstName()`, `RatingButtons` | Stays unchanged |
| `slider-track.tsx` | — | Slider component for free mode | Stays unchanged |
| `live-story-card-expanded.tsx` | — | Story display during round | Stays unchanged |
| `story-search-picker.tsx` | — | Story selection picker | Stays unchanged |
| `live-session-banner.tsx` | — | Recording/privacy banner | Stays unchanged |
| `rating-card.tsx` | — | Rating input (0-10 scale) | Stays unchanged |
| `position-buttons.tsx` | — | Position selection buttons | Stays unchanged |

#### Reuse Inventory

**Types** (`src/app/types/index.ts`):
- `LiveSessionState` interface (lines 565-760) — 40+ fields, must be replaced with simplified version
- `RatingPhase` type: `'idle' | 'rating' | 'waiting' | 'revealed' | 'explain-back' | 'results'` — must be replaced with new `Phase` enum
- `FreePhase` type: `'sealed-bid' | 'waiting' | 'reveal' | 'paraphrase' | 'unlocked' | 'success'` — absorbed into new `Phase`
- `SessionMode` type: `'guided' | 'free'` — deleted
- `ClarificationPhase` type — deleted (guided-only feature)
- `FreeRoundRecord` interface — kept for Journey display
- `DEFAULT_LIVE_STATE` constant — must be replaced

**Data layer** (`src/app/data/api.ts`):
- `updateClaritySessionLiveState()` — full overwrite, stays
- `patchClaritySessionLiveState()` — JSONB `||` merge via `patch_live_state` RPC, stays
- `shouldUseFullOverwrite()` — routing logic in `clarity-live-page.tsx`, must be updated for new field names

**Calibration** (`src/app/data/calibration-service-real.ts`):
- `recordVerification()` — accepts `speakerRating` and writes to `speaker_rating` column in `story_verifications`
- Currently called from `writeVerification()` at line 1702 of `clarity-live-page.tsx` with `speakerRating: checkerRating` (sealed-bid value, rating #2)
- Fix: pass `speakerReRating` (post-paraphrase, rating #3) instead

**Realtime handler** (lines 958-1083 of `clarity-live-page.tsx`):
- `subscribeToClaritySession()` callback — no phase regression guard exists today. The `updateInFlightRef` blocks Realtime from overwriting optimistic state, but does NOT guard against stale-echo regressions (the P671 bug)
- Drift poll (lines 1088-1270) — checks specific field diffs to detect server-has-update. Currently checks: `ratingPhase`, `checkerName`, `checkerRating`, `responderRating`, `checkerSubmitted`, `responderSubmitted`, `explainBackDone`, `clarificationPhase`, `celebrationAcknowledgedBy*`, `selectedStoryId`, `selectedStoryData`, `selectedContentTitle`, `checksCount`, `livePositions`, `roleSwitchNegotiation`

**State management patterns** (confirmed from P525, P562, P609 decisions):
- Per-participant top-level JSONB keys for concurrent writes (positions, sliders, celebration booleans)
- `confirmedLiveStateRef` tracks last-known-good state; optimistic writes merge into it
- `updateInFlightRef` blocks Realtime from overwriting during writes, with selective merge for safe per-participant keys

**E2E tests touching guided/free mode concepts** (18 files total):
- `e2e/`: `p562-free-mode.spec.ts`, `p562-smoke.spec.ts`, `p525-celebration-race.spec.ts`, `live-rating-drawer.spec.ts`, `p398-session-history-summary.spec.ts`, `p399-story-persistence.spec.ts`, `p455-live-mobile-layout.spec.ts`, `p469-live-layout-kiss.spec.ts`, `p588-live-layout-sticky-cta.spec.ts`, `p588-smoke.spec.ts`, `a11y/p588-accessibility.spec.ts`
- `e2e/integration/`: `p562-free-mode-state.spec.ts`, `p600-free-mode-rerating.spec.ts`
- `e2e/helpers/`: `test-realtime.ts` (contains `advanceSessionState` with field names)
- `src/tests/`: `p637-drift-detection-completeness.test.ts`, `p609-free-slider-sync.test.ts`, `live-mode-view.test.tsx`, `free-mode-phases.test.ts`, `p525-deadlock-prevention.test.ts`

**Database**:
- `patch_live_state` RPC (`supabase/migrations/20260220130000_patch_live_state_rpc.sql`) — no schema change needed; it operates on raw JSONB
- `story_verifications` table — `speaker_rating` column stays, just receives different source value

#### Current State Machine

Two parallel phase systems exist today:

1. **Guided mode** (`ratingPhase`): `idle → rating → waiting → revealed → explain-back → results` (6 phases) + `clarificationPhase` sub-states + celebration detected via `checkerRating === 10`
2. **Free mode** (`freePhase`): `sealed-bid → waiting → reveal → paraphrase → unlocked → success` (6 phases) — but the first 4 phases actually run via guided mode's `ratingPhase` engine (P562 decision)

The divergence point: `handleCelebrationComplete` in guided mode resets to idle. In free mode, `handleExplainBackDone` transitions to `freePhase: 'unlocked'` instead of continuing the guided explain-back loop.

### Architecture Decisions

#### Decision 1: Single Phase Enum Replaces Both `ratingPhase` and `freePhase`

**Chosen:** New `phase` field with values: `idle | rating | waiting | revealed | paraphrase | sliders | celebration`

**Rationale:** The spec's merged flow is linear — no branching by mode. A single enum means the monotonic guard has one field to check: `phase`. The current two-enum system (`ratingPhase` + `freePhase`) is what makes P671-class bugs possible — the guard checks one enum while the other governs actual UI state.

**Trade-off:** Existing sessions in production will have `ratingPhase`/`freePhase` fields, not `phase`. A migration-period compatibility layer must read old field names and map to new ones for any sessions that survive the deploy window.

**Alternative rejected:** Keep `ratingPhase` and rename values — this preserves the old field name and avoids migration-period ambiguity, but the guided-mode values (`explain-back`, `results`) don't map to the new flow, and having `freePhase` still exist invites confusion.

#### Decision 2: Monotonic State Guard as a Pure Function

**Chosen:** Extract `isStateRegression(incoming, current): boolean` as a pure, tested function. Both the Realtime handler and the drift poll call it before applying any state update.

**Rationale:** P671 failed because the guard was an inline check in the Realtime handler that only guarded `ratingPhase`. A pure function can be unit-tested exhaustively: phase regression, boolean flag regression (`true → false`), and the idle-reset exception.

Guard rules:
1. `incoming.phase` is behind `current.phase` in the enum order → reject (exception: `idle` reset after `celebration` when both acked)
2. `incoming.phase === current.phase` and any boolean flag (`ratingASubmitted`, `ratingBSubmitted`, `explainBackStarted`, `explainBackDone`, `celebrationAckedCreator`, `celebrationAckedJoiner`) regresses from `true` to `false` → reject
3. Drift poll applies identical guard — no bypass path

**Trade-off:** The guard must allow the `celebration → idle` reset, which looks like a regression. The reset is only valid when both celebration ack flags are true in the incoming state. This exception must be explicitly coded and tested.

**Alternative rejected:** Monotonic counter (version number) — simpler conceptually, but requires server-side increment (to prevent both participants from incrementing to the same value). The phase enum order provides the same monotonicity without a round-trip.

#### Decision 3: Rename Role Fields to Speaker/Listener

**Chosen:** Replace `checkerName`/`checkerIsCreator`/`checkerRating`/`responderRating`/`checkerSubmitted`/`responderSubmitted` with `speakerIsCreator`/`ratingA`/`ratingB`/`ratingASubmitted`/`ratingBSubmitted`/`speakerReRating`.

**Rationale:** The checker/responder/prover terminology was confusing and drove bugs (P412, P525). The merged flow has clear roles: speaker (the person who spoke) and listener (the person who listened). Using `ratingA`/`ratingB` avoids baking role semantics into the field name — both submit simultaneously, and the speaker/listener mapping is resolved by `speakerIsCreator`.

**Trade-off:** All 18+ test files reference old field names. The rename is a global find-and-replace but touches many files.

**Alternative rejected:** Keep `checkerRating`/`responderRating` names — saves test churn but perpetuates confusing terminology in a freshly simplified codebase.

#### Decision 4: Delete In-Session History, Keep Session History Page

**Chosen:** Delete `live-content-cards.tsx` (603 lines). The `sessionHistory` field stays in `LiveSessionState` for the separate sessions history page, but the inline history display during /live is removed.

**Rationale:** In-session history was added in P398 but the separate My Sessions page (P405) superseded it. The inline display adds complexity to the idle screen without user value — users don't review past rounds mid-session. Removing it eliminates the `SessionHistoryList` component, the `selectedHistoryIndex` state, and the history-close-on-rating-initiated behavior.

**Trade-off:** Users lose the ability to see past rounds during an active session. This is acceptable because: (1) rounds are short, (2) the session end screen shows all rounds, (3) My Sessions page has full history.

**Alternative rejected:** Keep history but simplify — still requires the component, state management, and Realtime integration for the `sessionHistory` array growth.

#### Decision 5: Preserve `confirmedLiveStateRef` + `updateInFlightRef` Pattern

**Chosen:** Keep the existing optimistic update + in-flight guard pattern. Add the monotonic guard on top.

**Rationale:** The `confirmedLiveStateRef` / `updateInFlightRef` / selective per-participant merge pattern (established in P525, P562, P609) is battle-tested and handles concurrent writes correctly. The monotonic guard is additive — it sits in the Realtime callback before the existing merge logic. No need to redesign the write path.

**Trade-off:** The state management in `clarity-live-page.tsx` remains complex (refs + state + optimistic + guard). But this is inherent complexity from two-party real-time sync, not accidental complexity.

**Alternative rejected:** Move to a reducer pattern (useReducer) — cleaner state transitions but requires rewriting the entire handler chain (~500 lines of callbacks). Risk exceeds benefit for this scope.

#### Decision 6: Guided-Only Code Deletion Strategy

**Chosen:** Delete in phases: (1) mode switcher + `sessionMode` field, (2) `clarificationPhase` sub-states, (3) `roleSwitchNegotiation`, (4) `perspectiveRequestedBy`, (5) `proverName` (Did I get it? flow — the merged flow uses speaker/listener directly), (6) `explainBackRound`/`explainBackRatings` (the new flow has a single paraphrase step, not an iterative loop).

**Rationale:** The guided mode's explain-back loop (rate → explain → re-rate → explain again) is replaced by a single paraphrase step followed by speaker re-rating and then sliders. The loop was valuable for the guided coaching experience but adds 6+ states and 4 handler callbacks. The merged flow's slider convergence replaces the iterative loop.

**Trade-off:** The iterative explain-back loop (multiple rounds of re-rating) is lost. The slider convergence must achieve the same calibration quality. This is a product bet, not a technical trade-off.

**Alternative rejected:** Keep explain-back loop as an optional sub-flow — doubles the state machine complexity, defeating the purpose of simplification.

### Security Review

**RLS Policies:**

- ✅ **`patch_live_state` RPC is participant-scoped.** The SECURITY DEFINER function (fixed in `20260403120100_security_fix_rpc_auth.sql`) restricts writes to `creator_profile_id = auth.uid() OR joiner_profile_id = auth.uid()`. Correctly limits partial JSONB merges to session participants only.

- ✅ **`updateClaritySessionLiveState` (full overwrite path) — eliminated.** Was bypassing participant check. P674 removes the full-overwrite path entirely; all writes go through participant-scoped `patch_live_state` RPC.

- ✅ **`clarity_sessions` SELECT is public** (`USING (true)`). Intentional for join-by-code flow. Session IDs are UUIDs (128-bit random), enumeration risk negligible.

- ✅ **`clarity_sessions` INSERT requires verified users** (P396).

- ⚠️ **Realtime broadcast exposes `live_state` to all subscribers.** Since SELECT is `USING (true)`, sealed-bid values (`ratingA`, `ratingB`) are visible before reveal to any subscriber who knows the session UUID. **Pre-existing issue, not introduced by P674.** Session UUID serves as capability token. Low risk given co-located usage. Future mitigation: store sealed bids in separate rows with participant-scoped SELECT RLS.

**Authentication:**

- ✅ **Session creation requires verified auth** (P396 INSERT policy).
- ✅ **`writeVerification` guards on `user?.id` and `session`** — returns early without auth.
- ✅ **Speaker/listener profile ID resolution uses session data, not user input** — prevents spoofing.
- ✅ **`joiner_profile_id` is set client-side during join.** Anonymous joiners can't write via `patch_live_state` RPC (requires `auth.uid()` match). With full-overwrite path eliminated, this is no longer a bypass vector.

**Input Validation:**

- ✅ **`joiner_name` length constrained** to 100 characters at DB level (P396).
- ⚠️ **`live_state` JSONB has no server-side schema validation.** Both write paths accept arbitrary JSONB. With P674 reducing to ~20 well-defined fields, consider adding a CHECK constraint or validation trigger rejecting unknown top-level keys. Defense-in-depth, not critical — JSONB is only consumed by first-party client.
- ✅ **`phase` enum is client-enforced via TypeScript.** Acceptable for current trust model (both clients are first-party). Monotonic guard is primary enforcement layer.
- ✅ **Rating values** — numbers in JSONB, no SQL injection vector.

**Data Protection:**

- ✅ **No new PII fields introduced.** Renames existing fields, reduces surface.
- ✅ **`is_private` flag preserved.** Private sessions skip audio/events upload.
- ✅ **Old JSONB fields left as dead weight** — rollback safety, no data loss.
- ✅ **Calibration data source fix is forward-only** — historical data retains old values.
- ⚠️ **Sealed-bid values visible in `live_state` before reveal** — pre-existing design choice, acceptable given UUID-as-capability-token model.

**Summary of actionable items:**

1. **[RESOLVED]** Full-overwrite path eliminated. All writes routed through participant-scoped `patch_live_state` RPC.
2. **[LOW]** Consider JSONB schema validation (CHECK constraint) now that field surface is reduced to ~20 fields.
3. **[INFO]** Sealed-bid values readable by anyone who knows session UUID via Realtime. Pre-existing; acceptable.

### Implementation Approach

**Worktree recommended:** High blast radius refactor touching 20+ files across state management, UI components, and E2E tests.

#### Build Sequence

**Phase 1: Type Foundation + Monotonic Guard (test-first)**
1. Define new `Phase` type and simplified `LiveSessionState` interface in `src/app/types/index.ts`
2. Write `isStateRegression()` pure function with comprehensive unit tests (phase ordering, boolean flag regression, idle-reset exception)
3. Write `mapLegacyState()` helper that converts old field names to new ones (migration-period compatibility)

**Phase 2: Data Layer + Security Fix + Calibration Fix**
4. **[Security — resolved]** Eliminate full-overwrite path: remove `updateClaritySessionLiveState()` and `shouldUseFullOverwrite()`. Route ALL writes through `patch_live_state` RPC (participant-scoped JSONB merge). With ~20 clean fields, merge handles everything — no need for full overwrite.
5. Update `writeVerification()` in `clarity-live-page.tsx`: rename parameter from `speakerRating: checkerRating` to `speakerRating: liveState.speakerReRating`. The `speakerReRating` value is set during the paraphrase phase when the speaker re-rates after hearing the listener's explanation (step 11, `handleParaphraseDone`). If `speakerReRating` is null (round ended early via speak freely), fall back to `ratingA` (sealed bid).

**Phase 3: Core State Machine Rewrite**
6. Integrate `isStateRegression()` into the Realtime subscription handler (before existing merge logic)
7. Integrate `isStateRegression()` into the drift poll handler
8. Rewrite `handleRatingSubmit` to use new field names (`ratingA`/`ratingB`, `speakerIsCreator`, `phase`)
9. Rewrite `handleCelebrationComplete` — single path (no guided/free divergence), transitions to `sliders` phase instead of branching
10. Delete guided-only handlers: `handleAskToExplainFirst`, `handleContinueAsListener`, `handleInsistToSpeak`, `handleLetThemSpeak`, `handleCancelNegotiation`, `handleClarifyStart`, `handleClarifyDone`, `handleSharePerspective`
11. Rewrite `handleExplainBackDone` → becomes `handleParaphraseDone` (single step, no loop)
12. Merge `handleFreeRoundComplete` and `handleFreeDiscussAnother` into the main celebration flow

**Phase 4: UI Component Surgery**
13. Rewrite `live-mode-view.tsx` — delete mode branching, `IdleScreen` mode pill, guided-only rendering branches (clarification, role switch negotiation, iterative explain-back). Collapse the 8-branch if-tree to linear phase rendering.
14. Promote `FreeModeView` slider phase into the main rendering path (not gated on `sessionMode`)
15. Delete `live-content-cards.tsx` (in-session history display)
16. Update `free-mode-view.tsx` and `free-mode-success.tsx` for new field names

**Phase 5: Drift Detection + Cleanup**
17. Update drift detection block in `clarity-live-page.tsx` for new field names
18. Update `DEFAULT_LIVE_STATE` constant
19. Clean up deleted refs and state variables from `clarity-live-page.tsx`

**Phase 6: Test Rewrite**
20. Update `p637-drift-detection-completeness.test.ts` — new field list, remove `KNOWN_UNCOVERED` entries for deleted fields
21. Update `p525-deadlock-prevention.test.ts` — `shouldUseFullOverwrite` with new field names
22. Update `free-mode-phases.test.ts` — test new single phase enum
23. Update `p609-free-slider-sync.test.ts` — new field names
24. Update `live-mode-view.test.tsx` — remove guided-mode-specific tests
25. Rewrite E2E tests: `p562-free-mode.spec.ts`, `p562-smoke.spec.ts`, `integration/p562-free-mode-state.spec.ts`, `integration/p600-free-mode-rerating.spec.ts`
26. Update `e2e/helpers/test-realtime.ts` — `advanceSessionState` field names
27. Update layout/smoke E2E tests that reference `ratingPhase` or `sessionMode`: `p455-live-mobile-layout.spec.ts`, `p469-live-layout-kiss.spec.ts`, `p588-*` specs, `live-rating-drawer.spec.ts`, `p398-session-history-summary.spec.ts`, `p399-story-persistence.spec.ts`, `p525-celebration-race.spec.ts`
28. Add new E2E race condition tests per Done-When: simultaneous rating, simultaneous celebration ack, disconnect during reveal, stale echo after submission

#### Files to Create

| File | Purpose |
|------|---------|
| `src/app/pages/live-state-guard.ts` | `isStateRegression()` pure function + `PHASE_ORDER` constant + `mapLegacyState()` |
| `src/tests/live-state-guard.test.ts` | Unit tests for monotonic guard (phase ordering, boolean regression, idle-reset exception) |

#### Files to Modify

| File | Change Summary |
|------|---------------|
| `src/app/types/index.ts` | New `Phase` type, simplified `LiveSessionState`, delete `RatingPhase`/`FreePhase`/`SessionMode`/`ClarificationPhase`, update `DEFAULT_LIVE_STATE` |
| `src/app/pages/clarity-live-page.tsx` | Integrate monotonic guard in Realtime + drift handlers; rewrite all handler callbacks for new fields; delete guided-only handlers (~10 callbacks); fix `writeVerification` to pass `speakerReRating` instead of `checkerRating`; delete `shouldUseFullOverwrite()` and all `updateClaritySessionLiveState()` call sites (route through `patchClaritySessionLiveState` only); delete ~15 refs/states for removed features |
| `src/app/components/partners/live-mode-view.tsx` | Delete mode branching, mode pill, guided-only rendering (clarification, role negotiation, iterative explain-back); collapse to linear phase rendering |
| `src/app/components/partners/live-content-cards.tsx` | Delete file entirely |
| `src/app/components/partners/free-mode-view.tsx` | Update field names (`freeSliderCreator` → `sliderCreator`, `freePhase` removed — phase is now top-level); no longer gated on `sessionMode` |
| `src/app/components/partners/free-mode-success.tsx` | Update field names |
| `src/app/components/partners/round-summary-screen.tsx` | Update field references if any (currently references `checkerRating`/`responderRating`) |
| `src/app/data/api.ts` | Delete `updateClaritySessionLiveState()` (full-overwrite path eliminated per Phase 2 step 4). `patchClaritySessionLiveState()` stays unchanged (raw JSONB merge). |
| `src/auth/AuthContext.tsx` | Verify `patchClaritySessionLiveState(sessionId, { sessionEnded: true, sessionEndedAt: ... })` call is compatible with new `LiveSessionState` type (fields preserved in State Surface). |
| `src/app/components/partners/demo-level-view.tsx` | Check for old field name references (`checkerRating`, `responderRating`, etc.) and update if found |
| `src/tests/p637-drift-detection-completeness.test.ts` | New field list, update `KNOWN_UNCOVERED` |
| `src/tests/p525-deadlock-prevention.test.ts` | Delete `shouldUseFullOverwrite` tests (function removed in Phase 2 step 4); keep any remaining deadlock prevention tests, update field names |
| `src/tests/free-mode-phases.test.ts` | Rewrite for single phase enum |
| `src/tests/p609-free-slider-sync.test.ts` | Update field names |
| `src/tests/live-mode-view.test.tsx` | Remove guided-mode-specific tests |
| `e2e/helpers/test-realtime.ts` | Update `advanceSessionState` field names |
| `e2e/p562-free-mode.spec.ts` | Rewrite for merged flow |
| `e2e/p562-smoke.spec.ts` | Rewrite for merged flow |
| `e2e/integration/p562-free-mode-state.spec.ts` | Rewrite for new field names |
| `e2e/integration/p600-free-mode-rerating.spec.ts` | Rewrite for new field names + calibration fix verification |
| `e2e/p525-celebration-race.spec.ts` | Update field names |
| `e2e/live-rating-drawer.spec.ts` | Update field names |
| `e2e/p398-session-history-summary.spec.ts` | Update field names, remove inline history tests |
| `e2e/p399-story-persistence.spec.ts` | Update field names |
| `e2e/p455-live-mobile-layout.spec.ts` | Update field names |
| `e2e/p469-live-layout-kiss.spec.ts` | Update field names |
| `e2e/p588-live-layout-sticky-cta.spec.ts` | Update field names |
| `e2e/p588-smoke.spec.ts` | Update field names |
| `e2e/a11y/p588-accessibility.spec.ts` | Update field names |

## Test Coverage Strategy

**Files created:**
- Unit tests: `src/tests/live-state-guard.test.ts` (22 tests)
- Integration tests: `e2e/integration/p674-live-state-machine.spec.ts` (7 tests)
- E2E tests: `e2e/p674-linear-flow.spec.ts` (8 tests)
- Smoke tests: `e2e/p674-smoke.spec.ts` (3 tests)
- UAT scenarios: `features/uat/p674.md` (17 scenarios)

**Test Pyramid:**
```
       /\
      /  \    8 E2E tests (two-party flows + race conditions)
     /____\
    / 7 INT \
   /__________\
  / 22 UNIT    \
```

**Total:** 40 automated tests + 17 UAT scenarios

**What's Tested (and WHY):**

- **Monotonic state guard (unit)** — Core architectural fix for P671. The `isStateRegression()` pure function is exhaustively tested: phase ordering (7 phases), boolean flag regression (6 flags), idle-reset exception, and the exact P671 stale-echo scenario. This is the highest-value test because the guard is the single defense against all race-condition bugs.

- **New JSONB field structure (integration)** — Verifies ~20 simplified fields are accepted by the DB, participant-scoped RPC works with new field names, non-participants are rejected, and concurrent per-participant writes (slider convergence) don't collide.

- **Full linear flow (E2E)** — Two-party test covering idle → rating → waiting → reveal → paraphrase → sliders → celebration → idle. Uses `advanceSessionState` to skip multi-step UI flows after verifying entry points via browser interaction.

- **4 race condition scenarios (E2E)** — Directly from Done-When: simultaneous rating submission, simultaneous celebration ack, partner disconnect during reveal, stale Realtime echo after submission. These use parallel RPC patches to simulate near-simultaneous writes.

- **Mode toggle removed (E2E + smoke)** — Verifies Guided/Open mode toggle is gone, in-session history cards are gone.

- **Escape hatches (E2E)** — Speak freely exits from rating and paraphrase phases.

**What's NOT Tested (and WHY):**

- **Accessibility tests** — Not generated. P674 is a simplification/refactor that removes UI components rather than adding new ones. The remaining UI components (sliders, rating cards, buttons) already have accessibility tests from P588.

- **Component unit tests for React components** — Not generated. The rendering changes are deletions (guided-mode branches, mode toggle, in-session history), not new component logic. E2E tests cover the rendered output.

- **`mapLegacyState()` function** — Deferred to implementation. The contract is clear (map old field names to new), but the exact mapping depends on implementation choices in Phase 1. Add to `src/tests/live-state-guard.test.ts` when implemented.

- **Calibration data source fix** — The `writeVerification` change is a 1-line field rename (`checkerRating` → `speakerReRating`). Integration test verifies the JSONB field exists; the actual `story_verifications` write is verified in UAT-5.1 after implementation.

- **18 existing test files requiring field name updates** — Listed in the Architecture section (Files to Modify). These are mechanical find-and-replace renames, not new test logic. They will be updated during `/dev` Phase 6.

**Estimated run time:** ~45 seconds (unit: 2s, integration: 15s, E2E: 25s, smoke: 8s)

## Implementation Tasks

> Generated by /decompose. Each task is scoped to 1–3 files and independently verifiable.
> Run /dev to execute — it will dispatch one subagent per task.

### Task 1: Type foundation — new Phase type + simplified LiveSessionState
- **Files:** `src/app/types/index.ts` (modify)
- **Spec refs:** "Solution > State Surface (lines ~105-154)", "Technical Architecture > Architecture Decisions > Decision 1 (lines ~291-299)", "Technical Architecture > Architecture Decisions > Decision 3 (lines ~316-324)"
- **Tests:** `src/tests/live-state-guard.test.ts`
- **Depends on:** None
- **Verify:** `npx tsc --noEmit` passes; new `Phase` type and `LiveSessionState` interface exported; old types (`RatingPhase`, `FreePhase`, `SessionMode`, `ClarificationPhase`) deleted; `DEFAULT_LIVE_STATE` updated
- [ ] Complete

### Task 2: Monotonic state guard — `isStateRegression()` + `mapLegacyState()`
- **Files:** `src/app/pages/live-state-guard.ts` (create), `src/tests/live-state-guard.test.ts` (modify — add guard tests to generated stubs)
- **Spec refs:** "Solution > Monotonic State Guard (lines ~156-166)", "Technical Architecture > Architecture Decisions > Decision 2 (lines ~301-314)"
- **Tests:** `src/tests/live-state-guard.test.ts`
- **Depends on:** Task 1
- **Verify:** Unit tests pass — phase ordering (7 phases), boolean flag regression (6 flags), idle-reset exception, P671 stale-echo scenario, legacy state mapping
- [ ] Complete

### Task 3: Data layer cleanup — eliminate full-overwrite path
- **Files:** `src/app/data/api.ts` (modify), `src/app/pages/clarity-live-page.tsx` (modify — remove `shouldUseFullOverwrite()` and `updateClaritySessionLiveState()` call sites only)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 2 step 4 (lines ~410-411)"
- **Tests:** `src/tests/p525-deadlock-prevention.test.ts`
- **Depends on:** None
- **Verify:** `updateClaritySessionLiveState` and `shouldUseFullOverwrite` no longer exist in codebase; all writes route through `patchClaritySessionLiveState`; `npx tsc --noEmit` passes
- [ ] Complete

### Task 4: Calibration data source fix — writeVerification uses speakerReRating
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify — `writeVerification` function only)
- **Spec refs:** "Calibration Data Source Fix (lines ~197-199)", "Technical Architecture > Implementation Approach > Phase 2 step 5 (lines ~411-412)"
- **Tests:** `e2e/integration/p600-free-mode-rerating.spec.ts`
- **Depends on:** Task 1 (needs new field names in type)
- **Verify:** `writeVerification` passes `speakerReRating` (with `ratingA` fallback) to `recordVerification`; TypeScript compiles
- [ ] Complete

### Task 5: Integrate monotonic guard into Realtime + drift handlers
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify — Realtime subscription handler + drift poll handler)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 3 steps 6-7 (lines ~414-415)", "Technical Architecture > Technical Analysis > Realtime handler (lines ~261-268)"
- **Tests:** `src/tests/live-state-guard.test.ts`, `src/tests/p637-drift-detection-completeness.test.ts`
- **Depends on:** Task 2
- **Verify:** `isStateRegression()` is called before merge in both Realtime handler and drift poll; no bypass path exists
- [ ] Complete

### Task 6: Core handler rewrites — rating, celebration, paraphrase
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify — handler callbacks)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 3 steps 8-12 (lines ~416-421)"
- **Tests:** `e2e/p674-linear-flow.spec.ts`, `e2e/p674-smoke.spec.ts`
- **Depends on:** Task 1, Task 5
- **Verify:** `handleRatingSubmit` uses `ratingA`/`ratingB`/`speakerIsCreator`/`phase`; `handleCelebrationComplete` transitions to `sliders` (no guided/free branch); guided-only handlers deleted (~10 callbacks); `handleExplainBackDone` → `handleParaphraseDone` (single step)
- [ ] Complete

### Task 7: UI surgery — live-mode-view.tsx linear phase rendering
- **Files:** `src/app/components/partners/live-mode-view.tsx` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 4 step 13 (lines ~423)"
- **Tests:** `src/tests/live-mode-view.test.tsx`, `e2e/p674-linear-flow.spec.ts`
- **Depends on:** Task 1, Task 6
- **Verify:** Mode branching deleted; `IdleScreen` mode pill deleted; 8-branch if-tree collapsed to linear phase switch; guided-only rendering branches (clarification, role negotiation, iterative explain-back) removed
- [ ] Complete

### Task 8: Promote FreeModeView + update free-mode components
- **Files:** `src/app/components/partners/free-mode-view.tsx` (modify), `src/app/components/partners/free-mode-success.tsx` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 4 steps 14, 16 (lines ~424, 426)"
- **Tests:** `src/tests/free-mode-phases.test.ts`, `e2e/p674-linear-flow.spec.ts`
- **Depends on:** Task 1, Task 7
- **Verify:** `FreeModeView` not gated on `sessionMode`; field names updated (`freeSliderCreator` → `sliderCreator`, etc.); `free-mode-success.tsx` uses new field names
- [ ] Complete

### Task 9: Delete in-session history + update remaining components
- **Files:** `src/app/components/partners/live-content-cards.tsx` (delete), `src/app/components/partners/round-summary-screen.tsx` (modify), `src/app/components/partners/demo-level-view.tsx` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 4 step 15 (line ~425)", "Architecture Decisions > Decision 4 (lines ~326-334)"
- **Tests:** `e2e/p674-smoke.spec.ts`
- **Depends on:** Task 7 (live-mode-view no longer imports it)
- **Verify:** `live-content-cards.tsx` deleted; no import references remain; `round-summary-screen.tsx` and `demo-level-view.tsx` use new field names; `npx tsc --noEmit` passes
- [ ] Complete

### Task 10: Drift detection + cleanup — new field names, dead ref removal
- **Files:** `src/app/pages/clarity-live-page.tsx` (modify — drift detection block + ref/state cleanup), `src/auth/AuthContext.tsx` (modify — verify compatibility)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 5 steps 17-19 (lines ~429-431)"
- **Tests:** `src/tests/p637-drift-detection-completeness.test.ts`
- **Depends on:** Task 5, Task 6
- **Verify:** Drift detection checks new field names; deleted refs/states removed (~15); `AuthContext.tsx` `patchClaritySessionLiveState` call compatible; `npx tsc --noEmit` passes with zero errors
- [ ] Complete

### Task 11: Unit test updates — guard, deadlock, phases, slider sync
- **Files:** `src/tests/p637-drift-detection-completeness.test.ts` (modify), `src/tests/p525-deadlock-prevention.test.ts` (modify), `src/tests/free-mode-phases.test.ts` (modify), `src/tests/p609-free-slider-sync.test.ts` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 6 steps 20-23 (lines ~434-438)"
- **Tests:** (self-verifying)
- **Depends on:** Task 1, Task 2, Task 3, Task 10
- **Verify:** All unit tests pass with new field names; `KNOWN_UNCOVERED` entries updated; `shouldUseFullOverwrite` tests deleted
- [ ] Complete

### Task 12: Unit test — live-mode-view + E2E helper update
- **Files:** `src/tests/live-mode-view.test.tsx` (modify), `e2e/helpers/test-realtime.ts` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 6 steps 24, 26 (lines ~438, 440)"
- **Tests:** (self-verifying)
- **Depends on:** Task 1, Task 7
- **Verify:** Guided-mode-specific tests removed from `live-mode-view.test.tsx`; `advanceSessionState` in `test-realtime.ts` uses new field names; tests pass
- [ ] Complete

### Task 13: E2E rewrite — core flow tests (p562, p600)
- **Files:** `e2e/p562-free-mode.spec.ts` (modify), `e2e/p562-smoke.spec.ts` (modify), `e2e/integration/p562-free-mode-state.spec.ts` (modify), `e2e/integration/p600-free-mode-rerating.spec.ts` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 6 step 25 (lines ~439)"
- **Tests:** (self-verifying)
- **Depends on:** Task 12 (needs updated `test-realtime.ts` helper)
- **Verify:** All 4 E2E specs pass with merged-flow assertions; no references to `ratingPhase`, `freePhase`, `sessionMode`, `checkerRating`, `responderRating`
- [ ] Complete

### Task 14: E2E updates — layout, smoke, a11y, celebration, history, persistence tests
- **Files:** `e2e/p525-celebration-race.spec.ts` (modify), `e2e/live-rating-drawer.spec.ts` (modify), `e2e/p398-session-history-summary.spec.ts` (modify), `e2e/p399-story-persistence.spec.ts` (modify), `e2e/p455-live-mobile-layout.spec.ts` (modify), `e2e/p469-live-layout-kiss.spec.ts` (modify), `e2e/p588-live-layout-sticky-cta.spec.ts` (modify), `e2e/p588-smoke.spec.ts` (modify), `e2e/a11y/p588-accessibility.spec.ts` (modify)
- **Spec refs:** "Technical Architecture > Implementation Approach > Phase 6 step 27 (lines ~441)"
- **Tests:** (self-verifying)
- **Depends on:** Task 12 (needs updated helper)
- **Verify:** All 9 specs pass; no references to old field names; `p398` tests remove inline history assertions
- [ ] Complete

### Task 15: New E2E race condition tests
- **Files:** `e2e/p674-linear-flow.spec.ts` (modify — add race condition scenarios), `e2e/integration/p674-live-state-machine.spec.ts` (modify — add concurrent write scenarios)
- **Spec refs:** "Done-When > Race condition scenarios (lines ~191-195)", "Technical Architecture > Implementation Approach > Phase 6 step 28 (lines ~442)"
- **Tests:** (self-verifying)
- **Depends on:** Task 12 (needs updated helper), Task 6 (handlers must exist)
- **Verify:** 4 race scenarios pass: simultaneous rating submission, simultaneous celebration ack, disconnect during reveal, stale echo after submission
- [ ] Complete

**Total tasks:** 15 | **Can parallelize:** Task 1+3 (no shared deps), Task 11+12 (independent test sets), Task 13+14+15 (independent E2E sets) | **Must be sequential:** Task 1 → 2 → 5 → 6 → 7 → 8 (type → guard → integration → handlers → UI → promote)
