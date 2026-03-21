---
status: all-done
type: bug
rank: 1
completed_at: '2026-03-16'
tags:
  - live-session
  - race-condition
  - deadlock
  - observability
  - state-machine
prepped_date: '2026-03-16'
uat_file: features/uat/p525.md
test_files:
  - src/tests/p525-deadlock-prevention.test.ts
  - e2e/p525-celebration-race.spec.ts
reviews:
  ux: null
  architect: null
  alignment: null
created_date: 2026-03-16
---

# P525: Live State Deadlock Prevention — Atomic Updates, Observability, Recovery

## Problem Statement

**Current state:** The `/live` session state machine stores all shared state in a single `live_state` JSONB column. P399 introduced `patch_live_state` (JSONB `||` merge) which fixed story data races, but `||` merge still overwrites at key level — not array level. Coordination fields like `celebrationAcknowledgedBy` (an array that both users append to) race and lose data. Additionally, there is zero Sentry coverage and no deadlock detection anywhere in the `/live` flow.

**Pain points:**
- Both users get stuck in "limbo" — no active round, no way to start a new round, only "speak freely" with no action button
- Celebration "Continue" race: both click simultaneously, each overwrites the other's `celebrationAcknowledgedBy` array, can oscillate indefinitely
- Failed celebration reset: local `clickedContinue` stays true on DB write failure → Continue button disabled → only exit available
- `handleSkip` doesn't clear `selectedStoryData` — stale story data leaks into next round
- `updateInFlightRef` has no timeout — can block sync indefinitely on slow network
- Zero Sentry context in entire `/live` flow — deadlocks generate no errors, no breadcrumbs, no alerts

**Challenge resolution (2026-03-16):** "Simultaneous rating submission" removed from scope — code analysis shows checker/responder write to different JSONB keys; P399's patch path handles this correctly. Recovery UI and celebration auto-complete deferred to follow-up (P525b) — fix root causes first, at C1 scale facilitator can intervene.

**Who's affected:** All `/live` session participants. Observed in real sessions. Frequency unknown due to lack of instrumentation.

**Prior art:** P399 introduced `patch_live_state` RPC (JSONB `||` merge) — fixed story data races but array-level coordination fields still race.

---

## Intention (Why This Matters)

**Strategic importance:** `/live` sessions are the core product experience. A session that deadlocks destroys trust — users won't return after being stuck with no way forward. Every deadlock is a potential churn event.

**Why now:** Observed in real sessions on 2026-03-16. With upcoming growth (events, coaching sessions), the frequency will increase. Current instrumentation is blind — we don't know how often this already happens.

**Impact if not solved:** Sessions silently fail. Users blame the product, not the network. No data to diagnose or measure. As concurrent usage grows, race conditions become more frequent.

---

## Business Requirements

**Must-haves:**
- No user should ever be stuck in a state with no actionable next step in `/live`
- Celebration acknowledgment must not race — replace `celebrationAcknowledgedBy` array with two boolean keys that cannot collide
- Failed state updates must not leave UI in an unrecoverable state
- Every `updateLiveState` failure must be observable (Sentry + Mixpanel)
- Basic Sentry context on all `/live` sessions for retroactive diagnosis

**Success conditions:**
- All sessions that enter celebration phase complete within 60s (measurable via new Mixpanel events)
- Sentry captures all `updateLiveState` failures with full state context
- Mixpanel `live_phase_transition` fires on every phase change

**Constraints:**
- Must not break existing P399 `patch_live_state` RPC (extend, not replace)
- Must be backward-compatible with in-flight sessions during deploy

**Deferred to P525b:** Recovery UI (watchdog timer, "Reset round" button), celebration auto-complete timeout, stale-phase detection alerts

---

## User Stories

**As a session participant clicking "Continue" after a successful round:**
- I want my click to be reliably recorded even if my partner clicks at the same time, so that we both advance to the next round without getting stuck

**As a session participant experiencing a network issue:**
- I want the UI to recover gracefully if a state update fails, so that I can retry or continue without being forced to end the session

**As a product operator:**
- I want visibility into session health (phase transitions, failures, deadlocks), so that I can measure reliability and diagnose issues retroactively

