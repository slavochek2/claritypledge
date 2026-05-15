---
status: all-done
completed_at: '2026-05-15'
type: story
rank: 0.013
workstream: C2
created_date: '2026-04-28'
tags:
  - live
  - letter
  - preload
  - calibration
pipeline_ran: [create-spec, challenge-prd, architect, generate-tests, spec-review, dev, verify, ship]
uat_file: features/uat/p827.md
test_files:
  - src/tests/p827-live-story-switch-letter-preload.test.ts
pipeline_skipped:
  - >-
    ux -- no new UI; mid-round and picker-sourced preload reuse
    entry-from-letter surfaces (P733/P792)
---

# P827: /live preload on mid-round story switch

## Problem

**Situation:** Letter→/live preload runs fully only at entry-from-letter-results (P733 `bootstrapLetterSourcedSession`). When /live is running and the user switches to a different story — or when /live is entered via the story picker rather than letter results — the preload is partial:

- **Positions DO preload** on every story-switch (entry or mid-round). P792 already wires `handleSelectStory` to fetch both parties' positions from `point_positions` and write them atomically into `live_state`.
- **Comprehension ratings + phase jump do NOT preload.** `bootstrapLetterSourcedSession` pulls speaker/listener self-ratings via `getLetterBaselineRatings`, sets `ratingPhase: 'explain-back'`, and marks both ratings as submitted. The picker path (mid-round, or picker-entry without a letter context) skips this — the participants land in rating-capture and re-enter the two numbers the letter already collected.

**Complication:** Letters can carry many stories (CK has 9). With a fully-completed letter, the system already holds every story's positions AND the two comprehension self-ratings from both sides. Today, verifying all 9 stories with the same partner requires ending and restarting the session 9 times from letter-results — every mid-round switch drops back to rating-capture even though the data is on file. This is active workflow friction for letter-verification sessions happening now.

**Question:** When a story-switch (mid-round, OR picker-sourced at entry) lands on a story for which the two participants share a completed letter response, should /live preload positions AND ratings AND jump to `explain-back` — mirroring entry-from-letter? And how does the picker discover the relevant letter response when the session has no `sourceLetterId`?

## Appetite

Medium blast radius — touches /live story-switch flow, reuses existing preload helpers from P733/P792 but invokes them outside the entry path. Reversible (gate behind a check; revert is one helper call). Decision density is medium: one open UX call (inline-fill vs reset-to-preloaded-entry) that needs the actual screens to decide.

## Solution

Make /live preload symmetric across entry paths and in-round story switches. Principle:

- **Pre-load always when upstream data exists** — letter responses today; future async intake sources fall under the same rule.
- **Never pre-load from prior /live sessions** — re-doing the same story is the calibration practice; pre-loading from a previous round defeats it.

Story-switch (mid-round OR picker-entry without `sourceLetterId`): when the user picks a story for which the two participants share a completed letter response, /live applies the full entry-from-letter preload — positions + comprehension ratings + phase jump to `explain-back`. Reuse `bootstrapLetterSourcedSession`'s letter-specific logic (extracted into a callable helper if needed); the new surface is the story-switch action invoking it.

No new UI: the resulting screen is the same preloaded-explain-back surface entry-from-letter already shows. Resolved per `## Resolved Decisions` #4.

## Risks / Non-Goals

### Risks

- **Same-story re-selection from same letter pre-loads twice.** Acceptable: source is unchanged, no practice value lost — letter is upstream data, not prior /live attempt. Mitigation: explicit rule in spec, no special-case code.
- **Mid-round switch loses in-round work** if (b) is chosen. Mitigation: /ux must specify what happens to the partial round (discard with confirm? snapshot to session history?).
- **Reused preload helper assumes entry-path state.** If the existing helper expects "round not yet started," invoking it mid-round may break invariants. Mitigation: architect inspects P733/P792 helper contract first; refactor to pure fetch-then-populate if needed.
- **Future non-letter upstream sources.** The rule is "any upstream source pre-loads." If a future source (async intake, voice memo, etc.) ships, it must follow this rule. Mitigation: spec the principle, not just letters.

