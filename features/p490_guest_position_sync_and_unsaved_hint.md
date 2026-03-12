---
status: today
type: bug
rank: 250002.75
workstream: C1
severity: high
date_reported: 2026-03-10
created_date: 2026-03-10
flow: fix
delivery_stage: 3-arch-review
tags: [live, guest, positions]
uat_file: features/uat/p490.md
test_files:
  - src/tests/p490-guest-position-cta.test.tsx
# For bug-specific fields (severity, root_cause), see docs/technical/feature-specs.md
---

# BUG: Guest position sync not reflected on host + missing "unsaved" hint

## Problem

When a guest (unauthenticated user) joins a /live session and sets a position on a point, the host (authenticated user) doesn't see the position badge or receive a toast notification. Additionally, guests see a disabled "Tell your story" CTA but no indication that their positions are ephemeral.

## Symptoms

1. Host sees no position badge when guest votes Disagree/Unsure/Agree
2. Host receives no toast notification for guest position changes
3. Guest sees "Tell your story → Available after the session" instead of "positions unsaved" messaging

## Root Cause

**Primary**: The polling drift check in `clarity-live-page.tsx:773-793` doesn't include `livePositions` in its comparison fields. When Supabase Realtime drops (common on mobile), the poll is the only sync mechanism — but it's blind to position changes.

The Realtime path (`clarity-live-page.tsx:662-666`) works when WebSocket is connected and `updateInFlightRef.current` is false. But the polling fallback — the safety net — never detects `livePositions` drift.

**Code path**: Guest writes `livePositions[name]` via `patchClaritySessionLiveState` (SECURITY DEFINER RPC — works for anon). Host reads `livePositions[partnerName]` where `partnerName = session.joinerName`. Names match. DB write succeeds. But poll at line 793 computes `serverHasUpdate` without checking `livePositions` → poll never syncs.

## Resolution

### Fix 1: Add `livePositions` to drift check
- **File**: `src/app/pages/clarity-live-page.tsx` (~line 791)
- Add `livePositionsDrift` comparing `JSON.stringify(serverState.livePositions ?? {})` vs `JSON.stringify(localState.livePositions ?? {})`
- Add to `serverHasUpdate` OR expression

### Fix 2: Guest "unsaved positions" hint
- Thread `isGuest` prop: `clarity-live-page.tsx` → `live-mode-view.tsx` → screen components → `LiveStoryCardExpanded` → `PointRow`
- When `isGuest && userPosition`: show "Position shared live — sign up to save it" instead of "Tell your story" CTA
- Files: `clarity-live-page.tsx`, `live-mode-view.tsx`, `live-story-card-expanded.tsx`

## Verification

1. Open two browsers on /live — one logged in (host), one incognito (guest)
2. Guest sets a position → host should see badge within 1-2s and toast notification
3. Guest sees "Position shared live — sign up to save it" instead of "Tell your story"
4. `npm test` passes with no regressions

## Technical Analysis

**Current State:**
- Position write path works for guests: `handlePositionSelectInLive` → `updateLiveState` → `patchClaritySessionLiveState` (SECURITY DEFINER RPC, bypasses RLS, works for anon)
- Position read path works: `live-mode-view.tsx:285` reads `livePositions?.[partnerName]` — names match between guest write key and host read key
- Realtime subscription (`clarity-live-page.tsx:662`) syncs liveState when WebSocket is connected and no update is in flight
- Polling fallback (`clarity-live-page.tsx:685-820`) runs every 1s but checks 14 drift fields — `livePositions` is missing