---

## Jobs to Be Done

**When both of us click "Continue" after a round:**
- I want confidence both clicks are recorded atomically, so I can trust the transition happens cleanly (motivation: trust in the tool)

**When I submit a rating and see "waiting":**
- I want to know my rating was saved, so I can focus on the conversation instead of worrying about the app (motivation: cognitive load reduction)

**When the app seems stuck:**
- I want a clear signal and recovery path, so I don't feel helpless or need to ask my partner "is yours working?" (motivation: autonomy)

**When reviewing session health as operator:**
- I want to know which sessions had problems without users reporting them, so I can fix issues proactively (motivation: proactive quality)

---

## Outcomes (Success Metrics)

**Reliability:**
- All sessions that enter celebration phase complete within 60s (measurable via new Mixpanel events)
- `updateLiveState` failure rate visible in Sentry (currently: invisible)
- Session completion rate: `live_session_completed / live_session_joined` trackable in Mixpanel

**Observability:**
- 100% of `/live` sessions have Sentry context (session code, participants, current phase)
- Every phase transition fires a Mixpanel event (`live_phase_transition`)
- Every `updateLiveState` failure fires both Sentry exception and Mixpanel event

**Client guards:**
- `clickedContinue` local state reverts on DB write failure (no stuck button)
- `handleSkip` clears `selectedStoryData` (parity with celebration handler)
- `updateInFlightRef` releases after max 5s timeout

---

## Acceptance Criteria

- [x] Two users clicking "Continue" simultaneously both advance (no oscillation, no stuck state)
- [x] If `updateLiveState` fails, the UI reverts to a usable state (no disabled buttons, no stuck spinners)
- [x] `handleSkip` clears `selectedStoryData` (parity with `handleCelebrationComplete`)
- [x] `updateInFlightRef` releases after max 5 seconds (no indefinite sync blackout)
- [x] Sentry captures all `updateLiveState` failures with sanitized `live_state` snapshot (no user names or story content)
- [x] Sentry tags and context set on `/live` session entry (code, participants, phase)
- [x] Sentry breadcrumbs added on every phase transition
- [x] Mixpanel `live_phase_transition` event fires on every phase change
- [x] Mixpanel `live_state_update_failed` event fires on every write failure
- [x] Session completion rate measurable from existing + new Mixpanel events
- [x] Drift detection updated for new boolean keys (replace array length check with boolean comparison)
- [x] Round reset clears both new boolean keys (`celebrationAcknowledgedByCreator`, `celebrationAcknowledgedByJoiner`)
- [x] `live_phase_transition` uses a ref to track `from_phase` (not derived from stale state)
- [x] No regression in existing session flow (happy path still works)

---

## Challenge Log

**2026-03-16 /challenge-prd — Verdict: CHALLENGE (resolved)**

BLOCKs resolved:
1. "Simultaneous rating race" — removed from scope (phantom: checker/responder use different keys, P399 patch handles it)
2. `celebrationAcknowledgedBy` fix — adopted two-boolean approach instead of array-append RPC (simpler, no migration needed, zero race possible)
3. Recovery UI partner coordination — deferred to P525b (fix root causes first)

Scope reduction: removed recovery UI, watchdog timer, celebration auto-complete. Deferred to P525b — build only if deadlocks persist after root cause fixes.

---

## Next Steps

1. ~~Run `/challenge-prd` to stress-test these requirements~~ Done (2026-03-16)
2. Run `/architect` to design boolean celebration keys, client guards, Sentry/Mixpanel integration
3. Run `/generate-tests` for race condition test scenarios
4. Run `/dev` to implement
5. Run `/verify` with two browsers to confirm deadlocks are resolved

---

## Technical Analysis

### Current Code State

**State machine (`clarity-live-page.tsx`, ~2900 lines):**
- `updateLiveState` (line ~864) is the single write path. It does optimistic UI update, sets `updateInFlightRef = true` to block polling, then calls either `updateClaritySessionLiveState` (full overwrite) or `patchClaritySessionLiveState` (JSONB `||` merge via `patch_live_state` RPC). The choice is governed by whether the update touches story fields, whether a story is active, and whether any value is explicitly `undefined`.
- On failure, it reverts `setLiveState(stateBeforeUpdate)` but does NOT revert any local component state (e.g., `clickedContinue` in `live-mode-view.tsx`).
- `updateInFlightRef` is set `true` before the DB call and `false` in `finally`, but has no timeout — a hung network request blocks polling indefinitely.