### Non-Goals

- Do NOT pre-load from prior /live sessions (would defeat practice/calibration purpose)
- Do NOT add resume-flow for partial /live data abandoned mid-round (separate feature; different decision)
- Do NOT change letter→/live entry pre-load behavior (P733/P792 entry path stays as-is)
- Do NOT change picker→/live entry pre-load behavior (P792 entry path stays as-is)
- Do NOT introduce a new data source for pre-load in this spec — letter data only; future sources follow the principle but ship in their own specs
- Do NOT change session history semantics in this spec

## Done-When

- [x] Picking a letter-backed story mid-/live pre-loads: (a) both parties' positions [already done — P792], (b) speaker + listener comprehension self-ratings from the letter response, (c) `ratingPhase` jumps to `'explain-back'` with `checkerSubmitted` and `responderSubmitted` set true
- [x] Picking a story with no upstream data mid-/live yields a blank entry (current behavior preserved)
- [x] Picking a story that has only prior /live history (no letter) yields a blank entry (no prior-/live pre-load)
- [x] Same letter-backed story picked twice in a session pre-loads both times (rule, not bug)
- [x] Existing letter→/live entry pre-load (P733) and picker→/live entry pre-load (P792) behavior unchanged
- [x] In-round work is not silently lost when a switch triggers pre-load (whichever UX is chosen, the spec is followed)
- [x] Regression tests cover: entry pre-load (still works), mid-round pre-load (new), mid-round blank (no upstream data), no-prior-/live pre-load

## UX Notes

No new screens or states. All surfaces reuse the existing entry-from-letter preloaded UI (P733/P792). Per-state behavior:

- **Story-switch → story has letter data shared between participants** — apply full preload (positions + ratings + `ratingPhase: 'explain-back'`). Same surface entry-from-letter renders today.
- **Story-switch → story has no letter data** — blank entry; positions still load via P792 (`handleSelectStory` path).
- **Story-switch → story has only prior /live data** — blank entry, no preload (practice integrity rule).
- **Round not yet started, story picked** — unchanged (existing P733/P792 behavior).
- **Partial in-round work when switch happens** — discarded by replacement (`live_state` holds one current-round snapshot; switching stories replaces it). Not a UX decision — a state-model consequence.

## Acceptance Criteria

- [x] Pre-load works on every story selection that has upstream data, not only on entry
- [x] Practice integrity preserved — re-doing the same story without letter data starts blank
- [x] User flow on mid-round switch is consistent with /ux decision (a or b)
- [x] Architect-confirmed reuse of P733/P792 preload helper (no parallel implementation)

## Resolved Decisions

| # | Source | Finding | Resolution | Rationale |
|---|--------|---------|-----------|-----------|
| 1 | /challenge-prd [BLOCK] Problem Clarity | Spec said "blank entry on switch"; P792 already preloads positions on every story-switch | Problem rewritten to distinguish: positions = done (P792), gap = comprehension ratings + phase jump | Disambiguates scope so two developers build the same thing |
| 2 | /challenge-prd [BLOCK] Testability | "Same way" in Done-When was unverifiable | Done-When item 1 enumerates the three preload elements explicitly: positions, two ratings, `ratingPhase='explain-back'` with `checkerSubmitted`/`responderSubmitted` true | Mechanically testable |
| 3 | /challenge-prd Hard Q1 (scope) | Positions vs ratings+phase ambiguity | Scope is BOTH layers, on every story-switch (mid-round OR picker-sourced at entry) where the picked story has a completed letter response shared between the two participants | Founder workflow today: verifying multi-story letters per partner requires this to avoid N session restarts |
| 4 | /challenge-prd Hard Q2 (phase jump mid-round) | Should `ratingPhase` reset on mid-round switch? | Yes — mirror entry behavior. Letter is authoritative for the two comprehension ratings; participant shouldn't re-enter them | Same data source = same treatment |
| 5 | /challenge-prd Hard Q3 (worth building?) | Subagent argued defer until 30+ readers | Build now — founder IS the user, currently running letter-verification sessions with letter completers. 9-story letter today = 9 end+restart cycles | Active workflow friction, not future optimization |
| 6 | /challenge-prd NOTE (picker letter-discovery) | Picker-sourced /live has no `sourceLetterId` on session, but should still preload from a letter response if one exists between the participants for the picked story | For /architect: spec how the picker resolves "is this story in a letter response shared between the two participants?" (query `letter_response` by sender/recipient pair × story, pick most recent, cache on session, etc.) | New scope discovered during challenge resolution; architecture decision required before implementation |