**Edge Cases Investigated:**
1. **`confirmedLiveStateRef` staleness compounds the bug**: Without drift check fix, the host's `confirmedLiveStateRef` never gets the guest's positions. When the host then writes their own position, `{ ...currentPositions, [name]: ... }` uses stale data that excludes the guest's positions. The `jsonb ||` shallow merge replaces the entire `livePositions` key → guest positions silently wiped. Drift check fix solves both the read bug AND the write-staleness risk.
2. **`updateInFlightRef` window**: Both Realtime and polling skip updates when true. Window is only during DB write (set in `updateLiveState`, cleared in `finally`). Standard race condition, not systematic. No fix needed.
3. **Other missing drift fields**: `sessionHistory`, `ratingInitiatedBy`, `perspectiveRequestedBy`, `skippedBy` are missing but are transient signals that resolve on next state transition. Not user-visible bugs. Out of scope.
4. **Guest positions after session end**: Exist only in `live_state` JSONB. No one reads them post-session. Ephemeral by design (P275). No cleanup needed.
5. **Guest name matching**: Guest writes `livePositions[name]`, host reads `livePositions[session.joinerName]`. Both set during join flow — always match.

## Architecture Decisions

**Decision 1: `livePositions` drift via JSON.stringify comparison**
- **Chosen**: `JSON.stringify(serverState.livePositions ?? {}) !== JSON.stringify(localState.livePositions ?? {})`
- **Rationale**: Consistent with `celebrationAcknowledgedBy` drift pattern. Simple `!==` always true for objects (reference comparison). Data volume is tiny (2 participants × 1-5 points).
- **Alternative rejected**: Deep equality library — adds dependency for one comparison on small objects.

**Decision 2: Derive `isGuest` from existing `userId` prop in LiveModeView, thread through sub-components**
- **Chosen**: `const isGuest = userId === undefined` in `live-mode-view.tsx` (where `userId` already exists as a prop). Thread `isGuest` through the sub-component interfaces that contain `LiveStoryCardExpanded` usages: `IdleScreen`, `RatingScreen`, `RatingScreenWithOptionalDrawer`, `UnderstandingScreen`. Each sub-component passes `isGuest` to `LiveStoryCardExpanded`. Follow the exact `isStoryOwner` threading pattern from commit 940b33ea.
- **Rationale**: Avoids threading from `clarity-live-page.tsx` into `LiveModeView` — `isGuest` is derivable locally. But sub-component interfaces DO need updating since `LiveStoryCardExpanded` is rendered inside them, not directly in `LiveModeView`.
- **Alternative rejected**: Threading `isGuest` from `clarity-live-page.tsx` through the `LiveModeView` interface — unnecessary since `userId` already exists there.

**Decision 3: Replace entire CTA block for guests, not just hint text**
- **Chosen**: When `isGuest && userPosition`, render a plain-text info line: "Position shared live — sign up to save it" (no link, no button). The `isGuest` check must come BEFORE the `shouldShowStoryCTA` call — it's a separate branch, not nested inside the existing CTA conditional. Pattern: `if (isGuest && userPosition) { render hint } else if (shouldShowStoryCTA(...) === 'show') { render CTA block }`.
- **Rationale**: The disabled "Tell your story" button is meaningless for guests who cannot create stories. Plain text (no link) because the /live session should not navigate away mid-session. A clean info message is less confusing.
- **Alternative rejected**: Changing only the hint text while keeping the disabled button — misleading.

**Decision 4: No migration, no new components, no new files**
- All changes are client-side TypeScript in existing files.

## Security Review

**RLS Policies:**
- ✅ P490 does not change the RLS surface. No new write paths introduced.
- ℹ️ Pre-existing: `patch_live_state` is SECURITY DEFINER with no caller validation — any anon user can merge arbitrary JSONB into any session they know the UUID for. Out of scope for P490.

**Authentication:**
- ✅ Guest cannot impersonate host. `creator_profile_id` set at INSERT time by authenticated verified user. `isGuest` is UI-only, not an authorization boundary.

**Input Validation:**
- ✅ Guest name validated: non-empty, trimmed, ≤100 chars. DB constraint matches.
- ✅ Name as JSON key: no injection risk (JSONB is not JS prototype chain; React auto-escapes JSX).
- ℹ️ Pre-existing: no server-side validation that `p_patch` contains only known keys. Out of scope.