**Celebration race (`handleCelebrationComplete`, line ~1380):**
- Reads `celebrationAcknowledgedBy` array from `confirmedLiveStateRef.current`.
- Appends current user's name: `[...acknowledged, name]`.
- If both acknowledged, does a full state reset. Otherwise writes `{ celebrationAcknowledgedBy: newAcknowledged }`.
- This write goes through `patchClaritySessionLiveState` (JSONB `||` merge). The merge replaces the entire `celebrationAcknowledgedBy` key. If User A writes `["Alice"]` and User B writes `["Bob"]` concurrently (both read `[]`), last writer wins and one acknowledgment is lost.

**`handleSkip` bug (line ~1324):**
- Clears `selectedStoryId`, `selectedPointId`, `selectedContentTitle` but does NOT clear `selectedStoryData`. Compare with `handleCelebrationComplete` (line ~1440) which does clear `selectedStoryData: undefined`. This leaks stale story data into the next round.

**`clickedContinue` stuck state (`live-mode-view.tsx`, line ~2136):**
- Local `useState(false)` set to `true` when user clicks Continue. Only reset when `celebrationAcknowledgedBy` array empties (via `useEffect`). If the `updateLiveState` call fails, `celebrationAcknowledgedBy` never updates on the server, the `useEffect` never fires, and `clickedContinue` stays `true` — button remains disabled.

**Drift detection (line ~820):**
- `celebrationAcknowledgedByDrift` compares array lengths, not contents. This is sufficient for the current array approach but will need updating for the boolean approach.

**Sentry coverage:**
- `Sentry.init` in `src/main.tsx` with browser tracing, replay, and privacy masking.
- Existing `Sentry.captureException` usage in `api.ts` (ML upload), `stories-service-real.ts`, `AuthCallbackPage.tsx`.
- Zero Sentry instrumentation in `clarity-live-page.tsx` or `live-mode-view.tsx`. The `updateLiveState` catch block logs to `console.error` only.

**Mixpanel coverage:**
- `trackLiveEvent` is aliased to `analytics.track` (from `src/lib/mixpanel.ts`).
- Existing events: `live_rating_submitted`, `live_round_skipped`, `live_understanding_revealed`, `live_perfect_understanding`, `live_explain_back_started`.
- No event for phase transitions, state update failures, or session lifecycle.

**P399 `patch_live_state` RPC (`supabase/migrations/20260220130000_patch_live_state_rpc.sql`):**
- `COALESCE(live_state, '{}'::jsonb) || p_patch` — key-level merge. Works correctly for scalar keys (ratings, phase). Breaks for array keys where both users append.

**P511 overlap:**
- P511 (session resilience) is at `delivery_stage: 4-tests-ready`, status locked. It touches `clarity-live-page.tsx` for rejoin/departure logic but does NOT touch `handleCelebrationComplete`, `handleSkip`, `updateLiveState` error handling, or observability. No merge conflict expected on the specific lines P525 modifies.

### Dependencies

| Dependency | Version/State | Impact |
|---|---|---|
| `patch_live_state` RPC (P399) | Deployed, stable | Extended by P525 (no schema change needed — boolean keys go through same `||` merge) |
| `@sentry/react` | Already in `package.json` | Used for new instrumentation — no new dependency |
| Mixpanel snippet | Loaded via `index.html` | New events only — no SDK change |
| `LiveSessionState` type | `src/app/types/index.ts` | Must add two boolean fields, deprecate array field |
| P511 (session resilience) | `delivery_stage: 4-tests-ready`, locked | Parallel work OK — no overlapping lines |

---

## Architecture Decisions

### AD1: Replace `celebrationAcknowledgedBy` array with two boolean keys

**Chosen:** Two boolean keys — `celebrationAcknowledgedByCreator: boolean` and `celebrationAcknowledgedByJoiner: boolean` — written independently by each user.