## Technical Architecture

### Technical Analysis

**Current code state (verified this session):**

- `bootstrapLetterSourcedSession` (`src/app/pages/clarity-live-page.tsx:2852`) — entry-only letter preload. Idempotency guard at `:2858-2861` (`existingPhase !== 'idle'` → return). Mixes four concerns: (a) guard, (b) parallel fetch of ratings + story + positions, (c) compose full `LiveSessionState` from `DEFAULT_LIVE_STATE`, (d) single atomic write via `updateClaritySessionLiveState` then mirror to local refs.
- `handleSelectStory` (`src/app/pages/clarity-live-page.tsx:1843`) — picker handler. Guard at `:1848` (`checkerName || ratingPhase !== 'idle'` → return). Preloads positions only (`:1864-1869`), then atomic `updateLiveState` write (`:1874-1909`) setting `selectedStoryId`, `selectedStoryData`, `ratingInitiatedBy`, `livePositionsCreator/Joiner`. Sets `ratingPhase` implicitly via the rest of the state machine (transitions out of `idle` once `ratingInitiatedBy` is set).
- `getLetterBaselineRatings` (`src/app/data/api.ts:4053`) — Promise.all over `letter_predictions` (speaker prediction) + `story_verifications` where `source='letter'` (listener rating). Returns `null` if either is missing. Direction-sensitive: `senderId` is queried in both `predictions.letter_id` lineage and `verifications.speaker_id`; `receiverId` is `verifications.listener_id`.
- `toPositionRecord` (`:348`) — module-level helper, already shared.
- `updateClaritySessionLiveState` — single atomic write to `clarity_sessions.live_state` (P643 invariant: listener sees story+phase+ratings in one Realtime event).
- Picker invocation guard (`src/app/components/partners/live-mode-view.tsx:1226`): `hasBottomContent = ... && !liveState.selectedStoryId`. **The picker is only rendered when there is no current story.** "Mid-round switch" in the spec's framing is reachable only via `handleClearStory` (`clarity-live-page.tsx:1917`) which clears `selectedStoryId/Data` and returns to idle — after which the picker reappears. There is no in-phase story-switch path today.
- Schema (`supabase/migrations/20260403224331_p581_clarity_letters.sql`):
  - `clarity_letters(id, sender_id, mode, status)`
  - `letter_deliveries(id, letter_id, receiver_profile_id, status, completed_at)`
  - `letter_story_snapshots(letter_id, story_id)` — covered stories per letter
  - `letter_predictions(letter_id, delivery_id, story_id, prediction)` — sender-side
  - `story_verifications(speaker_id, listener_id, story_id, source, listener_rating)` — listener-side, `source='letter'`
- RLS (same migration, `:155-238`): `clarity_letters`, `letter_deliveries`, `letter_story_snapshots` all readable by sender OR receiver. `letter_predictions` and `story_verifications` follow the same sender-or-receiver pattern (verified by P703 already reading them client-side). A client-side discovery query for the current authenticated user as either participant will succeed.

**Reuse inventory (file:line):**

- `bootstrapLetterSourcedSession` — `src/app/pages/clarity-live-page.tsx:2852`
- `handleSelectStory` — `src/app/pages/clarity-live-page.tsx:1843`
- `getLetterBaselineRatings` / `BaselineRatings` type — `src/app/data/api.ts:4053`
- `toPositionRecord` — `src/app/pages/clarity-live-page.tsx:348`
- `updateClaritySessionLiveState` — imported from `src/app/data/api.ts`
- `pointsService.getMyPositionsForPoints` — used at `:1866-1867` and `:2876-2877`
- `storiesService.getStoryWithPoints` — used at `:2870`
- `DEFAULT_LIVE_STATE`, `LiveSessionState` — imported in clarity-live-page

