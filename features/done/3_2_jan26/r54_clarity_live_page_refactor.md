# R54: Refactor clarity-live-page.tsx God Component

**Status:** PLANNED
**Priority:** MEDIUM (maintainability, not blocking features)
**Est. Effort:** 4-6 hours
**Created:** 2026-01-11
**Identified By:** Code review of recent commits

---

## Problem

`src/app/pages/clarity-live-page.tsx` has grown to **2,330 lines** and exhibits the "God Component" anti-pattern:

| Metric | Current | Healthy Target |
|--------|---------|----------------|
| Lines of code | 2,330 | < 500 |
| useState hooks | 19 | < 8 |
| useRef hooks | 14 | < 5 |
| useCallback handlers | ~20 | Extract to hooks |
| console.log statements | 29 | 0 (use dev logger) |

**Risks:**
- Hard to test individual pieces in isolation
- Difficult onboarding for new developers
- Changes in one area risk breaking unrelated functionality
- Performance: entire component re-renders on any state change

---

## Root Cause

The file organically grew as features were added:
- P23: Check/Prove rating model
- P23.3: "Did I get it?" flow
- P28.1: Audio recording and events collection
- P37.2a: Consent mechanism
- P40/B48: Microphone permission gating
- Real-time sync with refs (subscription + polling fallback)

Each feature added ~100-300 lines without extracting shared concerns.

---

## Proposed Solution

Extract into focused modules following the existing codebase patterns:

### Phase 1: Extract Hooks (2-3 hours)

**1. `useClaritySession.ts`** - Session lifecycle management
```typescript
// Manages: session creation, joining, restoration, cleanup
// State: session, isCreator, roomCode, error, isLoading
// Functions: handleCreate, handleJoin, handleLeave, clearStoredSession
```

**2. `useLiveStateSync.ts`** - Real-time state synchronization
```typescript
// Manages: Supabase subscription, polling fallback, drift detection
// State: liveState, partnerLeft, sessionEnded
// Refs: hasJoinerRef, confirmedLiveStateRef, updateInFlightRef, etc.
// Functions: updateLiveState
```

**3. `useCheckProveFlow.ts`** - Rating flow logic
```typescript
// Manages: Check/Prove state machine, celebration, explain-back
// State: isLocallyRating, localFlowType
// Functions: handleStartCheck, handleStartProve, handleRatingSubmit,
//            handleExplainBackStart, handleExplainBackDone, etc.
```

### Phase 2: Extract Views (1-2 hours)

**4. Create `clarity-live-views/` folder:**
- `StartView.tsx` - Initial screen (create/join)
- `WaitingView.tsx` - Waiting for partner
- `LiveView.tsx` - Main meeting UI (wraps LiveModeView)
- `PartnerLeftView.tsx` - Partner departure screen

### Phase 3: Create Dev Logger (30 min)

**5. `lib/dev-logger.ts`** - Development-only logging
```typescript
export const devLog = import.meta.env.DEV
  ? console.log.bind(console)
  : () => {};

// Usage: devLog('[Live]', 'Session joined', code);
// In production: no-op, no bundle impact
```

---

## Acceptance Criteria

- [ ] Main component < 500 lines
- [ ] No useState/useRef hooks directly in main component (all in custom hooks)
- [ ] Each extracted hook has unit tests
- [ ] All 241 existing tests still pass
- [ ] E2E tests for live meeting still pass
- [ ] Real-time sync works identically (no regression in subscription/polling)
- [ ] No console.log statements in production bundle

---

## Implementation Notes

### Critical: Preserve Ref-Based Sync

The current ref pattern is **intentional** for real-time sync:

```typescript
// These refs prevent stale closures in subscription/polling callbacks
hasJoinerRef, lastJoinerNameRef, sessionCodeRef, currentSessionIdRef,
confirmedLiveStateRef, updateInFlightRef, partnerLeftRef,
sessionEndedRef, iAmLeavingRef
```

When extracting to hooks, ensure:
1. Refs are passed to callbacks correctly (no stale closures)
2. Guards (`if (iAmLeavingRef.current)`) work as expected
3. Subscription cleanup happens on unmount

### Testing Strategy

1. Write unit tests for each extracted hook BEFORE extraction
2. Use the existing integration (component tests + E2E) as regression tests
3. Extract one hook at a time, verify tests pass after each

---

## Files to Modify

| File | Action |
|------|--------|
| `src/app/pages/clarity-live-page.tsx` | Refactor to use extracted hooks/views |
| `src/hooks/useClaritySession.ts` | NEW - Session lifecycle |
| `src/hooks/useLiveStateSync.ts` | NEW - Real-time sync |
| `src/hooks/useCheckProveFlow.ts` | NEW - Rating flow |
| `src/app/pages/clarity-live-views/` | NEW - View components |
| `src/lib/dev-logger.ts` | NEW - Dev-only logging |
| `src/tests/useClaritySession.test.ts` | NEW - Hook tests |
| `src/tests/useLiveStateSync.test.ts` | NEW - Hook tests |

---

## Related Issues Fixed in Code Review

These were fixed separately (not part of this refactor):

| Issue | Status | Commit |
|-------|--------|--------|
| Missing aria-describedby on TermsUpdateDialog | Fixed | (pending) |
| Email validation too permissive | Fixed | (pending) |
| Session consent validation mismatch | Fixed | (pending) |
| E2E hardcoded 5s wait | Fixed | (pending) |

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-01-11 | Identified in code review | File exceeded maintainability threshold |
| 2026-01-11 | Chose hook extraction over file splitting | Preserves component lifecycle, easier testing |
| 2026-01-11 | Keep 29 console.logs until dev-logger created | They're useful for debugging realtime issues |