**Rationale:** JSONB `||` merge operates at the key level. Two users writing to the same key (array) race; two users writing to different keys never collide. The merge `{"celebrationAcknowledgedByCreator": true} || {"celebrationAcknowledgedByJoiner": true}` produces `{"celebrationAcknowledgedByCreator": true, "celebrationAcknowledgedByJoiner": true}` regardless of ordering.

**Trade-off:** Slightly more verbose field names. Role determination (creator vs joiner) must be available at acknowledgment time — already available via `session.creatorId` vs current user.

**Alternative rejected:** Array-append RPC (e.g., `jsonb_set` with `jsonb_array_elements`). Adds DB-level complexity, requires a new migration with custom SQL, and still needs careful handling of duplicate entries. The boolean approach requires zero DB migration — the existing `patch_live_state` RPC handles it as-is.

### AD2: Backward compatibility with in-flight sessions

**Chosen:** Dual-read approach during transition. `handleCelebrationComplete` checks both old array (`celebrationAcknowledgedBy`) and new booleans. Write path uses only new booleans. An in-flight session where one user has the old code and one has the new code will see the new-code user's acknowledgment via boolean, and the old-code user's via array. The "both acknowledged" check OR's both signals.

**Rationale:** Deploy is not atomic — one user may load the new bundle while the other has the old cached version. The dual-read ensures neither gets stuck.

**Trade-off:** Slightly more complex completion check for one deploy cycle. Can be removed in a follow-up cleanup (P525-cleanup).

**Alternative rejected:** Force-refresh on deploy. Too disruptive for an in-session user.

### AD3: Sentry integration pattern — context + breadcrumbs + exception capture

**Chosen:** Three-layer approach:
1. **Sentry.setContext('live_session', {...})** on session join — sets session code, participant names, role (creator/joiner), session ID. Persists across all errors in the session.
2. **Sentry.addBreadcrumb** on every phase transition — creates an audit trail for debugging deadlocks retroactively.
3. **Sentry.captureException** in `updateLiveState` catch block — captures the error with full `live_state` snapshot as `extra`.

**Rationale:** Matches existing Sentry patterns in the codebase (see `stories-service-real.ts`, `api.ts`). Context + breadcrumbs give retroactive debugging power without increasing error volume. Exception capture on write failure is the only new error — all other instrumentation is metadata.

**Trade-off:** `live_state` contains user names and story content — must be sanitized before sending to Sentry. Create `sanitizeLiveStateForSentry()` utility that strips PII fields (`checkerName`, `proverName`, `currentSpeaker`, `currentListener`, `selectedStoryData`, etc.) and keeps only structural/diagnostic fields (phase, round, submission flags, timestamps). See Security Review for details.

**Alternative rejected:** Custom Sentry transaction per session. Over-instrumented for current scale; breadcrumbs provide sufficient timeline.

### AD4: Mixpanel event pattern — `live_phase_transition` and `live_state_update_failed`

**Chosen:** Two new events:
1. `live_phase_transition` — fired in a new `useEffect` watching `liveState.ratingPhase`, with properties: `session_code`, `from_phase`, `to_phase`, `round`, `timestamp`. Enables funnel analysis (how many sessions reach celebration? how long between phases?).
2. `live_state_update_failed` — fired in `updateLiveState` catch block, with properties: `session_code`, `error_message`, `attempted_keys` (which fields were being written), `phase_at_failure`.

**Rationale:** Phase transitions are the natural unit of session progress. Failure events correlate with user-visible stuck states. Together they answer: "how often do sessions get stuck, and at which transition?"

**Trade-off:** `live_phase_transition` fires on every phase change including normal flow. Volume is bounded (max ~20 transitions per session, ~10 sessions/week at current scale).

**Alternative rejected:** Single `live_session_health` event with phase as property. Harder to build funnels; Mixpanel works best with discrete events.

### AD5: `updateInFlightRef` timeout — 5s cap via Promise.race

**Chosen:** Wrap the DB call in `Promise.race([dbCall, timeout(5000)])`. On timeout, treat as failure — revert optimistic state, set `updateInFlightRef = false`, fire Sentry exception and Mixpanel failure event.