### Architecture Decisions

**Decision 1: Extract pure preload-state composer from `bootstrapLetterSourcedSession`.**

- Chosen: extract a module-level pure function `composeLetterPreloadState({ ratings, storyData, senderId, receiverId, creatorIsLetterSender, creatorName, creatorPositions, joinerPositions })` returning a complete `LiveSessionState`. `bootstrapLetterSourcedSession` keeps its idempotency guard, fetches inputs, calls the composer, and writes. The new story-switch letter path fetches inputs, calls the same composer with `creatorIsLetterSender` derived from session.creatorProfileId vs. discovered letter sender, and writes — no guard (replacement is intentional).
- Rationale: single composition path means P703 behavior is preserved by construction; tests on the composer cover both call sites. Avoids duplicating the 15-line `LiveSessionState` literal.
- Trade-off: one extra parameter (`creatorIsLetterSender`) that P703 always passes as `true`; the composer must place ratings on the correct creator/joiner role regardless of which side the session creator is.
- Alternative rejected: parameterize `bootstrapLetterSourcedSession` with a `skipGuard` flag. Rejected — mixes concerns and tempts callers to skip the guard in the entry path.

**Decision 2: Letter discovery query (picker path with no `sourceLetterId`).**

- Chosen: add `findLetterPreloadForStory({ storyId, participantAId, participantBId }): Promise<{ letterId, deliveryId, senderId, receiverId } | null>` in `src/app/data/letters-service.ts`. Implementation: single PostgREST query starting from `letter_deliveries` joined with `clarity_letters!inner` and `letter_story_snapshots!inner`, filtered by `letter_story_snapshots.story_id = storyId`, `letter_deliveries.status = 'completed'`, and `(sender_id = A AND receiver_profile_id = B) OR (sender_id = B AND receiver_profile_id = A)`. Order by `completed_at DESC`, limit 1. Then verify (within the same query via nested selects, or a second narrow check) that both a `letter_predictions` row and a `story_verifications` row with `source='letter'` exist for the resulting (letter, story, sender, receiver). RLS naturally limits results to letters where the caller is sender or receiver (= one of the session participants, since the caller is one of them).
- Rationale: discovery happens once per story-switch, no client-side caching needed (cheap query, RLS-safe). Picking most-recent completed delivery handles the multi-letter-same-pair-same-story edge case deterministically.
- Trade-off: two round-trips if the prediction/verification existence check is split out (one to find the delivery, one to confirm both rows). Acceptable — same shape `getLetterBaselineRatings` already uses on entry. Can be folded into a single `select` with `letter_predictions!inner(prediction)` and a follow-up call to `getLetterBaselineRatings` (which already returns null when either is missing) — net one extra query versus the current entry path.
- Alternative rejected: caching `letterId` on `clarity_sessions` at picker-resolve time. Rejected — adds a session column, requires a write, complicates idempotency on rejoin, and provides no benefit since `findLetterPreloadForStory` is sub-100ms with proper indexing (existing `idx_letter_snapshots_letter` covers `letter_id`; story-side scans the joined deliveries set, which is small per pair).

**Decision 3: Role assignment (which participant is speaker for preloaded ratings).**

- Chosen: letter direction is authoritative. Letter sender → /live speaker (their `prediction` becomes `checkerRating`/`responderRating` depending on whether they are session creator or joiner). Letter receiver → /live listener. The composer accepts `creatorIsLetterSender: boolean` and routes ratings + `livePositions*` accordingly. Concretely: if session creator = letter sender, then `checkerIsCreator: true`, `checkerRating = predictions.prediction`, `responderRating = verifications.listener_rating`; if session creator = letter receiver (joining /live to verify a letter they received and responded to), `checkerIsCreator: false`, with ratings swapped to the joiner side.
- Rationale: the letter already fixed who predicted vs. who verified. /live's speaker role must mirror that mapping or the wrong rating lands in the wrong slot.
- Trade-off: composer parameter surface grows; tested via a unit test that flips `creatorIsLetterSender` and asserts rating placement.
- Alternative rejected: always treating session creator as speaker. Rejected — silently corrupts the rating mapping when the creator is the letter receiver.