**Data Protection:**
- ✅ Guest positions are ephemeral — `pointsService.setPosition()` only called when `user?.id` is truthy. Guests skip persistent write.
- ✅ "Position shared live — sign up to save it" messaging accurately reflects ephemeral state.

**Race Conditions:**
- ℹ️ Pre-existing: `jsonb ||` shallow merge means last writer wins for `livePositions`. P490 makes this slightly more visible (drift check now syncs positions) but doesn't worsen it. Self-healing via next poll cycle.

## Implementation Approach

**Files to Modify (3 files, 0 new):**

1. **`src/app/pages/clarity-live-page.tsx`**
   - Line ~791: Add `livePositionsDrift` with `JSON.stringify` comparison
   - Line ~793: Add to `serverHasUpdate` OR expression
   - Line ~798: Optionally add `livePositionsDrift` to Mixpanel analytics event

2. **`src/app/components/partners/live-mode-view.tsx`**
   - Derive `const isGuest = userId === undefined` (near existing `isAuthorOfSelected` derivation, ~line 375)
   - Add `isGuest?: boolean` to sub-component interfaces: `IdleScreenProps`, `RatingScreenProps`, `RatingScreenWithOptionalDrawerProps`, `UnderstandingScreenProps` (follow exact `isStoryOwner` pattern from commit 940b33ea)
   - Thread `isGuest={isGuest}` through sub-component calls → each sub-component passes `isGuest` to `LiveStoryCardExpanded`

3. **`src/app/components/partners/live-story-card-expanded.tsx`**
   - Add `isGuest?: boolean` to `LiveStoryCardExpandedProps` and `PointRow` inline type
   - CTA area: `isGuest && userPosition` → render "Position shared live — sign up to save it" (plain text, no link). Else → fall through to existing `shouldShowStoryCTA` block. The `isGuest` branch comes BEFORE the `shouldShowStoryCTA` call.

**Build Sequence:**
1. Fix drift check in `clarity-live-page.tsx` (critical sync fix)
2. Derive `isGuest` in `live-mode-view.tsx`, thread to all `LiveStoryCardExpanded` usages
3. Modify `PointRow` CTA in `live-story-card-expanded.tsx` for guest messaging
4. Run `./scripts/pre-commit-checks.sh`
5. Manual verification: two browsers, host + incognito guest

## Test Coverage Strategy

**What's Tested:**
- ✅ Guest CTA conditional rendering (unit) — `isGuest && userPosition` shows "sign up to save", hides "Tell your story"
- ✅ Authenticated user CTA preserved (unit) — no regression for existing behavior
- ✅ Own-story CTA suppression still works (unit) — `isOwnStory` interaction with `isGuest`
- ✅ Position sync end-to-end (UAT) — two-browser manual verification
- ✅ Polling fallback sync (UAT) — verifies drift check picks up position changes

**What's NOT Tested (rationale):**
- ❌ Drift check logic (unit) — The change is a single `JSON.stringify` comparison added to an existing OR expression. Testing this in isolation would require mocking the entire polling loop, which is more complex than the 1-line fix. Covered by UAT-1 and UAT-5.
- ❌ E2E position sync — Existing `e2e/p275-live-positions.spec.ts` covers the position lifecycle for authenticated users. Guest-specific E2E would require test infrastructure for unauthenticated session joining (not yet available). Covered by UAT.
- ❌ Integration/migration tests — No DB changes.
- ❌ Accessibility/smoke — No new components, no new routes.

**Test Pyramid:**
```
   /\
  /  \   0 E2E (existing p275 covers position flow)
 /____\
/ 6 UNIT \  (guest CTA rendering)
```

**Total:** 6 automated tests + 6 UAT scenarios
**Files:** `src/tests/p490-guest-position-cta.test.tsx`, `features/uat/p490.md`