**Rationale:** 5s is generous for a single JSONB update (typically <200ms). A hung request blocking polling indefinitely is worse than a false timeout — the user can retry, and polling resumes to sync state.

**Trade-off:** A legitimate slow response (e.g., Supabase under load) may be treated as failure and reverted, then the actual write succeeds — creating a brief inconsistency that drift detection will resolve on next poll cycle.

**Alternative rejected:** AbortController on the fetch. Supabase JS client doesn't expose abort signal for RPC calls. Promise.race is simpler and framework-agnostic.

---

## Security Review

**RLS Policies:**
- ✅ No RLS impact from boolean replacement. RLS on `clarity_sessions` operates at row level, not JSONB field level.
- ✅ `patch_live_state` RPC is `SECURITY DEFINER` (pre-existing). No change needed.
- ℹ️ Pre-existing: no ownership check inside `patch_live_state`. Not blocking, worth hardening in follow-up.

**Authentication:**
- ✅ No new auth concerns. All tracking runs within existing session contexts.

**Authorization:**
- ⚠️ Either participant can write any key via `patch_live_state`. Same trust model as current array — no regression. Boolean approach reduces attack surface.

**Input Validation:**
- ✅ No injection risks. Mixpanel events are structured objects. Sentry accepts JSON in `extra`. `patch_live_state` uses parameterized JSONB `||`.

**Data Protection:**
- ⚠️ **Sentry PII concern.** `live_state` contains user display names and story content. `sendDefaultPii: false` does NOT cover explicitly attached `extra` data. **Resolution:** Create `sanitizeLiveStateForSentry()` utility — send only structural fields (phase, round number, submission flags). Strip names and content. Acceptance criterion: "sanitized snapshot" not "full snapshot."
- ✅ Mixpanel events — no user names or content in proposed schemas.

---

## Implementation Approach

> **Worktree recommended.** This feature modifies 6+ files across types, API, page, component, and migration layers. Use `git worktree add .claude/worktrees/w1 -b feature/p525-deadlock-prevention` per project convention.

### Files to Modify

| File | Changes |
|---|---|
| `src/app/types/index.ts` | Add `celebrationAcknowledgedByCreator?: boolean` and `celebrationAcknowledgedByJoiner?: boolean` to `LiveSessionState`. Keep `celebrationAcknowledgedBy?: string[]` (deprecated, for backward compat). |
| `src/app/pages/clarity-live-page.tsx` | (1) Refactor `handleCelebrationComplete` to write boolean key based on role. (2) Add dual-read for backward compat. (3) Add `selectedStoryData: undefined` to `handleSkip`. (4) Add 5s timeout to `updateLiveState` via `Promise.race`. (5) Add `Sentry.captureException` + Mixpanel `live_state_update_failed` in catch block. (6) Add `Sentry.setContext('live_session', ...)` on session join. (7) Add `Sentry.addBreadcrumb` + Mixpanel `live_phase_transition` via `useEffect` on `ratingPhase`. |
| `src/app/components/partners/live-mode-view.tsx` | (1) Update celebration acknowledgment reads from array to booleans (dual-read for compat). (2) Update `clickedContinue` reset logic to watch new boolean keys. (3) Update drift check references. (4) Revert `clickedContinue` on `onCelebrationComplete` failure (parent signals via callback or error state). |
| `src/app/data/api.ts` | Add `Sentry.captureException` to `patchClaritySessionLiveState` and `updateClaritySessionLiveState` error paths (currently only `console.error`). |
| `e2e/p-story-persistence-fixes.spec.ts` | Update test fixtures that write `celebrationAcknowledgedBy` array to use new boolean keys. |

### Files to Create

| File | Purpose |
|---|---|
| None | No new files needed. All changes fit into existing files. |

### Build Sequence

**Phase 1 — Root cause fix (celebration race)**
1. Add boolean fields to `LiveSessionState` type in `src/app/types/index.ts`
2. Refactor `handleCelebrationComplete` in `clarity-live-page.tsx` to write role-based boolean key
3. Add dual-read logic (check both old array and new booleans) for backward compat
4. Update `live-mode-view.tsx` celebration acknowledgment reads and `clickedContinue` reset to use new booleans
5. Update drift detection to check new boolean keys instead of array length