**Decision 4: Mid-round switch — replace `live_state` atomically.**

- Chosen: single `updateClaritySessionLiveState` call writing the full preload state. No special "switch" marker; the existing single-snapshot model means partial-round work in the previous story is implicitly discarded by the write. This honors P643 atomic-write (story+phase+ratings+positions in one Realtime event).
- Rationale: the spec's "in-round work loss" risk is a state-model consequence, not a code path to add. Anything else would duplicate state.
- Trade-off: zero — matches existing P792 behavior on story-switch, just with more fields written.
- Alternative rejected: a two-phase write (clear then preload). Rejected — splits one event into two, violates P643.

**Decision 5: Picker invocation guard — keep as-is.**

- Found: the `handleSelectStory` guard at `:1848` (`checkerName || ratingPhase !== 'idle'` → return) is paired with the picker render guard at `live-mode-view.tsx:1226` (`!liveState.selectedStoryId`). Together they ensure the picker is only reachable when `selectedStoryId === undefined` and `ratingPhase === 'idle'` — i.e., at session start, or after `handleClearStory` reset the session to idle.
- Chosen: keep both guards. "Mid-round story switch" in the spec means "user clears the current story (via existing clear UI), picker reappears, picks another story." No new mid-phase switch path is introduced.
- Rationale: the spec's Done-When and `## UX Notes` describe the destination state ("Story-switch → apply full preload") not a new invocation point. Existing clear-then-pick flow already covers the user need; adding a phase-bypass would expand scope beyond Resolved Decision #3 ("on every story-switch where the picked story has a completed letter response").
- Trade-off: "switching mid-rating" (without first clearing) is not supported. If the founder workflow needs that, file a follow-up — it requires confirm-discard UX (Risk #2) that this spec explicitly defers to /ux, and /ux was skipped per frontmatter.

### Security Review

**RLS Policies:**
- ✅ `clarity_letters` SELECT (migration L156–160) restricts to `sender_id = auth.uid()` OR `_is_letter_receiver(id, auth.uid())`. A malicious session creator cannot probe letters between others.
- ✅ `letter_deliveries` SELECT (L191–195) gated by `_is_letter_sender(...)` OR `receiver_profile_id = auth.uid()`. Cross-pair probing is blocked.
- ✅ `letter_story_snapshots` SELECT (L221–225) requires sender-or-receiver, so filtering by story snapshot is safe.
- ⚠️ `letter_predictions` SELECT (L248–262) enforces **sealed-bid** — the receiver can read the speaker's prediction only after a `story_verifications` row with `source='letter'` and `listener_id = auth.uid()` exists for that story. **Implication for P827:** if the picker discovers a letter where the current `auth.uid()` is the receiver but has not yet submitted a letter-rating (partially-completed letter response), the SELECT returns zero rows and preload silently falls back to blank. The discovery query must treat "incomplete letter completion" as no-preload; the existing `letter_deliveries.status='completed'` filter (Decision 2) already covers this — sealed-bid gates remain authoritative.
- ✅ `story_verifications` SELECT (L319–334) restricts `source='letter'` rows to `speaker_id = auth.uid() OR listener_id = auth.uid()`. Both session participants (who are the letter sender+receiver in the preload case) can read; outsiders cannot.

**Authentication:**
- ✅ All policies key off `auth.uid()`. The anonymous `get_letter_by_token` flow is not used by the new discovery path — picker-discovery runs only for authenticated session participants.

**Authorization:**
- ✅ `findLetterPreloadForStory` runs as `authenticated`; RLS prevents disclosure of letters where caller is neither sender nor receiver. No SECURITY DEFINER wrapper required.
- ⚠️ Query must express both directions explicitly with `LIMIT 1` ordered by `completed_at DESC` (already specified in Decision 2 build step) — multiple-direction matches possible if both participants exchanged letters on the same story.
- ✅ `live_state` write is gated by existing `clarity_sessions` UPDATE policy (session membership). No new policy needed.

**Input Validation:**
- ✅ `storyId`, `participantAId`, `participantBId` are UUIDs read from `clarity_sessions` (server-validated at session creation). No user-typed surface. Supabase JS client parameterizes — no SQL injection.

**Data Protection:**
- ⚠️ `listener_rating` from `story_verifications` (source='letter') is preloaded into `live_state`, readable by both session participants. This is intentional parity with the P703/P733 entry path — verify the picker path writes ratings to the **same `live_state` keys** (`checkerRating`/`responderRating` + `checkerSubmitted`/`responderSubmitted`) as `bootstrapLetterSourcedSession`. No new exposure surface beyond entry path.
- ⚠️ `findLetterPreloadForStory` must NOT over-fetch — return only `{ letterId, deliveryId, senderId, receiverId }`. Do not `select=*, clarity_docs(*)` or otherwise pull letter contents.

**Practice Integrity Filter (P827-specific):**
- ⚠️ The discovery path reuses `getLetterBaselineRatings` (`api.ts:4053`), which already filters `source='letter'`. Build sequence step 4 must call `getLetterBaselineRatings` (not write a parallel reader) — this preserves the Non-Goal "do NOT pre-load from prior /live sessions" by construction.
- ⚠️ Additionally filter `clarity_letters.status` (current valid statuses for completed letters: `'sealed'`; `'expired'` and `'draft'` must be excluded) and `letter_deliveries.status = 'completed'` to honor "no preload from incomplete/stale upstream."

**Recommended discovery query shape (for implementation):**
```
clarity_letters cl
  JOIN letter_deliveries ld ON ld.letter_id = cl.id
  JOIN letter_story_snapshots lss ON lss.letter_id = cl.id
WHERE lss.story_id = :storyId
  AND cl.status = 'sealed'
  AND ld.status = 'completed'
  AND (
    (cl.sender_id = :A AND ld.receiver_profile_id = :B)
    OR
    (cl.sender_id = :B AND ld.receiver_profile_id = :A)
  )
ORDER BY ld.completed_at DESC
LIMIT 1
```
RLS independently re-confirms caller is sender or receiver.

### Implementation Approach

#### Files to Create

- None required. (If `composeLetterPreloadState` outgrows ~50 lines or gets reused outside `clarity-live-page.tsx`, extract to `src/app/pages/live/letter-preload.ts`. Default: keep module-level in `clarity-live-page.tsx`.)

#### Files to Modify

- `src/app/data/letters-service.ts` — add `findLetterPreloadForStory({ storyId, participantAId, participantBId })` and its return type.
- `src/app/pages/clarity-live-page.tsx`:
  - Extract `composeLetterPreloadState(...)` as a module-level pure function alongside `toPositionRecord` (`:348`).
  - Refactor `bootstrapLetterSourcedSession` to call the composer (behavioral parity verified by existing P703/P733 tests).
  - In `handleSelectStory`: after the existing position fetch, call `findLetterPreloadForStory` with `(storyId, session.creatorProfileId, session.joinerProfileId)`. On match, call `getLetterBaselineRatings` and `composeLetterPreloadState` (passing `creatorIsLetterSender = session.creatorProfileId === discoveredSenderId`), then write the full preload state in one `updateLiveState` call. On no-match (or null ratings), keep existing positions-only behavior unchanged.
- Tests: new file `src/tests/p827-live-story-switch-letter-preload.test.tsx` (covers Done-When 1–6). Pattern from `src/tests/p792-live-picker-position-preload.test.tsx`.

#### Build Sequence

1. Read existing tests `src/tests/p703-*`, `src/tests/p733-*`, `src/tests/p792-live-picker-position-preload.test.tsx` to mirror their mocking patterns (supabase mocks for `letter_predictions`, `story_verifications`, `letter_deliveries`, position service).
2. Add `findLetterPreloadForStory` in `letters-service.ts`. **Filters (per Security Review):** `clarity_letters.status='sealed'` AND `letter_deliveries.status='completed'` AND bidirectional sender/receiver match. **Return shape:** `{ letterId, deliveryId, senderId, receiverId } | null` — do NOT select `*` or pull `clarity_docs`/letter contents (no over-fetch). Unit tests covering: (a) matches direction A→B, (b) matches B→A, (c) excludes `letter_deliveries.status != 'completed'`, (d) excludes `clarity_letters.status != 'sealed'` (draft/expired), (e) returns null when no shared letter, (f) picks most-recent `completed_at` when multiple matches.
3. Extract `composeLetterPreloadState` module-level in `clarity-live-page.tsx`. Refactor `bootstrapLetterSourcedSession` to use it. Pass `creatorIsLetterSender: true` hardcoded — the entry path always has the session creator as the letter sender; do NOT compute this value here or it will silently change P733 behavior. Run existing P703/P733 tests — must still pass with no test changes.
4. Wire `findLetterPreloadForStory` + composer into `handleSelectStory`. **At entry, before any fetch, reset rating state to defaults** (`ratingPhase: 'idle'`, `checkerRating: null`, `responderRating: null`, `checkerSubmitted: false`, `responderSubmitted: false`, `checkerName: ''`) — this ensures story-switching is idempotent regardless of what the previous story's preload left behind. Then run the normal position fetch, followed by `findLetterPreloadForStory`. On match, call **`getLetterBaselineRatings`** (the existing reader that already filters `source='letter'` — do not write a parallel reader) and `composeLetterPreloadState`, then single atomic `updateLiveState` write writing to the **same `live_state` keys** as `bootstrapLetterSourcedSession` (`checkerRating`/`responderRating`/`checkerSubmitted`/`responderSubmitted`/`ratingPhase`). On no-match, write positions-only. If `getLetterBaselineRatings` returns `null` after a discovery match (e.g. sealed-bid RLS blocks prediction for a partially-completed delivery), fall through to positions-only write — do not write partial rating state.
5. Write `p827-live-story-switch-letter-preload.test.tsx` covering Done-When 1–6: (1) letter-backed picker selection preloads positions + ratings + `ratingPhase: 'explain-back'` + both submitted flags; (2) no upstream data → blank entry; (3) prior /live only → blank entry; (4) same letter-backed story picked twice → preloads both times; (5) entry-from-letter (P733) still unchanged; (6) in-round work replacement is atomic (one write event observed).
6. Run full P703/P733/P792 suites + new P827 suite to confirm no regression.

## Test Coverage Strategy

**What's Tested:**
- ✅ `composeLetterPreloadState` pure function (unit, 7 tests) — rating routing for both creator-is-sender and creator-is-receiver cases; `ratingPhase='explain-back'`; both submitted flags; position and story assignment
- ✅ `findLetterPreloadForStory` selection kernel (unit, 6 tests) — bidirectional A→B and B→A matching; exclusion of non-sealed letters and non-completed deliveries; null on no match; most-recent `completed_at` wins
- ✅ `handleSelectStory` wiring contract (unit, 4 tests) — full preload + single atomic write (P643); blank entry on no letter; blank entry on prior-/live-only (practice integrity); same story picked twice preloads both times

**What's NOT Tested (rationale):**
- ❌ E2E user flow — no new UI (`pipeline_skipped: [ux -- no new UI]`); all surfaces reuse existing P733/P792 preloaded explain-back screen
- ❌ Accessibility — no new UI components
- ❌ P733 regression (Done-When 5) — covered by existing `p733-*` and `p703-*` suites; T14 validates output shape parity
- ❌ Real Supabase query chain for `findLetterPreloadForStory` — FIXME in test file; covered by security review confirming RLS + build-sequence step 2 integration

**Test Pyramid:**
```
     /\
    /  \   0 E2E (no UI)
   /    \
  / 0 INT \
 /----------\
/ 17 UNIT   \
```

**Files generated:**
- `src/tests/p827-live-story-switch-letter-preload.test.ts` (17 tests)
- `features/uat/p827.md` (6 UAT scenarios)

**Next step:** Run `/spec-review features/p827_live_preload_on_story_switch.md`