**Phase 2 — Client guards**
6. Add `selectedStoryData: undefined` to `handleSkip` in `clarity-live-page.tsx`
7. Add 5s timeout to `updateLiveState` DB call via `Promise.race`
8. Add `clickedContinue` revert mechanism on write failure — `handleCelebrationComplete` passes an `onError` callback from `clarity-live-page.tsx` that `live-mode-view.tsx` calls `setClickedContinue(false)` on. Pattern: parent's `handleCelebrationComplete` wraps the DB call in try/catch; on catch, calls `onCelebrationError?.()` which the child component uses to revert local state.

**Phase 3 — Observability**
9. Add `Sentry.setContext('live_session', ...)` on session join
10. Add `Sentry.addBreadcrumb` on phase transitions (new `useEffect`)
11. Add `Sentry.captureException` in `updateLiveState` catch block
12. Add `Sentry.captureException` in `api.ts` live state error paths
13. Add Mixpanel `live_phase_transition` event (same `useEffect` as breadcrumb)
14. Add Mixpanel `live_state_update_failed` event in catch block

**Phase 4 — Test updates**
15. Update `e2e/p-story-persistence-fixes.spec.ts` fixtures for boolean keys
16. Run existing test suite to verify no regressions

---

## Test Coverage Strategy

### Unit Tests (`src/tests/p525-deadlock-prevention.test.ts`)

**What's tested:**
1. **`sanitizeLiveStateForSentry()`** — verifies PII stripping (names, story content) while preserving structural fields (phase, round, submission flags, celebration booleans). Covers null/undefined input, name-keyed maps, and all PII field types.
2. **Celebration boolean logic** — verifies `isBothAcknowledged` with all combinations (both true, one true, neither, undefined). Backward compatibility with old `celebrationAcknowledgedBy` array (dual-read OR logic). Simulates JSONB `||` merge to confirm independent keys never collide.
3. **Timeout wrapper (`raceWithTimeout`)** — verifies normal completion within 5s, rejection on timeout, timer cleanup after success, passthrough of non-timeout errors.
4. **`handleSkip` payload** — verifies `selectedStoryData: undefined` is explicitly included in the skip update.
5. **`clickedContinue` revert** — verifies button re-enables on write failure, stays disabled on success.

**Not covered (by design):**
- Sentry/Mixpanel integration (side effects — verified in UAT)
- Full component rendering of `live-mode-view.tsx` (too coupled to session state machine)

### E2E Tests (`e2e/p525-celebration-race.spec.ts`)

**What's tested:**
1. **Celebration race** — two browser contexts in a session set to celebration phase. Both click Continue. DB confirms both boolean keys are set. Session advances to next round (ratingPhase → idle, round increments).
2. **Skip clears story data** — session with story data, creator clicks Skip, DB confirms `selectedStoryData` is cleared.

**Test approach:** Sessions are set up directly via `supabaseAdmin` with specific `live_state` to skip the full rating flow and isolate the celebration/skip behavior. Two-party tests use separate browser contexts per existing project pattern.

**Not covered (by design):**
- True sub-millisecond race timing (E2E cannot guarantee simultaneous clicks — we verify the outcome, not the timing)
- Timeout behavior (requires network manipulation beyond E2E scope)

### UAT Scenarios (`features/uat/p525.md`)

12 manual test scenarios covering:
- Celebration race (simultaneous + sequential clicks)
- `clickedContinue` revert via network offline toggle
- `handleSkip` story data clearing
- `updateInFlightRef` 5s timeout via network throttling
- Sentry context, breadcrumbs, and sanitized error capture
- Mixpanel `live_phase_transition` and `live_state_update_failed` events
- Backward compatibility (mixed old/new code)
- Happy path regression check

### Integration / Accessibility / Smoke Tests

**Not generated (by design):**
- **Integration tests** — no DB migration, no new API endpoints, no new RPC functions
- **Accessibility tests** — no new UI components (P525 modifies behavior of existing celebration/skip buttons)
- **Smoke tests** — no new pages or routes
